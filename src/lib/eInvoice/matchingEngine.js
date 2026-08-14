import { db } from '../db.js'
import { EINVOICE_STATUS, getStatusMeta } from './types.js'
import { eInvoiceService } from './eInvoiceService.js'

/**
 * Metin normalizasyonu (Türkçe karakterleri ve boşlukları temizler)
 */
function normalizeString(str) {
  if (!str) return ''
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '')
}

/**
 * İki metin arasındaki benzerliği ve kelime örtüşmesini hesaplar (0 - 1 arası)
 */
function calculateTextSimilarity(str1, str2) {
  if (!str1 || !str2) return 0
  const s1 = String(str1).toLowerCase().trim()
  const s2 = String(str2).toLowerCase().trim()

  if (s1 === s2) return 1.0
  if (normalizeString(s1) === normalizeString(s2)) return 0.95

  const words1 = s1.split(/\s+/).filter((w) => w.length > 2)
  const words2 = s2.split(/\s+/).filter((w) => w.length > 2)

  if (words1.length === 0 || words2.length === 0) return 0

  let matchCount = 0
  for (const w1 of words1) {
    const norm1 = normalizeString(w1)
    if (words2.some((w2) => normalizeString(w2).includes(norm1) || norm1.includes(normalizeString(w2)))) {
      matchCount++
    }
  }

  return (2 * matchCount) / (words1.length + words2.length)
}

export class MatchingEngine {
  /**
   * 1. Tedarikçiyi VKN / TCKN veya Ünvan ile `suppliers` Tablosunda Bulma
   */
  async findMatchingSupplier(senderVknTckn, senderTitle = '') {
    try {
      const cleanVkn = senderVknTckn ? String(senderVknTckn).trim().replace(/\D/g, '') : ''

      // 1. Önce VKN / Vergi No / TC No ile birebir sorgu
      if (cleanVkn) {
        const { data: vknMatches, error: vknErr } = await db
          .from('suppliers')
          .select('*')
          .is('deleted_at', null)

        if (!vknErr && vknMatches && vknMatches.length > 0) {
          const exact = vknMatches.find(
            (s) =>
              (s.vergi_no && String(s.vergi_no).trim() === cleanVkn) ||
              (s.tc_no && String(s.tc_no).trim() === cleanVkn) ||
              (s.cari_kodu && String(s.cari_kodu).trim() === cleanVkn)
          )
          if (exact) {
            return {
              success: true,
              supplier: exact,
              matchConfidence: 'EXACT_VKN',
              confidenceScore: 100,
            }
          }
        }
      }

      // 2. Ünvan / İsim ile Arama
      if (senderTitle && senderTitle.trim()) {
        const { data: allSuppliers, error: suppErr } = await db
          .from('suppliers')
          .select('*')
          .is('deleted_at', null)

        if (!suppErr && allSuppliers && allSuppliers.length > 0) {
          const normTitle = normalizeString(senderTitle)

          // Birebir veya tam içeren
          const exactName = allSuppliers.find(
            (s) =>
              normalizeString(s.name) === normTitle ||
              (s.marka_kisa_adi && normalizeString(s.marka_kisa_adi) === normTitle)
          )
          if (exactName) {
            return {
              success: true,
              supplier: exactName,
              matchConfidence: 'EXACT_NAME',
              confidenceScore: 90,
            }
          }

          // Kısmi / Benzerlik Arama
          let bestMatch = null
          let bestScore = 0

          for (const s of allSuppliers) {
            const score1 = calculateTextSimilarity(senderTitle, s.name)
            const score2 = s.marka_kisa_adi ? calculateTextSimilarity(senderTitle, s.marka_kisa_adi) : 0
            const maxScore = Math.max(score1, score2)

            if (maxScore > bestScore && maxScore >= 0.4) {
              bestScore = maxScore
              bestMatch = s
            }
          }

          if (bestMatch) {
            return {
              success: true,
              supplier: bestMatch,
              matchConfidence: 'FUZZY_NAME',
              confidenceScore: Math.round(bestScore * 100),
            }
          }
        }
      }

      return {
        success: false,
        supplier: null,
        matchConfidence: 'NONE',
        confidenceScore: 0,
      }
    } catch (err) {
      console.error('findMatchingSupplier error:', err)
      return { success: false, supplier: null, matchConfidence: 'ERROR', error: err.message }
    }
  }

