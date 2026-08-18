import { db } from '../src/lib/db.js'

async function checkInvoicesStatus() {
  const { data } = await db.from('e_invoices').select('id, invoice_number, sender_title, direction, is_matched, status_code, status_description')
  console.log('e_invoices statuses in DB:', data)
  process.exit(0)
}

checkInvoicesStatus()
