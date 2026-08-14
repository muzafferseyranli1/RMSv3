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

async function runFastBatch() {
  console.log('⚡ Starting Fast Batch Migration...');
  const pool = new pg.Pool({ connectionString: NEW_PG_URL, connectionTimeoutMillis: 10000 });
  const client = await pool.connect();

  const tables = [
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
  ];

  await client.query('SET session_replication_role = replica;');

  for (const table of tables) {
    try {
      const colInfo = await client.query(`
        SELECT column_name, data_type, is_identity, identity_generation
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = $1;
      `, [table]);

      if (colInfo.rows.length === 0) continue;
      const validCols = new Map(colInfo.rows.map(r => [r.column_name, r]));
      const idCols = new Set(colInfo.rows.filter(r => r.is_identity === 'YES' || r.identity_generation === 'ALWAYS').map(r => r.column_name));

      const oldRes = await queryOldApi({ table, operation: 'select', select: '*' });
      const rows = oldRes.data || [];
      if (rows.length === 0) continue;

      // Batch insert in groups of 50
      let inserted = 0;
      for (let i = 0; i < rows.length; i += 50) {
        const chunk = rows.slice(i, i + 50);
        for (const row of chunk) {
          const entries = Object.entries(row).filter(([k]) => validCols.has(k) && !idCols.has(k));
          if (entries.length === 0) continue;

          const colNames = entries.map(([k]) => `"${k}"`);
          const values = entries.map(([k, v]) => {
            const c = validCols.get(k);
            if (v === undefined) return null;
            if (c?.data_type === 'json' || c?.data_type === 'jsonb') {
              if (typeof v === 'object' && v !== null) return JSON.stringify(v);
            }
            return v;
          });

          const placeholders = values.map((_, idx) => `$${idx + 1}`).join(', ');
          const sql = `INSERT INTO public."${table}" (${colNames.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING;`;
          try {
            await client.query(sql, values);
            inserted++;
          } catch (e) {}
        }
      }

      console.log(`✅ Table "${table}": ${inserted} / ${rows.length} rows`);
    } catch (err) {
      console.log(`Table ${table} skip: ${err.message}`);
    }
  }

  await client.query('SET session_replication_role = DEFAULT;');
  client.release();
  await pool.end();
  console.log('🎉 Fast batch completed!');
}

runFastBatch().catch(console.error);
