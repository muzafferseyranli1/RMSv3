import pg from 'pg'

async function applySchemas() {
  const { Client } = pg
  const client = new Client({
    connectionString: 'postgresql://postgres:RMSv3_Local_Password_2026!@188.132.198.144:5432/railway'
  })

  try {
    await client.connect()
    console.log('Connected to PostgreSQL')

    // 1. Franchise Suggestions Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS franchise_suggestions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        franchise_node_id VARCHAR(255) NOT NULL,
        franchise_name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL, -- 'PRODUCT', 'STOCK_ITEM', 'COMBO_MENU', 'OPTION_GROUP', 'SUPPLIER', 'CAMPAIGN'
        item_name VARCHAR(255),
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        reason TEXT,
        recipe TEXT,
        sales_expectation TEXT,
        notes TEXT,
        status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED'
        reviewer_note TEXT,
        reviewed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_franchise_suggestions_status ON franchise_suggestions(status);
      CREATE INDEX IF NOT EXISTS idx_franchise_suggestions_type ON franchise_suggestions(type);
      CREATE INDEX IF NOT EXISTS idx_franchise_suggestions_node ON franchise_suggestions(franchise_node_id);
    `)
    console.log('✅ Created franchise_suggestions table')

    // 2. Franchise Price Change Requests Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS franchise_price_change_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        franchise_node_id VARCHAR(255) NOT NULL,
        franchise_name VARCHAR(255) NOT NULL,
        branch_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        product_id VARCHAR(255),
        product_name VARCHAR(255),
        current_price NUMERIC(12, 4) DEFAULT 0,
        requested_price NUMERIC(12, 4) NOT NULL,
        reason TEXT,
        status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED'
        reviewer_note TEXT,
        reviewed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_franchise_price_requests_status ON franchise_price_change_requests(status);
      CREATE INDEX IF NOT EXISTS idx_franchise_price_requests_node ON franchise_price_change_requests(franchise_node_id);
    `)
    console.log('✅ Created franchise_price_change_requests table')

    await client.end()
  } catch (err) {
    console.error('SQL Error:', err)
  }

  process.exit(0)
}

applySchemas()
