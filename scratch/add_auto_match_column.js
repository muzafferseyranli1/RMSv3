import pg from 'pg'

async function addAutoMatchColumn() {
  const { Client } = pg
  const client = new Client({
    connectionString: 'postgresql://postgres:RMSv3_Local_Password_2026!@188.132.198.144:5432/railway'
  })

  try {
    await client.connect()
    await client.query('ALTER TABLE e_invoices ADD COLUMN IF NOT EXISTS is_auto_matched BOOLEAN DEFAULT FALSE;')
    console.log('✅ PostgreSQL column is_auto_matched added successfully to e_invoices table!')
    await client.end()
  } catch (err) {
    console.error('PG connect error:', err)
  }

  process.exit(0)
}

addAutoMatchColumn()
