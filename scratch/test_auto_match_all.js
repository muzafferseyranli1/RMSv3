import { db } from '../src/lib/db.js'
import { matchingEngine } from '../src/lib/eInvoice/matchingEngine.js'

async function runAutoMatchAll() {
  const { data: invoices } = await db.from('e_invoices').select('*').eq('is_matched', false)
  console.log('Pending invoices count:', invoices?.length)

  let count = 0
  for (const inv of invoices || []) {
    const res = await matchingEngine.findPotentialReceiptsForInvoice(inv.id)
    const candidates = res.candidateReceipts || res.candidates || []
    if (res.success && candidates.length > 0) {
      const topCand = candidates[0]
      const comp = topCand.comparison

      const is100PercentMatch =
        comp &&
        (!comp.discrepancies || comp.discrepancies.length === 0) &&
        !comp.hasContractPriceViolation &&
        (comp.matchScore >= 95 || comp.isFullyMatched) &&
        comp.lineComparisons &&
        comp.lineComparisons.length > 0 &&
        comp.lineComparisons.every((lc) => lc.status === 'EXACT_MATCH' || lc.matchConfidenceScore >= 85)

      if (is100PercentMatch && topCand.receipt) {
        const appRes = await matchingEngine.approveInvoiceReceiptMatch({
          invoiceId: inv.id,
          receiptId: topCand.receipt.id,
          matchData: comp,
          userPin: 'AUTO_BOT',
          note: '⚡ %100 Otomatik Eşleştirme Motoru tarafından onaylandı.',
          isAutoMatched: true,
        })
        if (appRes.success) {
          count++
          console.log(`✅ Auto-matched invoice ${inv.invoice_number} (${inv.sender_title}) with receipt ${topCand.receipt.receipt_no || topCand.receipt.doc_no}`)
        }
      }
    }
  }

  console.log(`Total auto-matched: ${count}`)
  process.exit(0)
}

runAutoMatchAll()
