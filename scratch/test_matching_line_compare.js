import { db } from '../src/lib/db.js';
import { matchingEngine } from '../src/lib/eInvoice/matchingEngine.js';

async function main() {
  console.log('--- Testing 3-Way Matching Line Comparison ---');

  // Find a test invoice
  const { data: invoices } = await db
    .from('e_invoices')
    .select('*')
    .eq('direction', 'INBOUND')
    .order('created_at', { ascending: false })
    .limit(3);

  console.log('Invoices count:', invoices?.length);

  if (!invoices || invoices.length === 0) {
    console.log('No invoices found.');
    return;
  }

  const invoice = invoices[0];
  console.log('Selected Invoice:', { id: invoice.id, number: invoice.invoice_number, sender: invoice.sender_title });

  // Get lines for invoice
  const { data: invLines } = await db
    .from('e_invoice_lines')
    .select('*')
    .eq('invoice_id', invoice.id);
  console.log('Invoice lines found in DB:', invLines?.length);

  // Find potential receipts
  const potential = await matchingEngine.findPotentialReceiptsForInvoice(invoice);
  console.log('Potential receipts found:', potential.candidates?.length);

  if (potential.candidates?.length > 0) {
    const topCandidate = potential.candidates[0];
    console.log('Top Candidate Receipt:', { id: topCandidate.receipt.id, no: topCandidate.receipt.receipt_no });

    const comparison = await matchingEngine.compareInvoiceWithReceipt(invoice, topCandidate.receipt);
    console.log('Comparison Result:', {
      overallScore: comparison.overallScore,
      isFullyMatched: comparison.isFullyMatched,
      matchedLineCount: comparison.lineMatches?.length,
      discrepancyCount: comparison.discrepancies?.length,
      hasContractPriceViolation: comparison.hasContractPriceViolation,
      contractValidation: comparison.contractValidation,
      lineMatches: comparison.lineMatches,
      discrepancies: comparison.discrepancies,
    });
  }
}

main().catch(console.error);
