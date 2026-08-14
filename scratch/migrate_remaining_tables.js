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

async function migrateRemaining() {
  const newPool = new pg.Pool({ connectionString: NEW_PG_URL, connectionTimeoutMillis: 10000 });
  const client = await newPool.connect();

  const tablesToMigrate = [
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
    'form_submissions',
    'form_submission_photos',
    'table_service_requests',
    'table_feedback',
    'survey_tokens',
    'time_tracking_timers',
    'vehicles',
    'warehouse_locations',
    'warehouse_lpns',
    'warehouse_shipments',
    'warehouse_shipment_orders',
    'warehouse_shipment_lines',
    'warehouse_reservations',
    'warehouse_tasks',
    'warehouse_task_events',
    'pos_sales',
    'customer_addresses',
    'kiosk_operating_hours_rules',
  ];

  await client.query('SET session_replication_role = replica;');

  for (const table of tablesToMigrate) {
    try {
      const colInfoRes = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = $1;
      `, [table]);

      if (colInfoRes.rows.length === 0) {
        console.log(`Table ${table} does not exist in target DB.`);
        continue;
      }

      const validCols = new Map(colInfoRes.rows.map(r => [r.column_name, r]));

      const oldRes = await queryOldApi({
        table,
        operation: 'select',
        select: '*',
      });

      const rows = oldRes.data || [];
      if (rows.length === 0) continue;

      let inserted = 0;
      for (const row of rows) {
        const entries = Object.entries(row).filter(([k]) => validCols.has(k));
        if (entries.length === 0) continue;

        const colNames = entries.map(([k]) => `"${k}"`);
        const values = entries.map(([k, v]) => {
          const colInfo = validCols.get(k);
          if (v === undefined) return null;
          if (colInfo?.data_type === 'json' || colInfo?.data_type === 'jsonb') {
            if (typeof v === 'object' && v !== null) return JSON.stringify(v);
          }
          return v;
        });

        const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
        let sql = '';
        if (row.id) {
          const updateSet = entries
            .filter(([k]) => k !== 'id')
            .map(([k]) => `"${k}" = EXCLUDED."${k}"`)
            .join(', ');

          sql = updateSet.length > 0
            ? `INSERT INTO public."${table}" (${colNames.join(', ')}) VALUES (${placeholders}) ON CONFLICT ("id") DO UPDATE SET ${updateSet};`
            : `INSERT INTO public."${table}" (${colNames.join(', ')}) VALUES (${placeholders}) ON CONFLICT ("id") DO NOTHING;`;
        } else {
          sql = `INSERT INTO public."${table}" (${colNames.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING;`;
        }

        try {
          await client.query(sql, values);
          inserted++;
        } catch (e) {
          // ignore
        }
      }

      console.log(`✅ Migrated "${table}": ${inserted} / ${rows.length} rows.`);
    } catch (err) {
      console.log(`  Error on ${table}:`, err.message);
    }
  }

  await client.query('SET session_replication_role = DEFAULT;');
  client.release();
  await newPool.end();
}

migrateRemaining().catch(console.error);
