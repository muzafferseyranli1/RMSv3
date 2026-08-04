import pg from 'pg';
import { randomUUID } from 'node:crypto';

const { Client } = pg;

const DB_URL = 'postgresql://postgres:RMSv3_Local_Password_2026!@188.132.198.144:5432/railway';

const KADIKOY_BRANCH_ID = '4e488f4b-669d-4279-8f0d-0fd382fe1d87';
const BESIKTAS_BRANCH_ID = '7f82e140-5219-4a92-911e-2894b9148c12';
const HOLDING_ID = '11111111-1111-4111-a111-111111111111';

async function seedData() {
  const client = new Client({ connectionString: DB_URL, ssl: false });
  await client.connect();
  console.log('Connected to VPS Postgres.');

  try {
    // 1. Seed Company Nodes
    console.log('1. Seeding company_nodes...');
    await client.query(`
      INSERT INTO public.company_nodes (id, parent_id, name, type, can_sell, created_at, updated_at)
      VALUES 
        ('${HOLDING_ID}', NULL, 'Suitable RMS Holding', 'sirket', false, now(), now()),
        ('${KADIKOY_BRANCH_ID}', '${HOLDING_ID}', 'Kadıköy Şubesi', 'sube', true, now(), now()),
        ('${BESIKTAS_BRANCH_ID}', '${HOLDING_ID}', 'Beşiktaş Şubesi', 'sube', true, now(), now())
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, can_sell = EXCLUDED.can_sell;
    `);

    // 2. Seed Sale Categories
    console.log('2. Seeding sale_categories...');
    const categories = [
      { id: '11111111-0000-0000-0000-000000000001', name: 'Burgerler' },
      { id: '11111111-0000-0000-0000-000000000002', name: 'Tavuk Ürünleri' },
      { id: '11111111-0000-0000-0000-000000000003', name: 'Atıştırmalıklar' },
      { id: '11111111-0000-0000-0000-000000000004', name: 'Soğuk İçecekler' },
      { id: '11111111-0000-0000-0000-000000000005', name: 'Sıcak İçecekler' },
      { id: '11111111-0000-0000-0000-000000000006', name: 'Tatlılar' }
    ];

    for (const cat of categories) {
      await client.query(`
        INSERT INTO public.sale_categories (id, name, created_at)
        VALUES ('${cat.id}', '${cat.name}', now())
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
      `);
    }

    // 3. Seed Sale Items
    console.log('3. Seeding sale_items...');
    const items = [
      { id: '22222222-0000-0000-0000-000000000001', sku: 'BRG-01', name: 'Klasik Burger', cat: 'Burgerler', price: 250 },
      { id: '22222222-0000-0000-0000-000000000002', sku: 'BRG-02', name: 'Cheeseburger', cat: 'Burgerler', price: 280 },
      { id: '22222222-0000-0000-0000-000000000003', sku: 'BRG-03', name: 'Double Burger', cat: 'Burgerler', price: 340 },
      { id: '22222222-0000-0000-0000-000000000004', sku: 'BRG-04', name: 'Chicken Crispy Burger', cat: 'Tavuk Ürünleri', price: 240 },
      { id: '22222222-0000-0000-0000-000000000005', sku: 'SNK-01', name: 'Patates Kızartması', cat: 'Atıştırmalıklar', price: 90 },
      { id: '22222222-0000-0000-0000-000000000006', sku: 'SNK-02', name: 'Soğan Halkası', cat: 'Atıştırmalıklar', price: 110 },
      { id: '22222222-0000-0000-0000-000000000007', sku: 'BEV-01', name: 'Kola 330ml', cat: 'Soğuk İçecekler', price: 50 },
      { id: '22222222-0000-0000-0000-000000000008', sku: 'BEV-02', name: 'Ayran 300ml', cat: 'Soğuk İçecekler', price: 35 },
      { id: '22222222-0000-0000-0000-000000000009', sku: 'BEV-03', name: 'Su 500ml', cat: 'Soğuk İçecekler', price: 20 },
      { id: '22222222-0000-0000-0000-000000000010', sku: 'BEV-04', name: 'Limonata', cat: 'Soğuk İçecekler', price: 60 },
      { id: '22222222-0000-0000-0000-000000000011', sku: 'HOT-01', name: 'Espresso', cat: 'Sıcak İçecekler', price: 65 },
      { id: '22222222-0000-0000-0000-000000000012', sku: 'HOT-02', name: 'Caffe Latte', cat: 'Sıcak İçecekler', price: 85 },
      { id: '22222222-0000-0000-0000-000000000013', sku: 'DST-01', name: 'Çikolatalı Sufle', cat: 'Tatlılar', price: 120 },
      { id: '22222222-0000-0000-0000-000000000014', sku: 'DST-02', name: 'San Sebastian Cheesecake', cat: 'Tatlılar', price: 150 }
    ];

    for (const item of items) {
      await client.query(`
        INSERT INTO public.sale_items (id, sku, name, standard_price, sale_status, setting_active, created_at)
        VALUES ('${item.id}', '${item.sku}', '${item.name}', ${item.price}, true, true, now())
        ON CONFLICT (id) DO UPDATE SET standard_price = EXCLUDED.standard_price, name = EXCLUDED.name;
      `);
    }

    // Get channels
    const channelsRes = await client.query(`SELECT id, name FROM public.sales_channels WHERE active = true;`);
    const channels = channelsRes.rows.length ? channelsRes.rows : [{ id: '33333333-0000-0000-0000-000000000001', name: 'Hızlı Satış' }];

    // 4. Generate Sales for the last 30 days
    console.log('4. Generating sales and sale_lines for the last 30 days...');

    let totalSalesCreated = 0;
    let totalLinesCreated = 0;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30); // 30 days ago

    for (let d = 0; d <= 30; d++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + d);
      const isoDateStr = currentDate.toISOString().split('T')[0];

      // Generate 15-25 sales transactions per day
      const dailySalesCount = Math.floor(Math.random() * 10) + 15;
      let dayTotalAmount = 0;

      for (let s = 0; s < dailySalesCount; s++) {
        const saleId = randomUUID();
        const saleNo = `SL-${isoDateStr.replace(/-/g, '')}-${String(s + 1).padStart(3, '0')}`;
        const channel = channels[s % channels.length];
        const branchId = s % 4 === 0 ? BESIKTAS_BRANCH_ID : KADIKOY_BRANCH_ID;
        const branchName = branchId === KADIKOY_BRANCH_ID ? 'Kadıköy Şubesi' : 'Beşiktaş Şubesi';
        const datetimeStr = `${isoDateStr} ${String(10 + (s % 12)).padStart(2, '0')}:${String((s * 7) % 60).padStart(2, '0')}:00+03`;

        // Select 1 to 4 random items for this sale
        const itemPicksCount = Math.floor(Math.random() * 3) + 1;
        let saleSubtotal = 0;
        const lineRows = [];

        for (let lp = 0; lp < itemPicksCount; lp++) {
          const item = items[Math.floor(Math.random() * items.length)];
          const qty = Math.floor(Math.random() * 2) + 1;
          const unitPrice = item.price;
          const lineTotal = unitPrice * qty;
          saleSubtotal += lineTotal;

          lineRows.push({
            id: randomUUID(),
            sale_id: saleId,
            line_no: lp + 1,
            product_id: item.id,
            product_name: item.name,
            product_sku: item.sku,
            top_category_name: item.cat,
            qty: qty,
            unit_price: unitPrice,
            line_total: lineTotal
          });
        }

        const grandTotal = saleSubtotal;
        dayTotalAmount += grandTotal;

        // Create sale record
        await client.query(`
          INSERT INTO public.sales (
            id, sale_no, sale_datetime, source, source_channel_type, sales_channel_id, sales_channel_name,
            company_id, company_name, branch_id, branch_name, 
            gross_total_before_discount, gross_total_after_discount, net_total_after_discount, payment_total,
            status, integration_ref, created_at, updated_at
          ) VALUES (
            '${saleId}', '${saleNo}', '${datetimeStr}', 'pos', 'hizli_satis', '${channel.id}', '${channel.name}',
            '${HOLDING_ID}', 'Suitable RMS Holding', '${branchId}', '${branchName}',
            ${grandTotal}, ${grandTotal}, ${grandTotal}, ${grandTotal},
            'completed', 'demo-sales-tool', '${datetimeStr}', '${datetimeStr}'
          );
        `);
        totalSalesCreated++;

        // Create sale_lines records
        for (const line of lineRows) {
          await client.query(`
            INSERT INTO public.sale_lines (
              id, sale_id, line_no, product_id, product_name, product_sku, top_category_name,
              qty, unit_gross_before_discount, line_gross_before_discount, unit_gross_after_discount,
              line_gross_after_discount, line_net_after_discount, sales_channel_id, sales_channel_name,
              branch_id, branch_name, sale_datetime
            ) VALUES (
              '${line.id}', '${line.sale_id}', ${line.line_no}, '${line.product_id}', '${line.product_name}', '${line.product_sku}', '${line.top_category_name}',
              ${line.qty}, ${line.unit_price}, ${line.line_total}, ${line.unit_price},
              ${line.line_total}, ${line.line_total}, '${channel.id}', '${channel.name}',
              '${branchId}', '${branchName}', '${datetimeStr}'
            );
          `);
          totalLinesCreated++;


        }
      }

      // Populate daily_sales summary table
      await client.query(`
        INSERT INTO public.daily_sales (
          id, branch_id, branch_name, sale_date, receipt_count, total_sales, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), '${KADIKOY_BRANCH_ID}', 'Kadıköy Şubesi', '${isoDateStr}', ${dailySalesCount}, ${dayTotalAmount}, now(), now()
        ) ON CONFLICT (sale_date, branch_id) DO UPDATE SET total_sales = EXCLUDED.total_sales, receipt_count = EXCLUDED.receipt_count;
      `);

      console.log(`- Day ${isoDateStr}: Created ${dailySalesCount} sales (${dayTotalAmount.toFixed(2)} TL total).`);
    }

    console.log(`\n🎉 SEED COMPLETE! Total Sales: ${totalSalesCreated}, Total Sale Lines: ${totalLinesCreated}`);

  } catch (err) {
    console.error('❌ Error during seeding:', err);
  } finally {
    await client.end();
  }
}

seedData();
