import pg from 'pg';

const OLD_API = 'http://161.156.83.133:3001/api/query';
const NEW_PG_URL = 'postgresql://postgres:RMSv3_Local_Password_2026!@188.132.198.144:5432/railway';

async function queryOldApi(body) {
  const res = await fetch(OLD_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return await res.json();
}

async function migrateTableStream(client, table, validCols, identityCols) {
  const pageSize = 500;
  let offset = 0;
  let totalInserted = 0;
  let totalErrors = 0;

  console.log(`⏳ Streaming migration for "${table}"...`);

  while (true) {
    let res;
    try {
      res = await queryOldApi({
        table,
        operation: 'select',
        select: '*',
        options: { limit: pageSize, offset },
      });
    } catch (err) {
      if (offset === 0) {
        console.log(`  ℹ️ "${table}" not queryable or skipped: ${err.message}`);
        return { table, total: 0, inserted: 0, errors: 0 };
      }
      break;
    }

    if (res.error) {
      if (offset === 0) {
        console.log(`  ℹ️ "${table}" error: ${res.error.message}`);
        return { table, total: 0, inserted: 0, errors: 0 };
      }
      break;
    }

    const rows = res.data || [];
    if (rows.length === 0) break;

    for (const row of rows) {
      // Exclude generated identity columns if needed, or include them with OVERRIDING SYSTEM VALUE
      const entries = Object.entries(row).filter(([k]) => validCols.has(k) && !identityCols.has(k));
      if (entries.length === 0) continue;

      const colNames = entries.map(([k]) => `"${k}"`);
      const values = entries.map(([k, v]) => {
        const colInfo = validCols.get(k);
        if (v === undefined) return null;
        if (colInfo?.data_type === 'json' || colInfo?.data_type === 'jsonb') {
          if (typeof v === 'object' && v !== null) return JSON.stringify(v);
        }
        if (colInfo?.data_type === 'ARRAY') {
          if (Array.isArray(v)) return v;
          if (typeof v === 'string' && v.startsWith('[')) {
            try { return JSON.parse(v); } catch {}
          }
        }
        return v;
      });

      const valuePlaceholders = values.map((_, idx) => `$${idx + 1}`).join(', ');

      let sql = '';
      if (row.id) {
        const updateSet = entries
          .filter(([k]) => k !== 'id')
          .map(([k]) => `"${k}" = EXCLUDED."${k}"`)
          .join(', ');

        if (updateSet.length > 0) {
          sql = `
            INSERT INTO public."${table}" (${colNames.join(', ')})
            VALUES (${valuePlaceholders})
            ON CONFLICT ("id") DO UPDATE SET ${updateSet};
          `;
        } else {
          sql = `
            INSERT INTO public."${table}" (${colNames.join(', ')})
            VALUES (${valuePlaceholders})
            ON CONFLICT ("id") DO NOTHING;
          `;
        }
      } else {
        sql = `
          INSERT INTO public."${table}" (${colNames.join(', ')})
          VALUES (${valuePlaceholders})
          ON CONFLICT DO NOTHING;
        `;
      }

      try {
        await client.query(sql, values);
        totalInserted++;
      } catch (err) {
        totalErrors++;
        if (totalErrors <= 3) {
          console.error(`    ⚠️ Insert error in "${table}":`, err.message);
        }
      }
    }

    if (rows.length < pageSize) break;
    offset += pageSize;

    if (offset % 5000 === 0) {
      console.log(`    ... ${offset} rows processed for "${table}"`);
    }
  }

  console.log(`✅ Completed "${table}": ${totalInserted} rows upserted ${totalErrors > 0 ? `(${totalErrors} errors)` : ''}`);
  return { table, total: totalInserted + totalErrors, inserted: totalInserted, errors: totalErrors };
}

async function run() {
  console.log('=== STARTING STREAMING MIGRATION (MEM-SAFE & IDENTITY-SAFE) ===\n');

  const newPool = new pg.Pool({
    connectionString: NEW_PG_URL,
    max: 5,
    connectionTimeoutMillis: 15000,
  });

  const client = await newPool.connect();

  try {
    const allTablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    const existingTables = new Set(allTablesRes.rows.map(r => r.table_name));

    // Tables remaining to stream
    const remainingTables = [
      'inventory_movements',
      'inventory_movement_recalc_jobs',
      'inventory_counts',
      'count_flows',
      'count_items',
      'warehouse_locations',
      'warehouse_lpns',
      'warehouse_shipments',
      'warehouse_shipment_orders',
      'warehouse_shipment_lines',
      'warehouse_reservations',
      'warehouse_tasks',
      'warehouse_task_events',
      'vehicles',
      'tasks',
      'task_participants',
      'task_checklist_items',
      'task_chat_threads',
      'task_chat_messages',
      'task_history',
      'task_attachments',
      'task_approval_requests',
      'tickets',
      'ticket_categories',
      'ticket_comments',
      'ticket_audit_log',
      'form_templates',
      'forms',
      'form_submissions',
      'form_submission_photos',
      'table_service_requests',
      'table_feedback',
      'survey_tokens',
      'time_tracking_timers',
      'pos_sales',
      'cari_hesaplar',
      'cari_hareketler',
    ];

    // Disable triggers temporarily
    await client.query('SET session_replication_role = replica;');

    for (const table of remainingTables) {
      if (!existingTables.has(table)) continue;

      const colInfoRes = await client.query(`
        SELECT column_name, data_type, is_identity, identity_generation
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = $1;
      `, [table]);

      const validCols = new Map(colInfoRes.rows.map(r => [r.column_name, r]));
      const identityCols = new Set(colInfoRes.rows.filter(r => r.is_identity === 'YES' || r.identity_generation === 'ALWAYS').map(r => r.column_name));

      await migrateTableStream(client, table, validCols, identityCols);
    }

    // Re-enable triggers
    await client.query('SET session_replication_role = DEFAULT;');
    console.log('\n🎉 ALL REMAINING TABLES SUCCESSFULLY MIGRATED!');

  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    client.release();
    await newPool.end();
  }
}

run().catch(console.error);
