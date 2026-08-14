import { db } from '../db.js'

/**
 * Normalizes date to YYYY-MM-DD string
 */
function normalizeDate(d) {
  if (!d) return null
  if (typeof d === 'string') return d.slice(0, 10)
  if (d instanceof Date) return d.toISOString().slice(0, 10)
  return null
}

/**
 * Checks if a given target date falls within [startDate, endDate + graceDays]
 */
function isDateWithinContractPeriod(targetDateStr, startDateStr, endDateStr, graceDays = 15) {
  if (!targetDateStr) return true
  const target = new Date(targetDateStr + 'T00:00:00')

  if (startDateStr) {
    const start = new Date(startDateStr + 'T00:00:00')
    if (target < start) return false
  }

  if (endDateStr) {
    const end = new Date(endDateStr + 'T00:00:00')
    // Add grace days
    end.setDate(end.getDate() + (Number(graceDays) || 0))
    if (target > end) return false
  }

  return true
}

/**
 * Checks if a branch is covered by the contract's branch scope
 */
function isBranchCoveredByContract(branchId, contractBranches) {
  if (!branchId) return true
  if (!Array.isArray(contractBranches) || contractBranches.length === 0) {
    // If no branch restriction is set, contract covers all branches
    return true
  }

  return contractBranches.some((b) => {
    if (b.type === 'branch' && String(b.id) === String(branchId)) return true
    if (b.type === 'template' && Array.isArray(b.branchIds) && b.branchIds.includes(branchId)) return true
    if (String(b.id) === String(branchId)) return true
    return false
  })
}

/**
 * 1. Tedarikçi, Fatura Tarihi ve Şube için Aktif Sözleşmeyi Bulma
 * Queries `contracts` table for active, un-deleted contracts covering the date and supplier.
 */
export async function findActiveContractForSupplier(supplierId, invoiceDate = null, branchId = null) {
  try {
    if (!supplierId) return null

    const { data: contracts, error } = await db
      .from('contracts')
      .select('*')
      .eq('supplier_id', supplierId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error || !contracts || contracts.length === 0) {
      return null
    }

    const dateToCheck = normalizeDate(invoiceDate) || new Date().toISOString().slice(0, 10)

    // Filter valid contracts by date and branch scope
    for (const c of contracts) {
      const grace = c.end_grace_days ?? 15
      const dateOk = isDateWithinContractPeriod(dateToCheck, c.start_date, c.end_date, grace)
      const branchOk = isBranchCoveredByContract(branchId, c.branches)

      if (dateOk && branchOk) {
        return c
      }
    }

    // Fallback: If date/branch didn't match strictly, return the first un-deleted contract for this supplier
    return contracts[0] || null
  } catch (err) {
    console.error('findActiveContractForSupplier error:', err)
    return null
  }
}

/**
 * 2. Fatura ve Satırlarını Sözleşme Birim Fiyatlarına ve Toleransa Göre Denetleme
 * Compares invoice line unit prices against contract rows. Checks price tolerance.
 * Returns: { isValid, hasViolation, violationMessage, contract, discrepantLines, ... }
 */
export async function validateInvoiceAgainstContract(invoice, lines = [], options = {}) {
  try {
    const supplierId =
      options.supplierId ||
      invoice.sender_supplier_id ||
      invoice.supplier_id ||
      options.matchedSupplierId ||
      null

    const invoiceDate = invoice.issue_date || options.invoiceDate || new Date().toISOString().slice(0, 10)
    const branchId = options.branchId || invoice.branch_id || invoice.destination_node_id || null

    let contract = options.contract || null
    if (!contract && supplierId) {
      contract = await findActiveContractForSupplier(supplierId, invoiceDate, branchId)
    }

    if (!contract) {
      return {
        isValid: true,
        hasViolation: false,
        hasContract: false,
        contract: null,
        discrepantLines: [],
        message: 'Bu tedarikçi için sistemde kayıtlı aktif sözleşme bulunmamaktadır.',
      }
    }

    const contractRows = Array.isArray(contract.rows) ? contract.rows : []
    // price_tolerance can be 0.05 (meaning 5%) or 5
    const rawTol = contract.price_tolerance != null ? Number(contract.price_tolerance) : 0.05
    const toleranceFraction = rawTol > 1 ? rawTol / 100 : rawTol

    const blockOnExceed = contract.block_on_exceed !== false // default true

    const invoiceLines = (lines && lines.length > 0) ? lines : (invoice.lines || [])
    const discrepantLines = []

    for (let idx = 0; idx < invoiceLines.length; idx++) {
      const line = invoiceLines[idx]
      const invUnitPrice = Number(line.unit_price || 0)
      const lineStockId = line.matched_stock_item_id || line.stock_item_id || null
      const lineItemCode = (line.item_code || '').trim().toLowerCase()
      const lineItemName = (line.item_name || '').trim().toLowerCase()

      // Find matching row in contract
      const matchedRow = contractRows.find((r) => {
        if (lineStockId && r.stock_item_id && String(r.stock_item_id) === String(lineStockId)) return true
        if (lineItemCode && r.sku && String(r.sku).trim().toLowerCase() === lineItemCode) return true
        if (lineItemName && r.name && String(r.name).trim().toLowerCase() === lineItemName) return true
        return false
      })

      if (matchedRow) {
        const contractPrice = Number(matchedRow.price || 0)
        if (contractPrice > 0) {
          const maxAllowedPrice = contractPrice * (1 + toleranceFraction)
          const priceDiff = invUnitPrice - contractPrice
          const priceDiffPercent = ((invUnitPrice - contractPrice) / contractPrice) * 100

          if (invUnitPrice > maxAllowedPrice) {
            discrepantLines.push({
              lineIndex: idx + 1,
              itemName: line.item_name || matchedRow.name,
              itemCode: line.item_code || matchedRow.sku,
              stockItemId: matchedRow.stock_item_id,
              contractPrice,
              invoicePrice: invUnitPrice,
              maxAllowedPrice,
              priceDiff,
              priceDiffPercent: Math.round(priceDiffPercent * 100) / 100,
              tolerancePercent: toleranceFraction * 100,
              contractNo: contract.contract_no,
              contractId: contract.id,
              contractRow: matchedRow,
              unit: matchedRow.unit || line.unit_code || 'Birim',
            })
          }
        }
      }
    }

    const hasViolation = discrepantLines.length > 0
    let violationMessage = ''

    if (hasViolation) {
      const first = discrepantLines[0]
      violationMessage = `Geçerliliği devam eden #${contract.contract_no} numaralı sözleşmeden farklı fiyatla kesilen fatura kabul edilemez! (Sözleşme Fiyatı: ${first.contractPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺, Fatura Fiyatı: ${first.invoicePrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺)`
      if (discrepantLines.length > 1) {
        violationMessage += ` ve ${discrepantLines.length - 1} diğer kalemde fiyat aşımı mevcuttur.`
      }
    }

    return {
      isValid: !hasViolation,
      hasViolation,
      hasContract: true,
      contract,
      contractNo: contract.contract_no,
      contractId: contract.id,
      blockOnExceed,
      discrepantLines,
      violationMessage,
      tolerancePercent: toleranceFraction * 100,
    }
  } catch (err) {
    console.error('validateInvoiceAgainstContract error:', err)
    return {
      isValid: false,
      hasViolation: true,
      hasContract: false,
      error: err.message,
      violationMessage: 'Sözleşme fiyat doğrulaması sırasında hata oluştu.',
      discrepantLines: [],
    }
  }
}
