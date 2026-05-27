const { Client } = require('pg');

const connectionString = 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway';

async function main() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database.');

    // 1. Drop existing constraint
    console.log('Dropping existing constraint...');
    await client.query('ALTER TABLE public.form_templates DROP CONSTRAINT IF EXISTS form_templates_type_check;');

    // 2. Add new constraint including 'notification_form'
    console.log('Adding new constraint including "notification_form"...');
    await client.query(`
      ALTER TABLE public.form_templates ADD CONSTRAINT form_templates_type_check CHECK (
        form_type = ANY (ARRAY['inspection','customer_survey','personnel_survey','checklist','notification_form'])
      );
    `);

    console.log('Constraint successfully updated!');
  } catch (error) {
    console.error('Error during migration:', error);
  } finally {
    await client.end();
  }
}

main();
