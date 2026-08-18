import { db } from '../src/lib/db.js'

async function inspectReceipts() {
  const { data: rcpts } = await db
    .from('purchase_receipts')
    .select('*')
    .or('receipt_no.eq.DEMO-MK-202605-003,doc_no.eq.DEMO-MK-202605-003,receipt_no.eq.DEMO-MK-202605-004,doc_no.eq.DEMO-MK-202605-004')

  console.log('Receipts:', rcpts)

  if (rcpts && rcpts.length > 0) {
    const ids = rcpts.map(r => r.id)
    const { data: lines } = await db.from('purchase_receipt_lines').select('*').in('receipt_id', ids)
    console.log('Receipt Lines:', lines)
  }

  const { data: inv } = await db.from('e_invoices').select('*, lines:e_invoice_lines(*)').eq('invoice_number', 'ENT2026000507280').single()
  console.log('Invoice:', inv?.invoice_number, inv?.sender_title, 'Lines:', inv?.lines)

  process.exit(0)
}

inspectReceipts()