  /**
   * 2. Gelen Fatura İçin Potansiyel Mal Kabul İrsaliyelerini ve Siparişleri Bulma
   */
  async findPotentialReceiptsForInvoice(invoiceIdOrObj, optionsOrBranchId = {}) {
    try {
      let branchId = null
      let options = {}
      if (typeof optionsOrBranchId === 'string') {
        branchId = optionsOrBranchId
      } else if (typeof optionsOrBranchId === 'object' && optionsOrBranchId !== null) {
        options = optionsOrBranchId
        branchId = options.branchId || null
      }
      const {
        daysWindow = 90,
        priceTolerancePercent = 1.0,
        qtyTolerance = 0.01,
      } = options

      // Fatura ve satırlarını yükle
      let invoice = null
      if (typeof invoiceIdOrObj === 'object' && invoiceIdOrObj !== null && invoiceIdOrObj.id) {
        invoice = invoiceIdOrObj
      } else {
        const invRes = await eInvoiceService.getInvoiceDetails(invoiceIdOrObj)
        if (!invRes.success) throw new Error(invRes.error || 'Fatura bulunamadı.')
        invoice = invRes.data
      }

      // Tedarikçiyi eşleştir
      const suppMatch = await this.findMatchingSupplier(invoice.sender_vkn_tckn, invoice.sender_title)
      const matchedSupplier = suppMatch.supplier

      // Mal kabul irsaliyelerini çek
      let receiptsQuery = db.from('purchase_receipts').select('*').is('deleted_at', null)

      if (branchId) {
        receiptsQuery = receiptsQuery.eq('branch_id', branchId)
      }

      const { data: allReceipts, error: rcptErr } = await receiptsQuery.order('delivered_on', { ascending: false }).limit(50)
      if (rcptErr) throw rcptErr

      let filteredReceipts = allReceipts || []

      // Eğer tedarikçi eşleştiyse onun irsaliyelerine öncelik ver
      if (matchedSupplier) {
        const supplierReceipts = filteredReceipts.filter(
          (r) =>
            r.supplier_id === matchedSupplier.id ||
            (r.supplier_name && matchedSupplier.name && normalizeString(r.supplier_name) === normalizeString(matchedSupplier.name))
        )
        // Eğer tedarikçiye ait irsaliye varsa onları al, yoksa tümünü tut
        if (supplierReceipts.length > 0) {
          filteredReceipts = supplierReceipts
        }
      }

      // İrsaliye satırlarını ve bağlı siparişleri toplu getir
      const receiptIds = filteredReceipts.map((r) => r.id)
      const orderIds = filteredReceipts.map((r) => r.order_id).filter(Boolean)

      let receiptLinesMap = {}
      if (receiptIds.length > 0) {
        const { data: linesData } = await db
          .from('purchase_receipt_lines')
          .select('*')
          .is('deleted_at', null)
          .in('receipt_id', receiptIds)
          .order('line_no', { ascending: true })

        ;(linesData || []).forEach((line) => {
          if (!receiptLinesMap[line.receipt_id]) receiptLinesMap[line.receipt_id] = []
          receiptLinesMap[line.receipt_id].push(line)
        })
      }

      let ordersMap = {}
      if (orderIds.length > 0) {
        const { data: ordersData } = await db
          .from('purchase_orders')
          .select('*')
          .is('deleted_at', null)
          .in('id', orderIds)

        ;(ordersData || []).forEach((o) => {
          ordersMap[o.id] = o
        })
      }

      // Her aday irsaliye için 3-Way Karşılaştırma yap
      const candidateReceipts = []
      for (const receipt of filteredReceipts) {
        const lines = receiptLinesMap[receipt.id] || []
        const order = receipt.order_id ? ordersMap[receipt.order_id] || null : null

        const fullReceipt = { ...receipt, lines, order }
        const comparison = this.compareInvoiceWithReceipt(invoice, fullReceipt, {
          priceTolerancePercent,
          qtyTolerance,
        })

        candidateReceipts.push({
          receipt: fullReceipt,
          lines,
          order,
          comparison,
          score: comparison.matchScore,
          status: comparison.status,
          isExactMatch: comparison.isFullyMatched,
        })
      }

      // Skora ve tarihe göre sırala (en yüksek uyum en üstte)
      candidateReceipts.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        return new Date(b.receipt.delivered_on || 0) - new Date(a.receipt.delivered_on || 0)
      })

