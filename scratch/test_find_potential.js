import { db } from '../src/lib/db.js'
import { matchingEngine } from '../src/lib/eInvoice/matchingEngine.js'

async function testMatch() {
  const invId = '15d702c0-cfd2-44ec-9d20-f575a06a1b42'
  const res = await matchingEngine.findPotentialReceiptsForInvoice(invId)
  console.log('Success:', res.success)
  console.log('Matched Supplier:', res.matchedSupplier?.name)
  console.log('Candidates count:', res.candidateReceipts?.length)
  res.candidateReceipts?.forEach((c, idx) => {
    console.log(`Candidate #${idx+1}: Receipt No: ${c.receipt.receipt_no || c.receipt.doc_no}, Supplier: ${c.receipt.supplier_name}, Score: ${c.score}, IsExact: ${c.isExactMatch}`)
  })

  process.exit(0)
}

testMatch()
