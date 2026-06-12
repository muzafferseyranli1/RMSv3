const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

function loadServerEnv() {
  const envPath = path.join(__dirname, '../server/.env')
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

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error("DATABASE_URL is missing.")
  process.exit(1)
}

async function run() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } })
  await client.connect()
  console.log('Connected to DB')

  const tables = ['product_external_barcodes', 'units', 'vehicles', 'warehouse_shipment_lines', 'warehouse_shipments']
  for (const table of tables) {
    const cols = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `, [table])
    console.log(`\nTable: ${table}`)
    cols.rows.forEach(r => {
      console.log(`  ${r.column_name}: ${r.data_type}`)
    })
  }

  await client.end()
}

run().catch(console.error)
