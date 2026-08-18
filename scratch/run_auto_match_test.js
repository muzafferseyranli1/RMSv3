import { db } from '../src/lib/db.js'
import { matchingEngine } from '../src/lib/eInvoice/matchingEngine.js'

async function runAutoMatchTest() {
  const { data: invoices } = await db.from('e_invoices').select('*').order('created_at', { ascending: false })
  console.log('Total invoices in DB:', invoices?.length)

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

      console.log(`Invoice ${inv.invoice_number} (${inv.sender_title}):`)
      console.log(`  Top Candidate: ${topCand.receipt.receipt_no || topCand.receipt.doc_no} (${topCand.receipt.supplier_name})`)
      console.log(`  matchScore: ${comp.matchScore}, isFullyMatched: ${comp.isFullyMatched}`)
      console.log(`  Discrepancies: ${comp.discrepancies?.length}`)
      console.log(`  is100PercentMatch: ${is100PercentMatch}`)
    } else {
      console.log(`Invoice ${inv.invoice_number}: No candidates found!`)
    }
  }

  process.exit(0)
}

runAutoMatchTest()
