import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Client } = pg

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function getDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL
  }
  
  try {
    const envPath = path.resolve(__dirname, '..', 'server', '.env')
    const content = await fs.readFile(envPath, 'utf8')
    const lines = content.split(/\r?\n/)
    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const separatorIndex = line.indexOf('=')
      if (separatorIndex === -1) continue
      const key = line.slice(0, separatorIndex).trim()
      if (key === 'DATABASE_URL') {
        let value = line.slice(separatorIndex + 1).trim()
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1)
        }
        return value
      }
    }
  } catch (err) {
    // ignore
  }
  return null
}

const migrationPath = path.resolve(__dirname, '..', 'migrations', '013_loyalty_period_sold_product_quantity_channel.sql')

async function main() {
  const DATABASE_URL = await getDatabaseUrl()
  if (!DATABASE_URL) {
    console.error('DATABASE_URL is required. Set it in environment or define it in server/.env.')
    process.exit(1)
  }

  const sql = await fs.readFile(migrationPath, 'utf8')
  
  // Connect and apply migration
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('rlwy.net') || DATABASE_URL.includes('supabase') ? { rejectUnauthorized: false } : false,
  })

  await client.connect()
  try {
    await client.query('begin')
    await client.query(sql)
    await client.query('commit')
    console.log('Migration 013 applied successfully.')
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    await client.end()
  }
}

main().catch(error => {
  console.error('Migration 013 failed:', error?.message || error)
  process.exit(1)
})
