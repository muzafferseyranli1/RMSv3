import { db } from '../src/lib/db.js'
import { matchingEngine } from '../src/lib/eInvoice/matchingEngine.js'

async function debugAutoMatch() {
  const invId = 'c1fea4b8-bb0f-4cc2-8bf2-7d6f7f92da90' // ENT2026000290048
  const res = await matchingEngine.findPotentialReceiptsForInvoice(invId)

  if (res.candidateReceipts && res.candidateReceipts.length > 0) {
    const topCand = res.candidateReceipts[0]
    const comp = topCand.comparison

    const is100PercentMatch =
      comp &&
      (!comp.discrepancies || comp.discrepancies.length === 0) &&
      !comp.hasContractPriceViolation &&
      (comp.matchScore >= 95 || comp.isFullyMatched) &&
      comp.lineComparisons &&
      comp.lineComparisons.length > 0 &&
      comp.lineComparisons.every((lc) => lc.status === 'EXACT_MATCH' || lc.matchConfidenceScore >= 90)

    console.log('Updated is100PercentMatch evaluated to:', is100PercentMatch)
  }

  process.exit(0)
}

debugAutoMatch()
