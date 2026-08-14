import pg from 'pg';

const NEW_PG_URL = 'postgresql://postgres:RMSv3_Local_Password_2026!@188.132.198.144:5432/railway';

async function main() {
  const pool = new pg.Pool({ connectionString: NEW_PG_URL });

  const invRes = await pool.query(`SELECT id, invoice_number, sender_title, payable_amount, receipt_id, despatch_document_reference FROM public.e_invoices ORDER BY created_at DESC LIMIT 5`);
  console.log('--- Recent Invoices ---');
  console.table(invRes.rows);

  if (invRes.rows.length > 0) {
    const latestInvId = invRes.rows[0].id;
    const linesRes = await pool.query(`SELECT id, line_number, item_name, invoiced_quantity, unit_price, line_extension_amount FROM public.e_invoice_lines WHERE invoice_id = $1`, [latestInvId]);
    console.log(`--- e_invoice_lines for ${invRes.rows[0].invoice_number} (count: ${linesRes.rows.length}) ---`);
    console.table(linesRes.rows);
  }

  const recRes = await pool.query(`SELECT id, receipt_no, supplier_name, total_amount FROM public.purchase_receipts ORDER BY created_at DESC LIMIT 5`);
  console.log('--- Recent Purchase Receipts ---');
  console.table(recRes.rows);

  if (recRes.rows.length > 0) {
    const latestRecId = recRes.rows[0].id;
    const recLinesRes = await pool.query(`SELECT id, receipt_id, stock_item_id, item_name, delivered_qty, unit_price FROM public.purchase_receipt_lines WHERE receipt_id = $1`, [latestRecId]);
    console.log(`--- purchase_receipt_lines for ${recRes.rows[0].receipt_no} (count: ${recLinesRes.rows.length}) ---`);
    console.table(recLinesRes.rows);
  }

  await pool.end();
}

main().catch(console.error);
