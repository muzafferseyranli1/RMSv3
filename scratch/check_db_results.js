import pg from 'pg';
import fs from 'fs';
import path from 'path';

// Parse server/.env manually
const envPath = 'X:\\\\RMSv3\\server\\.env';
const envContent = fs.readFileSync(envPath, 'utf8');
let databaseUrl = '';
for (const line of envContent.split('\n')) {
  if (line.trim().startsWith('DATABASE_URL=')) {
    databaseUrl = line.split('=')[1].trim().replace(/^['"]|['"]$/g, '');
  }
}

async function run() {
  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  try {
    console.log('--- 1. EN SON SATIŞ BİLGİLERİ (sales) ---');
    const salesRes = await client.query(`
      SELECT id, local_id, sale_no, sale_datetime, status, source, customer_name, gross_total_before_discount, discount_amount, gross_total_after_discount,
             loyalty_campaign_id, loyalty_campaign_name, loyalty_selected_coupon_code, loyalty_applied_actions_json, loyalty_decision_context_json,
             sales_channel_id, sales_channel_name, personnel_id, personnel_name
      FROM sales
      ORDER BY created_at DESC, sale_datetime DESC
      LIMIT 1
    `);
    
    if (salesRes.rows.length === 0) {
      console.log('Hiç satış bulunamadı!');
      return;
    }
    
    const lastSale = salesRes.rows[0];
    console.log(JSON.stringify(lastSale, null, 2));
    
    console.log('\n--- 2. EN SON SATIŞIN SATIRLARI (sale_lines) ---');
    const linesRes = await client.query(`
      SELECT id, sale_id, line_no, product_name, qty, unit_gross_before_discount, line_gross_before_discount, line_gross_after_discount, options_json
      FROM sale_lines
      WHERE sale_id = $1
      ORDER BY line_no ASC
    `, [lastSale.id]);
    console.log(JSON.stringify(linesRes.rows, null, 2));

    console.log('\n--- 3. EN SON SATIŞIN ÖDEMELERİ (sale_payments) ---');
    const paymentsRes = await client.query(`
      SELECT id, sale_id, payment_method, payment_method_label, amount
      FROM sale_payments
      WHERE sale_id = $1
    `, [lastSale.id]);
    console.log(JSON.stringify(paymentsRes.rows, null, 2));

    console.log('\n--- 4. EN SON LİMİT/LEGACY SATIŞ BİLGİLERİ (pos_sales) ---');
    const posSalesRes = await client.query(`
      SELECT local_id, masa_no, odeme, alinan, toplam, tarih, items
      FROM pos_sales
      WHERE local_id = $1
    `, [lastSale.local_id]);
    console.log(JSON.stringify(posSalesRes.rows, null, 2));

    console.log('\n--- 5. EN SON KULLANILAN KUPONUN DURUMU (loyalty_coupons) ---');
    let couponCodeQuery = 'SELECT id, code, is_used, redemption_status, redeemed_by_customer_id, redeemed_source_ref_id, used_at FROM loyalty_coupons WHERE is_used = true OR redemption_status = \'used\' ORDER BY updated_at DESC LIMIT 3';
    if (lastSale.loyalty_selected_coupon_code) {
      couponCodeQuery = {
        text: 'SELECT id, code, is_used, redemption_status, redeemed_by_customer_id, redeemed_source_ref_id, used_at FROM loyalty_coupons WHERE code = $1',
        values: [lastSale.loyalty_selected_coupon_code]
      };
    }
    const couponsRes = await client.query(couponCodeQuery);
    console.log(JSON.stringify(couponsRes.rows, null, 2));

    console.log('\n--- 6. KAMPANYA KULLANIM KAYITLARI (loyalty_campaign_redemptions) ---');
    const redemptionsRes = await client.query(`
      SELECT id, campaign_id, customer_id, redemption_status, source_ref_id, redeemed_value, redeemed_at
      FROM loyalty_campaign_redemptions
      WHERE source_ref_id = $1
    `, [lastSale.id]);
    console.log(JSON.stringify(redemptionsRes.rows, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}
run();

