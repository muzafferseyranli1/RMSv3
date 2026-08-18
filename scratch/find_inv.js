import { db } from '../src/lib/db.js'

async function findInv() {
  const { data } = await db.from('e_invoices').select('id, invoice_number, sender_title, sender_vkn_tckn')
  console.log('All Invoices:', data)
  process.exit(0)
}
findInv()
