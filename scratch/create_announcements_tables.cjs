const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

function loadServerEnv() {
  const envPath = path.join(__dirname, '../server/.env')
  if (!fs.existsSync(envPath)) {
    console.log('No server env file found at:', envPath)
    return
  }

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
    console.log('Creating announcements table...')
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.announcements (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          title VARCHAR(255) NOT NULL,
          content TEXT NOT NULL,
          target_type VARCHAR(50) NOT NULL,
          target_id VARCHAR(255),
          priority VARCHAR(20) NOT NULL DEFAULT 'normal',
          request_read_receipt BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
          created_by_personnel_id TEXT NOT NULL,
          deleted_at TIMESTAMP WITH TIME ZONE
      );
    `)
    
    console.log('Creating announcement_reads table...')
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.announcement_reads (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
          personnel_id TEXT NOT NULL,
          read_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
      );
    `)
    
    console.log('Tables created successfully!')
  } catch (err) {
    console.error('Error running migration:', err)
  } finally {
    client.release()
    await pool.end()
  }
}

run()
