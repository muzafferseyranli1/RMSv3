const { Pool } = require('pg')
const path = require('path')
const fs = require('fs')

function loadServerEnv() {
  const envPath = path.join(__dirname, '..', 'server', '.env')
  if (!fs.existsSync(envPath)) return

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separatorIndex = line.indexOf('=')
    if (separatorIndex === -1) continue

    const key = line.slice(0, separatorIndex).trim()
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue

    let value = line.slice(separatorIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

loadServerEnv()

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
})

async function run() {
  const client = await pool.connect()
  try {
    console.log('Starting migration to switch manual_page_equipments from definitions to instances...')
    
    await client.query('BEGIN')

    // 1. Delete existing data from manual_page_equipments since old UUIDs won't match physical instances
    console.log('Clearing old associations...')
    await client.query('DELETE FROM public.manual_page_equipments;')

    // 2. Drop the old foreign key constraint pointing to equipment_definitions
    console.log('Dropping old constraints...')
    await client.query(`
      ALTER TABLE public.manual_page_equipments
      DROP CONSTRAINT IF EXISTS manual_page_equipments_eq_def_fkey;
    `)
    await client.query(`
      ALTER TABLE public.manual_page_equipments
      DROP CONSTRAINT IF EXISTS manual_page_equipments_pkey;
    `)

    // 3. Rename column from equipment_definition_id to equipment_instance_id
    console.log('Renaming column...')
    await client.query(`
      ALTER TABLE public.manual_page_equipments
      RENAME COLUMN equipment_definition_id TO equipment_instance_id;
    `)

    // 4. Create new primary key and foreign key pointing to equipment_instances
    console.log('Adding new constraints pointing to equipment_instances...')
    await client.query(`
      ALTER TABLE public.manual_page_equipments
      ADD CONSTRAINT manual_page_equipments_pkey PRIMARY KEY (page_id, equipment_instance_id);
    `)
    await client.query(`
      ALTER TABLE public.manual_page_equipments
      ADD CONSTRAINT manual_page_equipments_eq_instance_fkey
      FOREIGN KEY (equipment_instance_id) REFERENCES public.equipment_instances(id) ON DELETE CASCADE;
    `)

    await client.query('COMMIT')
    console.log('Migration completed successfully!')
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Migration failed:', err)
  } finally {
    client.release()
    await pool.end()
  }
}

run()
