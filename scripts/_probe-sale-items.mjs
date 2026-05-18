import pg from 'pg'
const { Client } = pg

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})
await client.connect()

const { rows } = await client.query(`
  select id, name, sku, sale_cat_l1, sale_cat_l2,
         jsonb_array_length(coalesce(channel_prices,'[]'::jsonb)) as cp_len,
         jsonb_array_length(coalesce(recipe_rows,'[]'::jsonb)) as rr_len
  from sale_items where deleted_at is null order by name
`)
console.log(JSON.stringify(rows, null, 2))

const { rows: cats } = await client.query(`
  select id, name, parent_id from sale_categories where deleted_at is null order by name
`)
console.log('CATEGORIES:', JSON.stringify(cats, null, 2))

const { rows: channels } = await client.query(`
  select id, name from sales_channels where deleted_at is null and active = true order by sort_order
`)
console.log('CHANNELS:', JSON.stringify(channels, null, 2))

const { rows: taxes } = await client.query(`
  select id, name, rate from taxes where deleted_at is null order by rate
`)
console.log('TAXES:', JSON.stringify(taxes, null, 2))

await client.end()
