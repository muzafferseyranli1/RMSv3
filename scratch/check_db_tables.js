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

  // Check tables matching 'package', 'unit', 'vehicle', 'capacity', 'shipment'
  const resTables = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND (table_name LIKE '%package%' 
           OR table_name LIKE '%unit%' 
           OR table_name LIKE '%vehicle%' 
           OR table_name LIKE '%capacity%' 
           OR table_name LIKE '%shipment%'
           OR table_name LIKE '%barcode%')
    ORDER BY table_name
  `)
  console.log('Matching Tables:', resTables.rows.map(r => r.table_name))

  // Check functions/RPCs matching 'capacity' or 'complete' or 'shipment'
  const resRpcs = await client.query(`
    SELECT routine_name 
    FROM information_schema.routines 
    WHERE routine_schema = 'public' 
      AND (routine_name LIKE '%capacity%' 
           OR routine_name LIKE '%complete_warehouse%'
           OR routine_name LIKE '%shipment%')
    ORDER BY routine_name
  `)
  console.log('Matching RPCs/Functions:', resRpcs.rows.map(r => r.routine_name))

  await client.end()
}

run().catch(console.error)