      return {
        success: true,
        invoice,
        matchedSupplier,
        matchConfidence: suppMatch.matchConfidence,
        confidenceScore: suppMatch.confidenceScore,
        candidateReceipts,
        bestMatch: candidateReceipts.length > 0 ? candidateReceipts[0] : null,
      }
    } catch (err) {
      console.error('findPotentialReceiptsForInvoice error:', err)
      return {
        success: false,
        error: err.message,
        invoice: null,
        candidateReceipts: [],
      }
    }
  }

  /**
   * 3. Fatura ve Mal Kabul İrsaliyesini Satır Satır Karşılaştırma Motoru (3-Way Matching Comparison)
   */
  compareInvoiceWithReceipt(invoice, receipt, options = {}) {
    const {
      priceTolerancePercent = 1.0, // %1 birim fiyat toleransı
      qtyTolerance = 0.01,         // 0.01 miktar toleransı
      checkTaxRates = true,        // KDV oranı kontrolü
    } = options

    const invLines = invoice.lines || []
    const rcptLines = receipt.lines || []

    const lineComparisons = []
    const discrepancies = []
    const matchedReceiptLineIds = new Set()

    let exactMatchLinesCount = 0
    let totalInvoicedAmount = Number(invoice.payable_amount || invoice.tax_inclusive_amount || 0)
    let totalReceiptAmount = Number(receipt.total_amount_vat_inc || receipt.total_amount || 0)

    // Fatura satırlarını tek tek irsaliye satırları ile eşleştir
    invLines.forEach((invLine, idx) => {
      const invQty = Number(invLine.invoiced_quantity || invLine.quantity || 0)
      const invUnitPrice = Number(invLine.unit_price || 0)
      const invTaxRate = Number(invLine.tax_rate ?? 20)
      const invTotal = Number(invLine.total_line_amount || invLine.subtotal || 0)

      // İrsaliye satırları arasından en uygun olanını bul
      let matchedRcptLine = null
      let bestLineMatchScore = 0

      for (const rcptLine of rcptLines) {
        if (matchedReceiptLineIds.has(rcptLine.id)) continue

        // 1. SKU / Kod Eşleşmesi
        if (
          (invLine.item_code && rcptLine.item_sku && normalizeString(invLine.item_code) === normalizeString(rcptLine.item_sku)) ||
          (invLine.matched_stock_item_id && invLine.matched_stock_item_id === rcptLine.stock_item_id)
        ) {
          matchedRcptLine = rcptLine
          bestLineMatchScore = 1.0
          break
        }

        // 2. İsim benzerliği
        const sim = calculateTextSimilarity(invLine.item_name, rcptLine.item_name)
        if (sim > bestLineMatchScore && sim >= 0.45) {
          bestLineMatchScore = sim
          matchedRcptLine = rcptLine
        }
      }

      if (matchedRcptLine) {
        matchedReceiptLineIds.add(matchedRcptLine.id)
      }

      // Karşılaştırma metrikleri
      const rcptQty = matchedRcptLine ? Number(matchedRcptLine.received_qty || 0) : 0
      const rcptUnitPrice = matchedRcptLine ? Number(matchedRcptLine.unit_price || 0) : 0
      const rawRcptVat = matchedRcptLine?.vat_rate
      const rcptTaxRate = rawRcptVat != null ? (rawRcptVat <= 1 ? rawRcptVat * 100 : rawRcptVat) : invTaxRate
      const rcptTotal = matchedRcptLine ? Number(matchedRcptLine.line_total_vat_inc || matchedRcptLine.line_total || 0) : 0

      const qtyDiff = invQty - rcptQty // Pozitif: Fatura > İrsaliye (Eksik Teslimat)
      const unitPriceDiff = invUnitPrice - rcptUnitPrice
      const priceDiffPercent = rcptUnitPrice > 0 ? ((invUnitPrice - rcptUnitPrice) / rcptUnitPrice) * 100 : 0
      const lineTotalDiff = invTotal - rcptTotal

      let status = 'EXACT_MATCH'
      let statusLabel = 'Tam Uyumlu'
      let statusBadge = { bg: 'rgba(16,185,129,0.12)', color: '#10b981', border: '#10b981', icon: 'fa-circle-check' }

      // Uyuşmazlık Tespiti
      if (!matchedRcptLine) {
        status = 'NOT_IN_RECEIPT'
        statusLabel = 'İrsaliyede Yok'
        statusBadge = { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '#ef4444', icon: 'fa-circle-question' }
        discrepancies.push({
          lineIndex: idx + 1,
          itemName: invLine.item_name,
          type: 'NOT_IN_RECEIPT',
          severity: 'danger',
          title: `Kalem İrsaliyede Bulunamadı (#${idx + 1})`,
          description: `"${invLine.item_name}" mal kabul irsaliyesinde kayıtlı değil. Faturaya fazladan eklenmiş olabilir.`,
          diffAmount: invTotal,
        })
      } else if (qtyDiff > qtyTolerance) {
        status = 'QTY_SHORTAGE'
        statusLabel = `Eksik Teslimat (-${Math.round(qtyDiff * 100) / 100})`
        statusBadge = { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '#ef4444', icon: 'fa-box-open' }
        discrepancies.push({
          lineIndex: idx + 1,
          itemName: invLine.item_name,
          type: 'QTY_SHORTAGE',
          severity: 'danger',
          title: `Miktar Uyuşmazlığı - Eksik Teslimat (#${idx + 1})`,
          description: `Faturada ${invQty} ${invLine.unit_code || 'Birim'} kesilmiş fakat mal kabulde yalnız ${rcptQty} teslim alınmış (${qtyDiff} eksik).`,
          diffAmount: qtyDiff * invUnitPrice,
        })
      } else if (qtyDiff < -qtyTolerance) {
        status = 'QTY_SURPLUS'
        statusLabel = `Fazla Teslimat (+${Math.abs(Math.round(qtyDiff * 100) / 100)})`
        statusBadge = { bg: 'rgba(34,211,238,0.12)', color: '#22d3ee', border: '#22d3ee', icon: 'fa-dolly' }
        discrepancies.push({
          lineIndex: idx + 1,
          itemName: invLine.item_name,
          type: 'QTY_SURPLUS',
          severity: 'info',
          title: `Fazla Teslimat (#${idx + 1})`,
          description: `Faturada ${invQty} belirtilmiş ancak mal kabulde ${rcptQty} teslim alınmış.`,
          diffAmount: qtyDiff * invUnitPrice,
        })
      } else if (priceDiffPercent > priceTolerancePercent) {
        status = 'PRICE_OVER'
        statusLabel = `Fiyat Farkı (+%${Math.round(priceDiffPercent)} Zam)`
        statusBadge = { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '#f59e0b', icon: 'fa-arrow-trend-up' }
        discrepancies.push({
          lineIndex: idx + 1,
          itemName: invLine.item_name,
          type: 'PRICE_OVER',
          severity: 'warning',
          title: `Birim Fiyat Farkı (#${idx + 1})`,
          description: `Fatura birim fiyatı (${invUnitPrice.toLocaleString('tr-TR')} ₺) sipariş/irsaliye fiyatından (${rcptUnitPrice.toLocaleString('tr-TR')} ₺) %${Math.round(priceDiffPercent)} daha yüksek.`,
          diffAmount: (invUnitPrice - rcptUnitPrice) * invQty,
        })
      } else if (priceDiffPercent < -priceTolerancePercent) {
        status = 'PRICE_UNDER'
        statusLabel = `İndirimli Fiyat (-%${Math.abs(Math.round(priceDiffPercent))})`
        statusBadge = { bg: 'rgba(16,185,129,0.12)', color: '#10b981', border: '#10b981', icon: 'fa-arrow-trend-down' }
      } else if (checkTaxRates && invTaxRate !== rcptTaxRate) {
        status = 'TAX_MISMATCH'
        statusLabel = `KDV Farkı (%${invTaxRate} vs %${rcptTaxRate})`
        statusBadge = { bg: 'rgba(167,139,250,0.12)', color: '#a78bfa', border: '#a78bfa', icon: 'fa-percent' }
        discrepancies.push({
          lineIndex: idx + 1,
          itemName: invLine.item_name,
          type: 'TAX_MISMATCH',
          severity: 'warning',
          title: `KDV Oranı Uyuşmazlığı (#${idx + 1})`,
          description: `Faturada %${invTaxRate} KDV hesaplanmış, irsaliyede %${rcptTaxRate} tanımlı.`,
          diffAmount: 0,
        })
      }

      if (status === 'EXACT_MATCH' || status === 'PRICE_UNDER') {
        exactMatchLinesCount++
      }

      lineComparisons.push({
        lineIndex: idx + 1,
        invoiceLine: invLine,
        receiptLine: matchedRcptLine,
        matched: Boolean(matchedRcptLine),
        invQty,
        rcptQty,
        qtyDiff,
        invUnitPrice,
        rcptUnitPrice,
        unitPriceDiff,
        priceDiffPercent,
        invTaxRate,
        rcptTaxRate,
        invTotal,
        rcptTotal,
        lineTotalDiff,
        status,
        statusLabel,
        statusBadge,
      })
    })

    // İrsaliyede olup faturaya yazılmamış kalemler
    rcptLines.forEach((rcptLine) => {
      if (!matchedReceiptLineIds.has(rcptLine.id)) {
        discrepancies.push({
          lineIndex: null,
          itemName: rcptLine.item_name,
          type: 'NOT_IN_INVOICE',
          severity: 'info',
          title: `İrsaliye Kalemi Faturada Yok`,
          description: `Mal kabulde teslim alınan "${rcptLine.item_name}" (${rcptLine.received_qty} ${rcptLine.unit || 'Birim'}) faturaya yansıtılmamış.`,
          diffAmount: -Number(rcptLine.line_total_vat_inc || rcptLine.line_total || 0),
        })
      }
    })

    // Genel Uyum Skoru Hesaplama (0 - 100)
    let score = 100
    const totalLines = invLines.length || 1

    // Satır bazlı puan kırılımları
    const lineRatio = exactMatchLinesCount / totalLines
    score = Math.round(lineRatio * 70) // %70 kalem tam uyumu

    // Genel Tutar Farkı Toleransı (%30 puan)
    const netDiff = totalInvoicedAmount - totalReceiptAmount
    const totalToleranceAmount = totalReceiptAmount * (priceTolerancePercent / 100)

    if (Math.abs(netDiff) <= Math.max(1.0, totalToleranceAmount)) {
      score += 30
    } else {
      const amountDevPercent = totalReceiptAmount > 0 ? (Math.abs(netDiff) / totalReceiptAmount) * 100 : 50
      const penalty = Math.min(30, Math.round(amountDevPercent))
      score += Math.max(0, 30 - penalty)
    }

    if (discrepancies.some((d) => d.severity === 'danger')) {
      score = Math.min(score, 65)
    }

    const isFullyMatched = discrepancies.length === 0 && Math.abs(netDiff) <= 1.0

    return {
      matchScore: isFullyMatched ? 100 : Math.max(0, Math.min(100, score)),
      isFullyMatched,
      status: isFullyMatched ? 'EXACT_MATCH' : score >= 75 ? 'PARTIAL_MATCH' : 'DISCREPANCY',
      totalInvoicedAmount,
      totalReceiptAmount,
      totalNetDiff: Math.round(netDiff * 100) / 100,
      matchedLinesCount: exactMatchLinesCount,
      totalInvoiceLinesCount: invLines.length,
      discrepancies,
      lineComparisons,
    }
  }

  /**
   * 4. Eşleştirmeyi Onaylama, Satırları Bağlama ve Cari Hareketi İşleme
   */
  async approveInvoiceReceiptMatch(arg1, arg2, arg3, arg4, arg5) {
    let invoiceId, receiptId, matchData, userPin, note
    if (typeof arg1 === 'object' && arg1 !== null) {
      invoiceId = arg1.invoiceId
      receiptId = arg1.receiptId
      matchData = arg1.matchData || {}
      userPin = arg1.userPin || 'SYS'
      note = arg1.note || ''
    } else {
      invoiceId = arg1
      receiptId = arg2
      matchData = arg3 || {}
      userPin = arg4 || 'SYS'
      note = arg5 || ''
    }
    try {
      // 1. Fatura ve İrsaliyeyi Getir
      const { data: invoice } = await eInvoiceService.getInvoiceDetails(invoiceId)
      if (!invoice) throw new Error('Fatura kaydı bulunamadı.')

      const { data: rcptData, error: rcptErr } = await db
        .from('purchase_receipts')
        .select('*')
        .eq('id', receiptId)
        .limit(1)

      if (rcptErr || !rcptData || rcptData.length === 0) {
        throw new Error('Mal kabul irsaliyesi bulunamadı.')
      }
      const receipt = rcptData[0]

      const supplierId = receipt.supplier_id || matchData.supplierId || null
      const orderId = receipt.order_id || null

      // 2. Fatura Tablosunu Güncelle (is_matched = true, status_code = 1300)
      const nowIso = new Date().toISOString()
      const { error: invUpdErr } = await db
        .from('e_invoices')
        .update({
          is_matched: true,
          status_code: EINVOICE_STATUS.ACCEPTED, // 1300
          status_description: 'Kabul Edildi (3-Way Matching Onaylandı - 1300)',
          matched_purchase_order_id: orderId,
          matched_receipt_id: receiptId,
          matched_at: nowIso,
          response_code: 'KABUL',
          response_date: nowIso,
          updated_at: nowIso,
        })
        .eq('id', invoiceId)

      if (invUpdErr) throw invUpdErr

      // 3. Fatura Satırlarını Eşleşen Stok ve İrsaliye Satırları ile Güncelle
      if (matchData.lineComparisons && matchData.lineComparisons.length > 0) {
        for (const comp of matchData.lineComparisons) {
          if (comp.invoiceLine?.id && comp.receiptLine) {
            await db
              .from('e_invoice_lines')
              .update({
                matched_stock_item_id: comp.receiptLine.stock_item_id || null,
                matched_receipt_line_id: comp.receiptLine.id || null,
              })
              .eq('id', comp.invoiceLine.id)
          }
        }
      }

      // 4. Cari Hareketler Tablosuna Alacak Kaydı Ekle (Tedarikçi Cari Hesabı)
      const invoiceAmount = Number(invoice.payable_amount || 0)
      if (supplierId && invoiceAmount > 0) {
        const cariPayload = {
          musteri_id: null,
          supplier_id: supplierId,
          tur: 'alacak', // Tedarikçiye borçlanıyoruz => Tedarikçi alacak bakiyesi artar
          tutar: invoiceAmount,
          aciklama: `e-Fatura 3-Way Eşleştirme Onayı: ${invoice.invoice_number} (İrsaliye: ${receipt.receipt_no || receipt.doc_no || '-'})`,
          tarih: invoice.issue_date || nowIso.split('T')[0],
          neden: 'E-Fatura & Mal Kabul 3-Way Matching',
          personel_adi: userPin,
        }

        const { error: cariErr } = await db.from('cari_hareketler').insert(cariPayload)
        if (cariErr) {
          console.warn('Cari hareket kaydı uyarısı:', cariErr)
        }
      }

      // 5. Mal Kabul İrsaliyesini Güncelle (Fatura Numarasını ve Meta Bilgisini Yaz)
      const updatedMeta = {
        ...(receipt.meta || {}),
        matched_invoice_id: invoiceId,
        matched_invoice_no: invoice.invoice_number,
        matched_at: nowIso,
        match_score: matchData.matchScore || 100,
      }

      await db
        .from('purchase_receipts')
        .update({
          doc_no: receipt.doc_no || invoice.invoice_number,
          doc_kind: 'fatura',
          meta: updatedMeta,
        })
        .eq('id', receiptId)

      // 6. E-Fatura Eşleştirme Audit Log Kaydı (e_invoice_matching_logs)
      const logPayload = {
        invoice_id: invoiceId,
        receipt_id: receiptId,
        order_id: orderId,
        supplier_id: supplierId,
        match_score: matchData.matchScore || 100,
        matching_type: matchData.discrepancies?.length > 0 ? '3_WAY_MATCH_WITH_DISCREPANCIES' : '3_WAY_MATCH_EXACT',
        discrepancy_summary: matchData.discrepancies || [],
        net_difference: matchData.totalNetDiff || 0,
        status: 'MATCHED',
        notes: note || `Mal kabul irsaliyesi (${receipt.receipt_no || receipt.doc_no || '-'}) ile 3-Way Matching tamamlandı. Cari hareketi işlendi.`,
        performed_by: userPin,
        created_at: nowIso,
      }

      const { data: logData, error: logErr } = await db.from('e_invoice_matching_logs').insert(logPayload).select('id')
      if (logErr) console.warn('Matching log insert error:', logErr)

      // 7. Ticari Fatura ise Entegratör ve GİB Uygulama Yanıtını Otomatik İlet
      if (invoice.profile_id === 'TICARIFATURA') {
        try {
          await eInvoiceService.sendCommercialResponse(
            invoiceId,
            'KABUL',
            'Mal kabul irsaliyesi ve sipariş ile 3-Way Matching eşleştirilerek kabul edildi.',
            userPin
          )
        } catch (respErr) {
          console.warn('Commercial auto-accept note:', respErr)
        }
      }

      return {
        success: true,
        message: `Fatura (${invoice.invoice_number}) ve Mal Kabul İrsaliyesi (${receipt.receipt_no || receipt.doc_no || ''}) başarıyla eşleştirildi. Tedarikçi cari hesabına ${invoiceAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺ alacak kaydedildi.`,
        logId: logData?.[0]?.id,
      }
    } catch (err) {
      console.error('approveInvoiceReceiptMatch error:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * 5. Uyuşmazlık Nedeniyle Faturayı Reddetme & İtiraz Oluşturma
   */
  async rejectInvoiceWithDiscrepancy(arg1, arg2, arg3, arg4, arg5) {
    let invoiceId, receiptId, reason, discrepancies, userPin
    if (typeof arg1 === 'object' && arg1 !== null) {
      invoiceId = arg1.invoiceId
      receiptId = arg1.receiptId || null
      reason = arg1.reason || ''
      discrepancies = arg1.discrepancies || []
      userPin = arg1.userPin || 'SYS'
    } else {
      invoiceId = arg1
      receiptId = arg2 || null
      reason = arg3 || ''
      discrepancies = arg4 || []
      userPin = arg5 || 'SYS'
    }
    try {
      const { data: invoice } = await eInvoiceService.getInvoiceDetails(invoiceId)
      if (!invoice) throw new Error('Fatura bulunamadı.')

      const fullReason = reason || discrepancies.map((d) => d.title + ': ' + d.description).join(' | ') || '3-Way Matching Uyuşmazlığı'

      // GİB Uygulama Yanıtını Gönder
      const responseRes = await eInvoiceService.sendCommercialResponse(
        invoiceId,
        'RED',
        fullReason,
        userPin
      )

      if (!responseRes.success) throw new Error(responseRes.error)

      // Audit Log Kaydı
      await db.from('e_invoice_matching_logs').insert({
        invoice_id: invoiceId,
        receipt_id: receiptId,
        matching_type: 'REJECTED_DISCREPANCY',
        discrepancy_summary: discrepancies,
        status: 'REJECTED',
        notes: `Uyuşmazlık nedeniyle red yanıtı verildi: ${fullReason}`,
        performed_by: userPin,
        created_at: new Date().toISOString(),
      })

      return {
        success: true,
        message: 'Fatura uyuşmazlık nedeniyle reddedildi ve ticari uygulama yanıtı GİB sistemine iletildi.',
      }
    } catch (err) {
      console.error('rejectInvoiceWithDiscrepancy error:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * 6. Fark Faturası / İtiraz Tutanağı Metni Oluşturucu
   */
  generateDisputeSummaryText(invoice, receipt, comparison) {
    if (!comparison) return ''

    const lines = [
      `=============================================================`,
      `SUITABLERMS E-FATURA & MAL KABUL UYUŞMAZLIK TUTANAĞI`,
      `=============================================================`,
      `Fatura No      : ${invoice?.invoice_number || '-'}`,
      `Fatura Tarihi  : ${invoice?.issue_date || '-'}`,
      `Tedarikçi      : ${invoice?.sender_title || '-'} (VKN: ${invoice?.sender_vkn_tckn || '-'})`,
      `İrsaliye No    : ${receipt?.receipt_no || receipt?.doc_no || '-'}`,
      `İrsaliye Tarih : ${receipt?.delivered_on || '-'}`,
      `Fatura Tutarı  : ${Number(invoice?.payable_amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`,
      `İrsaliye Tutarı: ${Number(receipt?.total_amount_vat_inc || receipt?.total_amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`,
      `Net Fark Tutarı: ${Number(comparison.totalNetDiff || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`,
      `Uyum Skoru     : %${comparison.matchScore}`,
      `-------------------------------------------------------------`,
      `TESPİT EDİLEN UYUŞMAZLIKLAR:`,
    ]

    if (comparison.discrepancies.length === 0) {
      lines.push('Herhangi bir uyuşmazlık tespit edilmemiştir. Tam uyumludur.')
    } else {
      comparison.discrepancies.forEach((d, i) => {
        lines.push(`${i + 1}. [${d.type}] ${d.title}`)
        lines.push(`   Detay: ${d.description}`)
        if (d.diffAmount) {
          lines.push(`   Etki: ${Number(d.diffAmount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`)
        }
      })
    }

    lines.push(`=============================================================`)
    lines.push(`Bu tutanak 3-Way Matching motoru tarafından otomatik oluşturulmuştur.`)

    return lines.join('\n')
  }
}

export const matchingEngine = new MatchingEngine()
