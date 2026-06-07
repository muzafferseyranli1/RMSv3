const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway',
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  await client.connect();
  console.log('Connected');

  const queries = [
    `ALTER TABLE public.manual_pages ADD COLUMN IF NOT EXISTS linked_item_id UUID`,
    `ALTER TABLE public.manual_pages ADD COLUMN IF NOT EXISTS linked_item_type VARCHAR(50)`,
    `ALTER TABLE public.manual_pages ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'`,
    `ALTER TABLE public.manual_pages ADD COLUMN IF NOT EXISTS equipment_ids UUID[] DEFAULT '{}'`,
    `ALTER TABLE public.manual_pages ADD COLUMN IF NOT EXISTS is_draft BOOLEAN DEFAULT false`,
    `CREATE INDEX IF NOT EXISTS idx_manual_pages_linked_item_id ON public.manual_pages(linked_item_id)`,
  ];

  for (const q of queries) {
    try {
      await client.query(q);
      console.log('OK:', q.substring(0, 70));
    } catch (e) {
      console.error('ERR:', e.message.substring(0, 80));
    }
  }

  const res = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name='manual_pages' AND table_schema='public' ORDER BY ordinal_position`);
  console.log('\nColumns:', res.rows.map(r => r.column_name).join(', '));

  await client.end();
  console.log('Done!');
}

migrate().catch(e => { console.error(e); process.exit(1); });
