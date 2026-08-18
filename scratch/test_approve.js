import { db } from '../src/lib/db.js'
import { matchingEngine } from '../src/lib/eInvoice/matchingEngine.js'

async function testApprove() {
  const invId = 'c1fea4b8-bb0f-4cc2-8bf2-7d6f7f92da90' // ENT2026000290048
  const res = await matchingEngine.findPotentialReceiptsForInvoice(invId)
  const topCand = res.candidateReceipts[0]

  console.log('Top candidate receipt ID:', topCand.receipt.id)
  console.log('Approving match...')

  const appRes = await matchingEngine.approveInvoiceReceiptMatch({
    invoiceId: invId,
    receiptId: topCand.receipt.id,
    matchData: topCand.comparison,
    userPin: 'AUTO_BOT',
    note: '⚡ %100 Otomatik Eşleştirme Motoru tarafından onaylandı.',
    isAutoMatched: true
  })

  console.log('Approve result:', appRes)

  // Verify e_invoices status
  const { data: inv } = await db.from('e_invoices').select('id, invoice_number, is_matched, status_code, is_auto_matched, status_description').eq('id', invId).single()
  console.log('Invoice after approval:', inv)

  process.exit(0)
}

testApprove()
