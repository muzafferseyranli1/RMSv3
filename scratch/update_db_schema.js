const { Client } = require('pg');

const databaseUrl = 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway';

async function run() {
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to the database successfully.');

    // 1. Update normalize_sales_channel_key to support Hızlı Satış with Turkish letters
    const updateFunctionSql = `
      CREATE OR REPLACE FUNCTION public.normalize_sales_channel_key(channel_name text)
      RETURNS text AS $$
      DECLARE
        v_normalized text;
      BEGIN
        v_normalized := lower(trim(channel_name));
        IF v_normalized IS NULL OR v_normalized = '' THEN
          RETURN 'pos';
        END IF;
        
        IF v_normalized IN ('call_center', 'call center', 'cagri_merkezi', 'cagri merkezi', 'çağrı merkezi') THEN
          RETURN 'call_center';
        ELSIF v_normalized IN ('masa', 'garson', 'waiter', 'table_service', 'table') THEN
          RETURN 'masa';
        ELSIF v_normalized IN ('kiosk') THEN
          RETURN 'kiosk';
        ELSIF v_normalized IN ('mobile', 'mobil') THEN
          RETURN 'mobile';
        ELSIF v_normalized IN ('online', 'web') THEN
          RETURN 'online';
        ELSIF v_normalized IN ('hizli_satis', 'hizli satis', 'hızlı satış', 'hızlı satis', 'hizli satış', 'quick', 'quick_service', 'quick service', 'pos') THEN
          RETURN 'pos';
        ELSE
          RETURN v_normalized;
        END IF;
      END;
      $$ LANGUAGE plpgsql IMMUTABLE;
    `;

    console.log('Updating normalize_sales_channel_key function...');
    await client.query(updateFunctionSql);
    console.log('normalize_sales_channel_key function updated successfully!');

  } catch (e) {
    console.error('Error:', e);
  } finally {
    await client.end();
  }
}

run();
