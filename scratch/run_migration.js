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

async function fetchAllRowsFromOld(table) {
  const allRows = [];
  const limit = 1000;
  let offset = 0;

  while (true) {
    const res = await queryOldApi({
      table,
      operation: 'select',
      select: '*',
      options: { limit, offset },
    });

    if (res.error) {
      // Table might not exist or error
      throw new Error(res.error.message);
    }

    const rows = res.data || [];
    if (rows.length === 0) break;
    allRows.push(...rows);
    if (rows.length < limit) break;
    offset += limit;
  }

  return allRows;
}

async function migrate() {
  console.log('=== STARTING COMPLETE DATA MIGRATION FROM OLD VPS (161.156.83.133) TO NEW VPS (188.132.198.144) ===\n');

  const newPool = new pg.Pool({
    connectionString: NEW_PG_URL,
    max: 5,
    connectionTimeoutMillis: 10000,
  });

  const client = await newPool.connect();

  try {
    // Get all tables in new DB
    const allTablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    const existingTables = new Set(allTablesRes.rows.map(r => r.table_name));

    // Desired migration table order to respect core dependencies
    const priorityTables = [
      'settings',
      'company_nodes',
      'taxes',
      'units',
      'sales_channels',
      'categories',
      'sale_categories',
      'semi_categories',
      'item_categories',
      'suppliers',
      'stock_items',
      'stock_templates',
      'semi_items',
      'recipes',
      'recipe_items',
      'sale_items',
      'sale_options',
      'sale_templates',
      'product_external_barcodes',
      'contracts',
      'branch_templates',
      'branch_addresses',
      'branch_service_coverage',
      'branch_shift_presets',
      'branch_shift_schedule_entries',
      'pos_terminals',
      'equipments',
      'equipment_definitions',
      'equipment_instances',
      'manual_pages',
      'manual_page_equipments',
      'loyalty_programs',
      'loyalty_tiers',
      'loyalty_campaigns',
      'loyalty_campaign_rules',
      'loyalty_campaign_conflict_groups',
      'loyalty_customer_categories',
      'loyalty_customer_category_members',
      'loyalty_coupon_series',
      'loyalty_coupons',
      'loyalty_referral_programs',
      'loyalty_referral_codes',
      'loyalty_referral_tracking',
      'loyalty_reward_entitlements',
      'loyalty_wallets',
      'loyalty_frequency_progress',
      'loyalty_transactions',
      'purchase_orders',
      'purchase_order_lines',
      'purchase_receipts',
      'purchase_receipt_lines',
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
      'sales',
      'sale_lines',
      'sale_payments',
      'cari_hesaplar',
      'cari_hareketler',
    ];

    // Add any remaining tables
    for (const t of existingTables) {
      if (!priorityTables.includes(t)) priorityTables.push(t);
    }

    // Disable triggers temporarily on new DB during bulk insert
    await client.query('SET session_replication_role = replica;');

    const results = [];

    for (const table of priorityTables) {
      if (!existingTables.has(table)) {
        continue;
      }

      // Fetch column names and data types for the table in new DB
      const colInfoRes = await client.query(`
        SELECT column_name, data_type, udt_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = $1;
      `, [table]);
      const validCols = new Map(colInfoRes.rows.map(r => [r.column_name, r]));

      let oldRows = [];
      try {
        oldRows = await fetchAllRowsFromOld(table);
      } catch (err) {
        // Table not queryable or not on old VPS
        continue;
      }

      if (oldRows.length === 0) {
        continue;
      }

      console.log(`⏳ Migrating "${table}" (${oldRows.length} rows)...`);

      let inserted = 0;
      let updated = 0;
      let skipped = 0;
      let errors = 0;

      // Batch insert / upsert in chunks of 100
      const chunkSize = 100;
      for (let i = 0; i < oldRows.length; i += chunkSize) {
        const chunk = oldRows.slice(i, i + chunkSize);

        for (const row of chunk) {
          // Filter only columns that exist in the target table
          const entries = Object.entries(row).filter(([k]) => validCols.has(k));
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
            // Upsert on ID
            const updateSet = entries
              .filter(([k]) => k !== 'id')
              .map(([k], idx) => `"${k}" = EXCLUDED."${k}"`)
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
            inserted++;
          } catch (err) {
            errors++;
            if (errors <= 3) {
              console.error(`  ⚠️ Row insert error in "${table}":`, err.message);
            }
          }
        }
      }

      console.log(`✅ Completed "${table}": ${inserted} rows upserted ${errors > 0 ? `(${errors} errors)` : ''}`);
      results.push({ table, totalOld: oldRows.length, inserted, errors });
    }

    // Re-enable triggers on new DB
    await client.query('SET session_replication_role = DEFAULT;');

    console.log('\n================== MIGRATION SUMMARY ==================');
    results.forEach(r => {
      console.log(` • ${r.table.padEnd(35)}: ${String(r.inserted).padStart(5)} / ${r.totalOld} rows`);
    });
    console.log('=======================================================\n');

  } catch (err) {
    console.error('Fatal Migration Error:', err);
  } finally {
    client.release();
    await newPool.end();
  }
}

migrate().catch(console.error);
