import { db } from '../src/lib/db.js'
import { matchingEngine } from '../src/lib/eInvoice/matchingEngine.js'
import { eInvoiceService } from '../src/lib/eInvoice/eInvoiceService.js'

async function testObjVsId() {
  const invoicesRes = await eInvoiceService.getInvoices({ direction: 'INBOUND' })
  const invList = invoicesRes.data || []
  console.log('Invoices loaded from service:', invList.length)

  for (const inv of invList) {
    // Test 1: Passing inv.id (string)
    const res1 = await matchingEngine.findPotentialReceiptsForInvoice(inv.id)
    const cand1 = res1.candidateReceipts?.[0]
    console.log(`[ID TEST] ${inv.invoice_number}: Score=${cand1?.comparison?.matchScore}, isFullyMatched=${cand1?.comparison?.isFullyMatched}, lines=${cand1?.comparison?.lineComparisons?.length}`)

    // Test 2: Passing inv (object)
    const res2 = await matchingEngine.findPotentialReceiptsForInvoice(inv)
    const cand2 = res2.candidateReceipts?.[0]
    console.log(`[OBJ TEST] ${inv.invoice_number}: Score=${cand2?.comparison?.matchScore}, isFullyMatched=${cand2?.comparison?.isFullyMatched}, lines=${cand2?.comparison?.lineComparisons?.length}`)
  }

  process.exit(0)
}

testObjVsId()
