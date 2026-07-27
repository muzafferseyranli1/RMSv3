const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const sep = line.indexOf('=');
      if (sep === -1) continue;
      const key = line.slice(0, sep).trim();
      let val = line.slice(sep + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}
loadEnv();

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL environment variable is missing.");
    process.exit(1);
  }
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  try {
    console.log('Connected to PG. Running schema migrations...');
    
    // Create personnel_notifications table and index
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.personnel_notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        personnel_id TEXT NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(50) NOT NULL,
        related_id VARCHAR(255),
        is_read BOOLEAN DEFAULT false NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_personnel_notifications_personnel ON public.personnel_notifications (personnel_id);
    `);
    console.log('Created personnel_notifications table and index successfully.');
  } catch (e) {
    console.error('Migration failed:', e);
  } finally {
    await pool.end();
  }
}

main();
