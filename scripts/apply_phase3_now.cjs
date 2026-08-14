const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

const envPath = path.join(__dirname, '../server/.env')
let connectionString = 'postgresql://postgres:RMSv3_Local_Password_2026!@188.132.198.144:5432/railway'

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8')
  const match = content.match(/DATABASE_URL=([^\r\n]+)/)
  if (match) connectionString = match[1].trim()
}

const pool = new Pool({
  connectionString,
  connectionTimeoutMillis: 10000,
})

async function run() {
  try {
    console.log('Connecting to Postgres at:', connectionString.replace(/:[^:@]+@/, ':***@'))
    const client = await pool.connect()
    console.log('Connected successfully!')

    const sqlPath = path.join(__dirname, '../sql/einvoice_phase3_company_schema.sql')
    const sql = fs.readFileSync(sqlPath, 'utf8')
    console.log('Applying SQL migration...')
    await client.query(sql)
    console.log('SQL Migration applied successfully!')

    const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'company_nodes' AND column_name IN ('tax_number', 'legal_title', 'tax_office', 'legal_address', 'is_legal_entity', 'parent_legal_entity_id');
    `)
    console.log('Verified company_nodes columns:', res.rows)

    const invRes = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'e_invoices' AND column_name IN ('is_inter_company', 'source_transfer_doc_no', 'origin_node_id', 'destination_node_id');
    `)
    console.log('Verified e_invoices columns:', invRes.rows)

    client.release()
    await pool.end()
    process.exit(0)
  } catch (err) {
    console.error('Migration error:', err)
    await pool.end()
    process.exit(1)
  }
}

run()
