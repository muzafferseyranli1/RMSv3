import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Client } = pg

const DATABASE_URL = process.env.DATABASE_URL || ''
const DATABASE_SSL = process.env.DATABASE_SSL === 'true'

if (!DATABASE_URL) {
  console.error('DATABASE_URL zorunludur. Migration 004 icin Railway Postgres baglantisini env ile verin.')
  process.exit(1)
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const migrationPath = path.resolve(__dirname, '..', 'migrations', '004_mobile_qr_service_requests.sql')

async function main() {
  const sql = await fs.readFile(migrationPath, 'utf8')
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: DATABASE_SSL ? { rejectUnauthorized: false } : false,
  })

  await client.connect()
  try {
    await client.query('begin')
    await client.query(sql)
    await client.query('commit')
    console.log('Migration 004 applied successfully.')
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    await client.end()
  }
}

main().catch(error => {
  console.error('Migration 004 failed:', error?.message || error)
  process.exit(1)
})
