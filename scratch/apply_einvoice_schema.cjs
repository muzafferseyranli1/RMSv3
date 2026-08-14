const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const connectionString = 'postgresql://postgres:RMSv3_Local_Password_2026!@188.132.198.144:5432/railway';

async function main() {
  const pool = new Pool({
    connectionString,
    ssl: false,
  });

  try {
    console.log('Connecting to VPS PostgreSQL...');
    const client = await pool.connect();
    console.log('Connected! Reading SQL schema file...');

    const sqlPath = path.resolve(__dirname, '..', 'sql', 'einvoice_phase1_schema.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    console.log('Executing einvoice_phase1_schema.sql...');
    await client.query(sqlContent);
    console.log('Schema executed successfully!');

    // Check tables
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('e_integrator_configs', 'e_invoices', 'e_invoice_lines', 'e_document_responses', 'e_invoice_matching_logs')
      ORDER BY table_name;
    `);

    console.log('Verified created tables:', tablesRes.rows.map(r => r.table_name));

    // Ensure default config exists
    const configCheck = await client.query(`SELECT id FROM public.e_integrator_configs LIMIT 1;`);
    if (configCheck.rows.length === 0) {
      await client.query(`
        INSERT INTO public.e_integrator_configs (
          provider, sender_vkn_tckn, sender_title, sender_tax_office, sender_address,
          alias_pk, alias_gb, is_active, is_test_mode
        ) VALUES (
          'mock', '1234567890', 'SuitableRMS Restoran Grubu A.Ş.', 'Beşiktaş',
          'Nispetiye Cad. No:12 Beşiktaş / İstanbul', 'urn:mail:defaultpk@gib.gov.tr',
          'urn:mail:defaultgb@gib.gov.tr', true, true
        );
      `);
      console.log('Inserted default Mock Integrator config.');
    } else {
      console.log('Default integrator config already present.');
    }

    client.release();
  } catch (err) {
    console.error('Error applying migration:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
