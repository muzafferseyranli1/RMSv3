import { db } from '../db.js'
import { EINVOICE_STATUS, getStatusMeta } from './types.js'
import { eInvoiceService } from './eInvoiceService.js'
import { findActiveContractForSupplier, validateInvoiceAgainstContract } from './contractPriceValidator.js'

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

/**
 * Türkçe Fonetik & Kök Harf Benzerliği Hesaplama
 * Sesli harfleri ve çift harfleri sadeleştirerek fonetik yakınlık ölçer.
 * Kısa kelimelerde (ör. "Un", "Et", "Su") ve büyük uzunluk farklarında yanlış eşleşmeyi engeller.
 */
function calculatePhoneticSimilarity(str1, str2) {
  if (!str1 || !str2) return 0
  const s1Norm = normalizeString(str1)
  const s2Norm = normalizeString(str2)

  if (!s1Norm || !s2Norm) return 0
  if (s1Norm === s2Norm) return 1.0

  // 1. Tam Kapsama Kontrolü (Birebir Kelime veya Anlamlı İçerme)
  if (s1Norm.length >= 3 && s2Norm.length >= 3) {
    if (s1Norm.includes(s2Norm) || s2Norm.includes(s1Norm)) {
      const lenRatio = Math.min(s1Norm.length, s2Norm.length) / Math.max(s1Norm.length, s2Norm.length)
      if (lenRatio >= 0.5) return Math.round(0.85 * lenRatio * 100) / 100
    }
  }

  // 2. Sesli Harf ve Çift Harf Temizliği
  const clean = (s) =>
    normalizeString(s)
      .replace(/[aeiouıöü]/g, '') // Sesli harfleri at
      .replace(/(.)\1+/g, '$1')   // Çift sessizleri tekilleştir ('dd' -> 'd')

  const c1 = clean(str1)
  const c2 = clean(str2)

  if (!c1 || !c2) return 0

  // Birebir sessiz harf dizisi eşitliği (Örn: "baklava" -> "bklv", "baklava" -> "bklv")
  if (c1 === c2 && c1.length >= 2) return 0.88

  // İçerme kontrolü: SADECE her iki tarafın sessiz uzunluğu >= 3 VE uzunluk oranı >= 0.6 ise!
  if (c1.length >= 3 && c2.length >= 3) {
    if (c1.includes(c2) || c2.includes(c1)) {
      const lenRatio = Math.min(c1.length, c2.length) / Math.max(c1.length, c2.length)
      if (lenRatio >= 0.6) {
        return Math.round(0.78 * lenRatio * 100) / 100
      }
    }
  }

  // 3. Standart Kelime Bazlı Metin Benzerliği
  return calculateTextSimilarity(str1, str2)
}

export class MatchingEngine {
  /**
   * 1. Tedarikçiyi VKN / TCKN veya Ünvan ile `suppliers` Tablosunda Bulma
   */
  async findMatchingSupplier(senderVknTckn, senderTitle = '') {
    try {
      const cleanVkn = senderVknTckn ? String(senderVknTckn).trim().replace(/\D/g, '') : ''

      // 1. Önce VKN / Vergi No / TC No ile birebir sorgu (Unvan Uyumu Öncelikli)
      if (cleanVkn) {
        const { data: vknMatches, error: vknErr } = await db
          .from('suppliers')
          .select('*')
          .is('deleted_at', null)

        if (!vknErr && vknMatches && vknMatches.length > 0) {
          const matchingVknSuppliers = vknMatches.filter(
            (s) =>
              (s.vergi_no && String(s.vergi_no).trim() === cleanVkn) ||
              (s.tc_no && String(s.tc_no).trim() === cleanVkn) ||
              (s.cari_kodu && String(s.cari_kodu).trim() === cleanVkn)
          )

          if (matchingVknSuppliers.length > 0) {
            const normTitle = senderTitle ? normalizeString(senderTitle) : ''
            if (normTitle) {
              const exactTitleAndVkn = matchingVknSuppliers.find(
                (s) =>
                  normalizeString(s.name) === normTitle ||
                  (s.marka_kisa_adi && normalizeString(s.marka_kisa_adi) === normTitle)
              )
              if (exactTitleAndVkn) {
                return {
                  success: true,
                  supplier: exactTitleAndVkn,
                  matchConfidence: 'EXACT_VKN_AND_TITLE',
                  confidenceScore: 100,
                }
              }

              // Unvanı en yakın olan VKN eşleşmesini bul
              let bestVknMatch = null
              let bestVknScore = 0
              for (const s of matchingVknSuppliers) {
                const score = calculateTextSimilarity(senderTitle, s.name)
                if (score > bestVknScore) {
                  bestVknScore = score
                  bestVknMatch = s
                }
              }
              if (bestVknMatch && bestVknScore >= 0.4) {
                return {
                  success: true,
                  supplier: bestVknMatch,
                  matchConfidence: 'EXACT_VKN_FUZZY_TITLE',
                  confidenceScore: 95,
                }
              }
            } else {
              return {
                success: true,
                supplier: matchingVknSuppliers[0],
                matchConfidence: 'EXACT_VKN',
                confidenceScore: 100,
              }
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
      return { success: false, supplier: null, matchConfidence: 'ERROR', confidenceScore: 0, error: err.message }
    }
  }

  /**
   * Tedarikçi Ürün Eşleme Hafızasını Getirme (`supplier_item_mappings`)
   */
  async getSupplierItemMappings(supplierId) {
    if (!supplierId) return []
    try {
      const { data, error } = await db
        .from('supplier_item_mappings')
        .select('*')
        .eq('supplier_id', supplierId)

      if (error) {
        console.warn('getSupplierItemMappings warning:', error.message)
        return []
      }
      return data || []
    } catch (err) {
      console.warn('getSupplierItemMappings err:', err.message)
      return []
    }
  }

  /**
   * Tedarikçi Ürün Eşleme Hafızasına Kaydetme / Güncelleme
   */
  async saveSupplierItemMapping(supplierId, supplierItemName, stockItemId, options = {}) {
    if (!supplierId || !supplierItemName || !stockItemId) return null
    try {
      const {
        supplierItemCode = '',
        unitCode = 'C62',
        mappingSource = 'MANUAL',
        confidenceScore = 100,
      } = options

      const payload = {
        supplier_id: supplierId,
        supplier_item_name: String(supplierItemName).trim(),
        supplier_item_code: supplierItemCode || null,
        stock_item_id: stockItemId,
        unit_code: unitCode,
        mapping_source: mappingSource,
        confidence_score: confidenceScore,
        last_matched_at: new Date().toISOString(),
      }

      const { data, error } = await db
        .from('supplier_item_mappings')
        .upsert(payload, { onConflict: 'supplier_id, supplier_item_name' })

      if (error) throw error
      return data
    } catch (err) {
      console.error('saveSupplierItemMapping error:', err)
      return null
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
      }
      const {
        daysWindow = 90,
        priceTolerancePercent = 1.0,
        qtyTolerance = 0.01,
      } = options

      // Fatura ve satırlarını yükle
      let invoice = null
      if (typeof invoiceIdOrObj === 'object' && invoiceIdOrObj !== null && invoiceIdOrObj.id) {
        invoice = { ...invoiceIdOrObj }
      } else {
        const invRes = await eInvoiceService.getInvoiceDetails(invoiceIdOrObj)
        if (!invRes.success) throw new Error(invRes.error || 'Fatura bulunamadı.')
        invoice = invRes.data
      }

      // ALWAYS ensure invoice.lines is loaded
      if (!invoice.lines || invoice.lines.length === 0) {
        const { data: invLines } = await db
          .from('e_invoice_lines')
          .select('*')
          .eq('invoice_id', invoice.id)
          .order('line_number', { ascending: true })
        invoice.lines = invLines || []
      }

      // Tedarikçiyi eşleştir
      const suppMatch = await this.findMatchingSupplier(invoice.sender_vkn_tckn, invoice.sender_title)
      const matchedSupplier = suppMatch.supplier

      // Tedarikçi Mapping Hafızasını Çek
      let supplierMappings = []
      if (matchedSupplier?.id) {
        supplierMappings = await this.getSupplierItemMappings(matchedSupplier.id)
      }

      // Aktif sözleşmeyi ve fiyat doğrulamasını kontrol et
      let activeContract = null
      let contractValidation = { isValid: true, hasViolation: false, hasContract: false, message: 'Aktif sözleşme yok' }
      if (matchedSupplier?.id) {
        activeContract = await findActiveContractForSupplier(matchedSupplier.id, invoice.issue_date, branchId)
        if (activeContract) {
          contractValidation = await validateInvoiceAgainstContract(invoice, invoice.lines || [], {
            supplierId: matchedSupplier.id,
            contract: activeContract,
            branchId,
          })
        }
      }

      // Mal kabul irsaliyelerini çek
      let receiptsQuery = db.from('purchase_receipts').select('*').is('deleted_at', null)

      if (branchId) {
        receiptsQuery = receiptsQuery.eq('branch_id', branchId)
      }

      const { data: allReceipts, error: rcptErr } = await receiptsQuery.order('delivered_on', { ascending: false }).limit(50)
      if (rcptErr) throw rcptErr

      let filteredReceipts = allReceipts || []

      // Eğer faturadaki tedarikçi unvanı veya eşleşen tedarikçi varsa, unvanı tutan irsaliyelere öncelik ver
      const senderTitleNorm = invoice.sender_title ? normalizeString(invoice.sender_title) : ''
      let priorityReceipts = []

      if (senderTitleNorm) {
        priorityReceipts = filteredReceipts.filter(
          (r) => r.supplier_name && normalizeString(r.supplier_name) === senderTitleNorm
        )
      }

      if (priorityReceipts.length === 0 && matchedSupplier) {
        priorityReceipts = filteredReceipts.filter(
          (r) =>
            r.supplier_id === matchedSupplier.id ||
            (r.supplier_name && matchedSupplier.name && normalizeString(r.supplier_name) === normalizeString(matchedSupplier.name))
        )
      }

      // Öncelikli irsaliyeler varsa onları en öne al, ancak diğer tüm irsaliyeleri de havuzda tut ki 3-way skora göre doğru sıralansınlar!
      if (priorityReceipts.length > 0) {
        const priorityIds = new Set(priorityReceipts.map((r) => r.id))
        const remaining = filteredReceipts.filter((r) => !priorityIds.has(r.id))
        filteredReceipts = [...priorityReceipts, ...remaining]
      }

      // İrsaliye satırlarını ve bağlı siparişleri toplu getir
      const receiptIds = filteredReceipts.map((r) => r.id)
      const orderIds = filteredReceipts.map((r) => r.order_id).filter(Boolean)

      let receiptLinesMap = {}
      if (receiptIds.length > 0) {
        const { data: linesData } = await db
          .from('purchase_receipt_lines')
          .select('*')
          .in('receipt_id', receiptIds)

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

      // Her aday irsaliye için 3-Way Karşılaştırma yap (5 Kademeli Akıllı Pipeline)
      const candidateReceipts = []
      for (const receipt of filteredReceipts) {
        const lines = receiptLinesMap[receipt.id] || []
        const order = receipt.order_id ? ordersMap[receipt.order_id] || null : null

        const fullReceipt = { ...receipt, lines, order }
        const comparison = this.compareInvoiceWithReceipt(invoice, fullReceipt, {
          priceTolerancePercent,
          qtyTolerance,
          contractValidation,
          activeContract,
          supplierMappings,
          manualLineOverrides: options.manualLineOverrides || {},
        })

        const waterfall = this.evaluateWaterfallPipeline(invoice, fullReceipt, {
          comparison,
          contractValidation,
          matchedSupplierId: matchedSupplier?.id,
        })

        candidateReceipts.push({
          receipt: fullReceipt,
          lines,
          order,
          comparison,
          waterfall,
          score: Math.max(comparison.matchScore, waterfall.totalScore),
          status: comparison.status,
          isExactMatch: comparison.isFullyMatched || waterfall.isFullyPassed,
          hasContractPriceViolation: comparison.hasContractPriceViolation || waterfall.hasViolation,
          isCrossBilled: waterfall.isCrossBilled,
          contractValidation: comparison.contractValidation,
          activeContract: comparison.activeContract,
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
        contractValidation,
        activeContract,
        supplierMappings,
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
   * 3. 5 KADEMELİ AKILLI 3-WAY MATCHING VE KALEM EŞLEŞTİRME MOTORU
   * Pipeline Sırası:
   *  1. Exact Match (Birebir İsim veya SKU/ID)
   *  2. Supplier Mapping Memory (Daha önce öğrenilmiş Tedarikçi Eşlemeleri)
   *  3. Unique Quantity & Unit Price Match (Miktar + Fiyat Tekilliği ile Otomatik Bağlama)
   *  4. Phonetic & Fuzzy String Similarity Match (Ses Benzerliği & Öneri)
   *  5. Discrepancy / Manual Mapping Required (Eşleşemeyen veya Çelişkili Kalemler)
   */
  compareInvoiceWithReceipt(invoice, receipt, options = {}) {
    const {
      priceTolerancePercent = 1.0, // %1 birim fiyat toleransı
      qtyTolerance = 0.01,         // 0.01 miktar toleransı
      checkTaxRates = true,        // KDV oranı kontrolü
      contractValidation = null,
      activeContract = null,
      supplierMappings = [],
      manualLineOverrides = {},    // Kullanıcının UI'dan manuel seçtiği { [invoiceLineId]: stockItemId / receiptLineId }
    } = options

    const invLines = invoice.lines || []
    const rcptLines = receipt.lines || []

    const lineComparisons = []
    const discrepancies = []
    const matchedReceiptLineIds = new Set()

    let exactMatchLinesCount = 0
    let totalInvoicedAmount = Number(invoice.payable_amount || invoice.tax_inclusive_amount || 0)
    let totalReceiptAmount = Number(receipt.total_amount_vat_inc || receipt.total_amount || 0)

    // Mapping Lookup Map
    const mappingMapByName = new Map()
    const mappingMapByCode = new Map()
    supplierMappings.forEach((m) => {
      if (m.supplier_item_name) mappingMapByName.set(normalizeString(m.supplier_item_name), m)
      if (m.supplier_item_code) mappingMapByCode.set(normalizeString(m.supplier_item_code), m)
    })

    // Fatura satırlarını eşleştir
    invLines.forEach((invLine, idx) => {
      const invQty = Number(invLine.invoiced_quantity || invLine.quantity || 0)
      const invUnitPrice = Number(invLine.unit_price || 0)
      const invTaxRate = Number(invLine.tax_rate ?? 20)
      const invTotal = Number(invLine.total_line_amount != null ? invLine.total_line_amount : (invQty * invUnitPrice) || 0)

      let matchedRcptLine = null
      let matchMethod = 'NONE'
      let matchConfidenceScore = 0
      let matchMethodLabel = 'Eşleşme Yok'
      let matchMethodBadge = { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', icon: 'fa-circle-xmark' }
      let isCandidateForAutoMapping = false

      // 0. Manuel Override (Kullanıcı UI'dan elle bağlamışsa)
      if (manualLineOverrides[invLine.id]) {
        const override = manualLineOverrides[invLine.id]
        const rcptFound = rcptLines.find((r) => r.id === override.receiptLineId || r.stock_item_id === override.stockItemId)
        if (rcptFound) {
          matchedRcptLine = rcptFound
          matchMethod = 'MANUAL_OVERRIDE'
          matchConfidenceScore = 100
          matchMethodLabel = 'Manuel Eşlendi'
          matchMethodBadge = { bg: 'rgba(168,85,247,0.18)', color: '#a855f7', icon: 'fa-user-check' }
        }
      }

      // 1. KADEME: Birebir İsim, SKU veya Stock Item ID Eşleşmesi
      if (!matchedRcptLine) {
        for (const rcptLine of rcptLines) {
          if (matchedReceiptLineIds.has(rcptLine.id)) continue

          if (
            (invLine.item_code && rcptLine.item_sku && normalizeString(invLine.item_code) === normalizeString(rcptLine.item_sku)) ||
            (invLine.matched_stock_item_id && invLine.matched_stock_item_id === rcptLine.stock_item_id) ||
            (normalizeString(invLine.item_name) === normalizeString(rcptLine.item_name))
          ) {
            matchedRcptLine = rcptLine
            matchMethod = 'EXACT'
            matchConfidenceScore = 100
            matchMethodLabel = 'Birebir İsim/Kod'
            matchMethodBadge = { bg: 'rgba(16,185,129,0.14)', color: '#10b981', icon: 'fa-circle-check' }
            break
          }
        }
      }

      // 2. KADEME: Tedarikçi Hafızası (Supplier Item Mappings - Önceden Öğrenilmiş)
      if (!matchedRcptLine) {
        const normInvName = normalizeString(invLine.item_name)
        const normInvCode = normalizeString(invLine.item_code)
        const knownMapping = mappingMapByName.get(normInvName) || (normInvCode ? mappingMapByCode.get(normInvCode) : null)

        if (knownMapping) {
          const rcptFound = rcptLines.find(
            (r) => !matchedReceiptLineIds.has(r.id) && r.stock_item_id === knownMapping.stock_item_id
          )
          if (rcptFound) {
            matchedRcptLine = rcptFound
            matchMethod = 'MAPPED_MEMORY'
            matchConfidenceScore = 98
            matchMethodLabel = 'Tedarikçi Hafızası (Öğrenilmiş)'
            matchMethodBadge = { bg: 'rgba(147,51,234,0.14)', color: '#9333ea', icon: 'fa-brain' }
          }
        }
      }

      // 3. KADEME: MIKTAR + BİRİM FİYAT KESİN TEKİLLİK EŞLEŞMESİ (Deterministic Unique Qty & Price)
      // İsimler farklı olsa bile, irsaliyede aynı miktar ve birim fiyata sahip TEK bir satır varsa otomatik bağlanır!
      if (!matchedRcptLine) {
        const matchingPriceAndQtyCandidates = rcptLines.filter((rcptLine) => {
          if (matchedReceiptLineIds.has(rcptLine.id)) return false
          const rcptQty = Number(rcptLine.received_qty || 0)
          const rcptPrice = Number(rcptLine.unit_price || 0)

          const qtyMatches = Math.abs(invQty - rcptQty) <= qtyTolerance
          const priceDiffPct = rcptPrice > 0 ? (Math.abs(invUnitPrice - rcptPrice) / rcptPrice) * 100 : 0
          const priceMatches = priceDiffPct <= priceTolerancePercent

          return qtyMatches && priceMatches
        })

        // SADECE VE SADECE TEK 1 ADAY VARSA (Tekillik kesinse)
        if (matchingPriceAndQtyCandidates.length === 1) {
          matchedRcptLine = matchingPriceAndQtyCandidates[0]
          matchMethod = 'UNIQUE_QTY_PRICE'
          matchConfidenceScore = 92
          matchMethodLabel = `Miktar & Fiyat Tekilliği (${invQty} Adet x ${invUnitPrice.toFixed(2)} ₺)`
          matchMethodBadge = { bg: 'rgba(6,182,212,0.14)', color: '#06b6d4', icon: 'fa-arrows-to-dot' }
          isCandidateForAutoMapping = true // Onayda hafızaya kaydedilecek
        }
      }

      // 4. KADEME: FONETİK, SES VE BULANIK (FUZZY) BENZERLİK ANALİZİ
      if (!matchedRcptLine) {
        let bestCandidate = null
        let bestScore = 0
        let ambiguousMatches = []

        for (const rcptLine of rcptLines) {
          if (matchedReceiptLineIds.has(rcptLine.id)) continue

          const phoneticSim = calculatePhoneticSimilarity(invLine.item_name, rcptLine.item_name)
          if (phoneticSim >= 0.70) {
            if (phoneticSim > bestScore) {
              bestScore = phoneticSim
              bestCandidate = rcptLine
            }
            if (phoneticSim >= 0.75) {
              ambiguousMatches.push(rcptLine)
            }
          }
        }

        if (bestCandidate && bestScore >= 0.70) {
          matchedRcptLine = bestCandidate
          matchConfidenceScore = Math.round(bestScore * 100)
          matchMethod = 'PHONETIC_SUGGESTION'
          matchMethodLabel = `Fonetik Benzerlik (%${matchConfidenceScore})`
          matchMethodBadge = { bg: 'rgba(245,158,11,0.14)', color: '#f59e0b', icon: 'fa-wand-magic-sparkles' }
          isCandidateForAutoMapping = true
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

      const qtyDiff = invQty - rcptQty
      const unitPriceDiff = invUnitPrice - rcptUnitPrice
      const priceDiffPercent = rcptUnitPrice > 0 ? ((invUnitPrice - rcptUnitPrice) / rcptUnitPrice) * 100 : 0
      const lineTotalDiff = invTotal - rcptTotal

      let status = 'EXACT_MATCH'
      let statusLabel = 'Tam Uyumlu'
      let statusBadge = { bg: 'rgba(16,185,129,0.12)', color: '#10b981', border: '#10b981', icon: 'fa-circle-check' }

      // Check if this line has a contract price violation
      const contractLineViolation = contractValidation?.discrepantLines?.find(
        (dl) =>
          dl.lineIndex === idx + 1 ||
          (dl.stockItemId && dl.stockItemId === (matchedRcptLine?.stock_item_id || invLine.matched_stock_item_id)) ||
          (dl.itemName && invLine.item_name && normalizeString(dl.itemName) === normalizeString(invLine.item_name))
      )

      // Uyuşmazlık Tespiti
      if (contractLineViolation) {
        status = 'CONTRACT_PRICE_VIOLATION'
        statusLabel = `Sözleşme İhlali (+%${contractLineViolation.priceDiffPercent})`
        statusBadge = { bg: 'rgba(239,68,68,0.18)', color: '#ef4444', border: '#ef4444', icon: 'fa-ban' }
        discrepancies.push({
          lineIndex: idx + 1,
          itemName: invLine.item_name,
          type: 'CONTRACT_PRICE_VIOLATION',
          severity: 'danger',
          isContractViolation: true,
          contractNo: contractValidation.contractNo || activeContract?.contract_no,
          contractId: contractValidation.contractId || activeContract?.id,
          contractPrice: contractLineViolation.contractPrice,
          invoicePrice: contractLineViolation.invoicePrice,
          title: `Sözleşme Fiyat İhlali (#${idx + 1})`,
          description: `Geçerliliği devam eden #${contractValidation.contractNo || activeContract?.contract_no} numaralı sözleşmeden farklı fiyatla kesilen fatura kabul edilemez! (Sözleşme Fiyatı: ${contractLineViolation.contractPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺, Fatura Fiyatı: ${contractLineViolation.invoicePrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺)`,
          diffAmount: (contractLineViolation.invoicePrice - contractLineViolation.contractPrice) * invQty,
        })
      } else if (!matchedRcptLine) {
        status = 'NOT_IN_RECEIPT'
        statusLabel = 'İrsaliyede Yok'
        statusBadge = { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '#ef4444', icon: 'fa-circle-question' }
        discrepancies.push({
          lineIndex: idx + 1,
          itemName: invLine.item_name,
          type: 'NOT_IN_RECEIPT',
          severity: 'danger',
          title: `Kalem İrsaliyede Bulunamadı (#${idx + 1})`,
          description: `"${invLine.item_name}" mal kabul irsaliyesinde kayıtlı değil. Faturaya fazladan eklenmiş olabilir veya manuel eşleştirme gerektirir.`,
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
        matchMethod,
        matchConfidenceScore,
        matchMethodLabel,
        matchMethodBadge,
        isCandidateForAutoMapping,
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
        isContractPriceViolation: Boolean(contractLineViolation),
        contractLineViolation: contractLineViolation || null,
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

    const lineRatio = exactMatchLinesCount / totalLines
    score = Math.round(lineRatio * 70) // %70 kalem tam uyumu

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

    const hasContractPriceViolation = Boolean(
      contractValidation?.hasViolation || discrepancies.some((d) => d.type === 'CONTRACT_PRICE_VIOLATION')
    )

    if (hasContractPriceViolation) {
      score = Math.min(score, 40)
    }

    const isFullyMatched = discrepancies.length === 0 && Math.abs(netDiff) <= 1.0 && !hasContractPriceViolation

    return {
      matchScore: isFullyMatched ? 100 : Math.max(0, Math.min(100, score)),
      isFullyMatched,
      hasContractPriceViolation,
      contractValidation: contractValidation || { isValid: true, hasViolation: false, hasContract: false },
      activeContract: activeContract || null,
      status: hasContractPriceViolation ? 'DISCREPANCY' : isFullyMatched ? 'EXACT_MATCH' : score >= 75 ? 'PARTIAL_MATCH' : 'DISCREPANCY',
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
   * 4. Eşleştirmeyi Onaylama, Satırları Bağlama, Cari Hareketi İşleme ve Mapping'i Hafızaya Kaydetme
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
      // 0. Sözleşme Fiyat İhlali Kontrolü (Hard Block)
      if (matchData.hasContractPriceViolation || matchData.contractValidation?.hasViolation) {
        const errorMsg =
          matchData.contractValidation?.violationMessage ||
          'Geçerliliği devam eden sözleşmeden farklı fiyatla kesilen fatura kabul edilemez! Lütfen tedarikçiye itiraz tutanağı veya red uygulama yanıtı iletin.'
        throw new Error(errorMsg)
      }

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

      const isAutoMatched = Boolean((typeof arg1 === 'object' && arg1?.isAutoMatched) || (typeof arg4 === 'object' && arg4?.isAutoMatched) || note?.includes('Otomatik'))

      // 2. Fatura Tablosunu Güncelle (is_matched = true, status_code = 1300)
      const nowIso = new Date().toISOString()
      const { error: invUpdErr } = await db
        .from('e_invoices')
        .update({
          is_matched: true,
          status_code: EINVOICE_STATUS.ACCEPTED, // 1300
          status_description: isAutoMatched
            ? 'Kabul Edildi (⚡ %100 Otomatik Eşleştirildi - 1300)'
            : 'Kabul Edildi (3-Way Matching Onaylandı - 1300)',
          is_auto_matched: isAutoMatched,
          matched_purchase_order_id: orderId,
          matched_receipt_id: receiptId,
          matched_at: nowIso,
          response_code: 'KABUL',
          response_date: nowIso,
          updated_at: nowIso,
        })
        .eq('id', invoiceId)

      if (invUpdErr) throw invUpdErr

      // 3. Fatura Satırlarını Eşleşen Stok ve İrsaliye Satırları ile Güncelle & Mapping'i Hafızaya Kaydet
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

            // Auto-learn / Save Mapping to supplier_item_mappings memory
            if (supplierId && comp.invoiceLine.item_name && comp.receiptLine.stock_item_id) {
              await this.saveSupplierItemMapping(
                supplierId,
                comp.invoiceLine.item_name,
                comp.receiptLine.stock_item_id,
                {
                  supplierItemCode: comp.invoiceLine.item_code || '',
                  unitCode: comp.invoiceLine.unit_code || 'C62',
                  mappingSource: comp.matchMethod === 'UNIQUE_QTY_PRICE' ? 'AUTO_QTY_PRICE' : comp.matchMethod === 'PHONETIC_SUGGESTION' ? 'PHONETIC' : 'MANUAL',
                  confidenceScore: comp.matchConfidenceScore || 100,
                }
              )
            }
          }
        }
      }

      // 4. Cari Hareketler Tablosuna Alacak Kaydı Ekle (Tedarikçi Cari Hesabı)
      const invoiceAmount = Number(invoice.payable_amount || 0)
      if (supplierId && invoiceAmount > 0) {
        const cariPayload = {
          musteri_id: null,
          supplier_id: supplierId,
          tur: 'alacak',
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
          matched_invoice_id: invoiceId,
          is_matched: true,
          meta: updatedMeta,
        })
        .eq('id', receiptId)

      // 6. E-Fatura Eşleştirme Logu Kaydet
      await db.from('e_invoice_matching_logs').insert({
        invoice_id: invoiceId,
        receipt_id: receiptId,
        supplier_id: supplierId,
        matching_type: matchData.status || '3_WAY_MATCHED',
        discrepancy_type: matchData.discrepancies?.length > 0 ? matchData.discrepancies.map((d) => d.type).join(', ') : null,
        discrepancy_amount: matchData.totalNetDiff || 0,
        notes: note || '3-Way Matching UI üzerinden onaylandı ve tedarikçi ürün eşlemeleri hafızaya kaydedildi.',
        performed_by: userPin,
      })

      return {
        success: true,
        message: '3-Way Matching başarıyla onaylandı, stok kalemleri bağlandı ve tedarikçi eşleme hafızası güncellendi.',
        invoiceId,
        receiptId,
        status: EINVOICE_STATUS.ACCEPTED,
      }
    } catch (err) {
      console.error('approveInvoiceReceiptMatch error:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * 8. Fiziki İrsaliye(ler) İçin Entegratörden Gelen Aday E-Faturaları Bulma (Reverse Matching)
   * ZORUNLU KURAL: Yalnızca aynı tedarikçiye (VKN / Ünvan) ait faturalar listelenir. Farklı tedarikçi elenir.
   */
  async findPotentialInvoicesForReceipt(receiptIdOrObjOrList, options = {}) {
    try {
      const receiptList = Array.isArray(receiptIdOrObjOrList)
        ? receiptIdOrObjOrList
        : [receiptIdOrObjOrList]

      if (receiptList.length === 0) {
        return { success: true, receipt: null, supplier: null, candidates: [] }
      }

      // İlk irsaliye veya ana irsaliye objesini normalize et
      let primaryReceipt = receiptList[0]
      if (typeof primaryReceipt !== 'object' || !primaryReceipt?.id) {
        const { data: rcptData, error: rcptErr } = await db
          .from('purchase_receipts')
          .select('*')
          .eq('id', primaryReceipt)
          .single()
        if (rcptErr || !rcptData) throw new Error('İrsaliye bulunamadı.')
        primaryReceipt = rcptData
      }

      // Tüm seçili irsaliyelerin detaylarını ve satırlarını yükle
      const fullReceipts = []
      let cumulativeTotalAmount = 0
      let cumulativeSubtotal = 0
      const allReceiptLines = []
      const allDespatchNumbers = []

      for (const r of receiptList) {
        let rObj = typeof r === 'object' && r !== null && r.id ? r : null
        if (!rObj) {
          const { data } = await db.from('purchase_receipts').select('*').eq('id', r).single()
          if (data) rObj = data
        }
        if (!rObj) continue

        const { data: lines } = await db
          .from('purchase_receipt_lines')
          .select('*')
          .eq('receipt_id', rObj.id)
          .order('line_number', { ascending: true })

        rObj.lines = lines || []
        fullReceipts.push(rObj)

        cumulativeTotalAmount += Number(rObj.total_amount_vat_inc || rObj.total_amount || 0)
        cumulativeSubtotal += Number(rObj.subtotal || rObj.total_amount || 0)

        const dNo = (rObj.receipt_no || rObj.doc_no || rObj.despatch_number || '').trim()
        if (dNo) allDespatchNumbers.push(dNo)

        rObj.lines.forEach((l) => allReceiptLines.push(l))
      }

      // Tedarikçiyi tespit et
      let supplier = null
      const suppId = primaryReceipt.supplier_id
      if (suppId) {
        const { data: sData } = await db.from('suppliers').select('*').eq('id', suppId).single()
        supplier = sData || null
      }

      const rcptSupplierVkn = (supplier?.vergi_no || supplier?.tc_no || primaryReceipt.supplier_vkn || '').trim()
      const rcptSupplierName = (supplier?.name || primaryReceipt.supplier_name || '').trim()
      const rcptSupplierNameNorm = normalizeString(rcptSupplierName)

      // Tedarikçi Mapping Hafızası
      let supplierMappings = []
      if (supplier?.id) {
        supplierMappings = await this.getSupplierItemMappings(supplier.id)
      }

      // Gelen faturaları çek (INBOUND ve açık olanlar)
      const { data: inboundInvoices, error: invErr } = await db
        .from('e_invoices')
        .select('*')
        .eq('direction', 'INBOUND')
        .order('issue_date', { ascending: false })
        .limit(150)

      if (invErr) throw invErr

      const invoiceList = inboundInvoices || []
      const candidates = []

      for (const inv of invoiceList) {
        // --- 1. ZORUNLU KURAL: TEDARİKÇİ EŞLEŞMESİ (HARD FILTER) ---
        const invVkn = String(inv.sender_vkn_tckn || '').trim()
        const invTitle = String(inv.sender_title || '').trim()
        const invTitleNorm = normalizeString(invTitle)

        let isSupplierMatch = false
        if (rcptSupplierVkn && invVkn && rcptSupplierVkn === invVkn) {
          isSupplierMatch = true
        } else if (
          rcptSupplierNameNorm &&
          invTitleNorm &&
          (rcptSupplierNameNorm.includes(invTitleNorm) ||
           invTitleNorm.includes(rcptSupplierNameNorm) ||
           calculateTextSimilarity(rcptSupplierName, invTitle) >= 0.5)
        ) {
          isSupplierMatch = true
        }

        // Tedarikçisi eşleşmiyorsa KESİNLİKLE LİSTEYE ALMA, ATLA!
        if (!isSupplierMatch) {
          continue
        }

        // İlgili faturanın satırlarını çek
        const { data: invLines } = await db
          .from('e_invoice_lines')
          .select('*')
          .eq('invoice_id', inv.id)
          .order('line_number', { ascending: true })

        inv.lines = invLines || []

        // Sentetik konsolide irsaliye objesi
        const consolidatedReceipt = {
          ...primaryReceipt,
          lines: allReceiptLines,
          total_amount: cumulativeTotalAmount,
          subtotal: cumulativeSubtotal,
        }

        // Karşılaştırma Analizi Yap
        const comparison = this.compareInvoiceWithReceipt(inv, consolidatedReceipt, { supplierMappings })

        // 6 Aşamalı Waterfall Pipeline
        const waterfall = this.evaluateWaterfallPipeline(inv, consolidatedReceipt, {
          comparison,
          matchedSupplierId: supplier?.id,
        })

        // Puanlama ve Gerekçeler
        let score = 30 // Tedarikçi eşleştiği için taban puan
        const reasons = ['Tedarikçi Doğrulandı']

        // Numara / Referans Uyumu
        const invDespatches = (inv.parsed_metadata?.extracted_despatch_numbers || []).map((d) => d.toUpperCase())
        if (inv.despatch_document_reference) invDespatches.push(inv.despatch_document_reference.toUpperCase())

        const hasDocMatch = allDespatchNumbers.some((dNo) => {
          const up = dNo.toUpperCase()
          return invDespatches.includes(up) || (inv.notes && inv.notes.toUpperCase().includes(up))
        })

        if (hasDocMatch) {
          score += 35
          reasons.push('İrsaliye Numarası Referanslı')
        }

        // Tutar Uyumu (Kümülatif toplam vs Fatura)
        const invTotal = Number(inv.payable_amount || inv.tax_inclusive_amount || 0)
        const diffTotal = Math.abs(cumulativeTotalAmount - invTotal)
        const maxVal = Math.max(cumulativeTotalAmount, invTotal)
        const ratio = maxVal > 0 ? diffTotal / maxVal : 1

        if (diffTotal < 0.05) {
          score += 35
          reasons.push('Fatura Tutarı İrsaliye(ler) ile Birebir Eşit')
        } else if (ratio < 0.05) {
          score += 20
          reasons.push(`Tutar %${(ratio * 100).toFixed(1)} Tolerans İçinde`)
        }

        // Kalem Eşleşmesi
        if (comparison.matchedLinesCount > 0) {
          reasons.push(`${comparison.matchedLinesCount} Kalem Birebir Uyumlu`)
        }

        const finalScore = Math.min(100, Math.max(score, waterfall.totalScore, comparison.matchScore || 0))

        candidates.push({
          invoice: inv,
          matchScore: finalScore,
          reasons,
          comparison,
          waterfall,
          lineComparisons: comparison.lineComparisons,
          isExactAmount: diffTotal < 0.05,
          totalDiff: invTotal - cumulativeTotalAmount,
          selectedReceiptsCount: fullReceipts.length,
          cumulativeReceiptsTotal: cumulativeTotalAmount,
        })
      }

      // En yüksek puana göre sırala
      candidates.sort((a, b) => b.matchScore - a.matchScore)

      return {
        success: true,
        receipt: primaryReceipt,
        receiptList: fullReceipts,
        supplier,
        candidates,
        cumulativeTotalAmount,
        selectedReceiptsCount: fullReceipts.length,
      }
    } catch (err) {
      console.error('findPotentialInvoicesForReceipt error:', err)
      return { success: false, error: err.message, candidates: [] }
    }
  }

  /**
   * 9. Belge Girişi (expense_documents) İçin Gelen Aday E-Faturaları Bulma
   */
  async findPotentialInvoicesForDocument(docIdOrObj, options = {}) {
    try {
      let document = null
      if (typeof docIdOrObj === 'object' && docIdOrObj !== null && docIdOrObj.id) {
        document = { ...docIdOrObj }
      } else {
        const { data: docData, error: docErr } = await db
          .from('expense_documents')
          .select('*')
          .eq('id', docIdOrObj)
          .single()
        if (docErr || !docData) throw new Error('Belge bulunamadı.')
        document = docData
      }

      // Tedarikçiyi yükle
      let supplier = null
      if (document.supplier_id) {
        const { data: sData } = await db.from('suppliers').select('*').eq('id', document.supplier_id).single()
        supplier = sData || null
      }

      // Gelen faturaları çek
      const { data: inboundInvoices, error: invErr } = await db
        .from('e_invoices')
        .select('*')
        .eq('direction', 'INBOUND')
        .order('issue_date', { ascending: false })
        .limit(100)

      if (invErr) throw invErr

      const invoiceList = inboundInvoices || []
      const candidates = []

      for (const inv of invoiceList) {
        let score = 0
        const reasons = []

        // 1. Belge No / Fatura No Uyumu
        if (
          document.document_no &&
          inv.invoice_number &&
          normalizeString(document.document_no) === normalizeString(inv.invoice_number)
        ) {
          score += 60
          reasons.push('Fatura Numarası Birebir Eşleşti')
        }

        // 2. Tedarikçi Uyumu
        if (supplier) {
          const cleanVkn = supplier.vergi_no ? String(supplier.vergi_no).trim() : ''
          const invVkn = inv.sender_vkn_tckn ? String(inv.sender_vkn_tckn).trim() : ''
          if (cleanVkn && invVkn && cleanVkn === invVkn) {
            score += 30
            reasons.push('Tedarikçi VKN Tam Uyumlu')
          } else if (
            supplier.name &&
            inv.sender_title &&
            calculateTextSimilarity(supplier.name, inv.sender_title) >= 0.5
          ) {
            score += 20
            reasons.push('Tedarikçi Ünvan Benzerliği')
          }
        }

        // 3. Tutar Uyumu
        const docAmount = Number(document.amount || document.source_amount || 0)
        const invAmount = Number(inv.payable_amount || 0)
        if (docAmount > 0 && invAmount > 0) {
          const diff = Math.abs(docAmount - invAmount)
          const diffRatio = diff / Math.max(docAmount, invAmount)
          if (diffRatio < 0.01) {
            score += 20
            reasons.push('Tutar Birebir Eşit')
          } else if (diffRatio < 0.05) {
            score += 10
            reasons.push(`Tutar Farkı %${(diffRatio * 100).toFixed(1)}`)
          }
        }

        // 4. Tarih Yakınlığı
        if (document.document_date && inv.issue_date) {
          const dDoc = new Date(document.document_date).getTime()
          const dInv = new Date(inv.issue_date).getTime()
          const daysDiff = Math.abs(dInv - dDoc) / (1000 * 3600 * 24)
          if (daysDiff <= 7) {
            score += 10
            reasons.push('Tarih 7 Gün İçinde')
          }
        }

        candidates.push({
          invoice: inv,
          matchScore: Math.min(100, score),
          reasons,
          docAmount,
          invAmount,
          totalDiff: invAmount - docAmount,
        })
      }

      candidates.sort((a, b) => b.matchScore - a.matchScore)

      return {
        success: true,
        document,
        supplier,
        candidates,
      }
    } catch (err) {
      console.error('findPotentialInvoicesForDocument error:', err)
      return { success: false, error: err.message, candidates: [] }
    }
  }

  /**
   * 10. Belge ile E-Fatura Eşleştirmesini Onaylama
   */
  async approveDocumentInvoiceMatch(documentId, invoiceId, options = {}) {
    const { userPin = 'SISTEM', note = '' } = options
    try {
      const nowIso = new Date().toISOString()

      // Belgeyi güncelle
      await db
        .from('expense_documents')
        .update({
          matched_invoice_id: invoiceId,
          is_matched: true,
        })
        .eq('id', documentId)

      // E-Faturayı güncelle
      await db
        .from('e_invoices')
        .update({
          matched_document_id: documentId,
          is_matched: true,
          status_code: EINVOICE_STATUS.ACCEPTED,
          response_code: 'KABUL',
          response_date: nowIso,
          response_reason: 'Manuel Belge Girişi ile Eşleştirildi',
        })
        .eq('id', invoiceId)

      // Log kaydet
      await db.from('e_invoice_matching_logs').insert({
        invoice_id: invoiceId,
        receipt_id: null,
        matching_type: 'DOCUMENT_MATCHED',
        notes: note || `Belge (#${documentId}) e-Fatura ile eşleştirildi.`,
        performed_by: userPin,
      })

      return {
        success: true,
        message: 'Belge ile e-Fatura başarıyla eşleştirildi.',
        documentId,
        invoiceId,
      }
    } catch (err) {
      console.error('approveDocumentInvoiceMatch error:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * 11. 6 AŞAMALI KADEMELİ DOĞRULAMA PİPELİNE (WATERFALL EVALUATION)
   * 1. Aşama: Tedarikçi Eşleşmesi (Zorunlu)
   * 2. Aşama: İrsaliye / Fatura Numarası Çapraz Eşleşmesi (İrsaliyeli fatura toleranslı)
   * 3. Aşama: Tarih Karşılaştırması & Toleransı (İrsaliye <= Fatura, esnek pencere)
   * 4. Aşama: Kalem (Satır) Sayısı Karşılaştırması
   * 5. Aşama: Satır Detayları (Ürün, Miktar ve Birim Fiyatlar)
   * 6. Aşama: Sözleşme Fiyat Doğrulaması & Tolerans Denetimi
   */
  evaluateWaterfallPipeline(invoice, receipt, options = {}) {
    const invLines = invoice.lines || []
    const rcptLines = receipt.lines || []
    const checklist = []
    let totalScore = 0

    // 1. AŞAMA: Tedarikçi Eşleşmesi
    const supplierMatched = Boolean(
      (invoice.sender_vkn_tckn && receipt.supplier_vkn && invoice.sender_vkn_tckn === receipt.supplier_vkn) ||
      (receipt.supplier_name && invoice.sender_title && normalizeString(receipt.supplier_name) === normalizeString(invoice.sender_title)) ||
      (options.matchedSupplierId && receipt.supplier_id === options.matchedSupplierId)
    )

    checklist.push({
      step: 1,
      title: 'Tedarikçi Doğrulaması',
      passed: supplierMatched,
      status: supplierMatched ? 'SUCCESS' : 'FAILED',
      detail: supplierMatched
        ? `Tedarikçi doğrulandı: ${receipt.supplier_name || invoice.sender_title}`
        : 'Tedarikçi bilgileri eşleşmedi.',
      score: supplierMatched ? 25 : 0,
    })
    if (supplierMatched) totalScore += 25

    // 2. AŞAMA: İrsaliye / Fatura No Çapraz Kontrolü (İrsaliyeli Fatura Desteği)
    const invNo = (invoice.invoice_number || '').trim().toUpperCase()
    const parsedDespatches = (invoice.parsed_metadata?.extracted_despatch_numbers || []).map(d => d.toUpperCase())
    if (invoice.despatch_document_reference) parsedDespatches.push(invoice.despatch_document_reference.toUpperCase())

    const rcptDespatchNo = (receipt.despatch_number || receipt.receipt_number || '').trim().toUpperCase()
    const rcptDocNo = (receipt.invoice_number || receipt.document_no || '').trim().toUpperCase()

    let numMatched = false
    let isCrossBilled = false
    let numDetail = 'İrsaliye numarası referansı bulunamadı.'

    if (rcptDespatchNo && (parsedDespatches.includes(rcptDespatchNo) || (invoice.notes && invoice.notes.toUpperCase().includes(rcptDespatchNo)))) {
      numMatched = true
      numDetail = `İrsaliye numarası eşleşti: #${rcptDespatchNo}`
    } else if (rcptDocNo && (parsedDespatches.includes(rcptDocNo) || rcptDocNo === invNo)) {
      numMatched = true
      numDetail = `Belge numarası eşleşti: #${rcptDocNo}`
    } else if (rcptDespatchNo && rcptDespatchNo === invNo) {
      // Çapraz Eşleşme: Personel fatura no'yu irsaliye no hanesine yazmış!
      numMatched = true
      isCrossBilled = true
      numDetail = `⚠️ İrsaliyeli Fatura Çapraz Eşleşmesi: Personel fatura numarasını (${invNo}) irsaliye alanına kaydetmiş.`
    }

    checklist.push({
      step: 2,
      title: 'Numara & Referans Doğrulaması',
      passed: numMatched,
      isCrossBilled,
      status: numMatched ? 'SUCCESS' : 'WARNING',
      detail: numDetail,
      score: numMatched ? 25 : 5,
    })
    totalScore += numMatched ? 25 : 5

    // 3. AŞAMA: Tarih Karşılaştırması & Toleransı
    let datePassed = false
    let dateDetail = 'Tarih bilgisi eksik.'
    if (invoice.issue_date && (receipt.delivered_on || receipt.created_at)) {
      const invDate = new Date(invoice.issue_date + 'T00:00:00')
      const rcptDate = new Date((receipt.delivered_on || receipt.created_at).slice(0, 10) + 'T00:00:00')
      const diffDays = Math.round((invDate - rcptDate) / (1000 * 60 * 60 * 24))

      if (diffDays >= 0 && diffDays <= 15) {
        datePassed = true
        dateDetail = diffDays === 0 ? 'İrsaliye ve fatura tarihi aynı gün.' : `İrsaliye fatura tarihinden ${diffDays} gün önce (Yasal tolerans içinde).`
      } else if (Math.abs(diffDays) <= 30) {
        datePassed = true
        dateDetail = `Tarih farkı: ${Math.abs(diffDays)} gün (Genişletilmiş aralık).`
      } else {
        dateDetail = `Tarih farkı ${Math.abs(diffDays)} gün ile tolerans dışı.`
      }
    }

    checklist.push({
      step: 3,
      title: 'Tarih Uyumu & Toleransı',
      passed: datePassed,
      status: datePassed ? 'SUCCESS' : 'WARNING',
      detail: dateDetail,
      score: datePassed ? 15 : 5,
    })
    totalScore += datePassed ? 15 : 5

    // 4. AŞAMA: Kalem (Satır) Sayısı Karşılaştırması
    const lineCountDiff = Math.abs(invLines.length - rcptLines.length)
    const lineCountMatched = lineCountDiff === 0 && invLines.length > 0

    checklist.push({
      step: 4,
      title: 'Kalem (Satır) Sayısı',
      passed: lineCountMatched,
      status: lineCountMatched ? 'SUCCESS' : (lineCountDiff <= 2 ? 'WARNING' : 'FAILED'),
      detail: lineCountMatched
        ? `Birebir eşit: ${invLines.length} kalem`
        : `Fatura: ${invLines.length} kalem, İrsaliye: ${rcptLines.length} kalem (Fark: ${lineCountDiff})`,
      score: lineCountMatched ? 15 : Math.max(0, 15 - lineCountDiff * 3),
    })
    totalScore += lineCountMatched ? 15 : Math.max(0, 15 - lineCountDiff * 3)

    // 5. AŞAMA: Satır Detayları (Miktar ve Birim Fiyatlar)
    const lineComparison = options.comparison || this.compareInvoiceWithReceipt(invoice, receipt, options)
    const matchedLinesRatio = invLines.length > 0 ? (lineComparison.matchedLinesCount / invLines.length) : 0
    const itemsPassed = matchedLinesRatio >= 0.8

    checklist.push({
      step: 5,
      title: 'Ürün, Miktar & Fiyat Eşleşmesi',
      passed: itemsPassed,
      status: matchedLinesRatio === 1 ? 'SUCCESS' : (matchedLinesRatio >= 0.5 ? 'WARNING' : 'FAILED'),
      detail: `${invLines.length} faturanın ${lineComparison.matchedLinesCount} kalemi (%${Math.round(matchedLinesRatio * 100)}) irsaliye ile eşleşti.`,
      score: Math.round(matchedLinesRatio * 20),
    })
    totalScore += Math.round(matchedLinesRatio * 20)

    // 6. AŞAMA: Sözleşme Fiyat Doğrulaması
    const contractVal = options.contractValidation || lineComparison.contractValidation || { hasContract: false, hasViolation: false }
    const contractPassed = !contractVal.hasViolation

    checklist.push({
      step: 6,
      title: 'Sözleşme Fiyat Denetimi',
      passed: contractPassed,
      hasContract: contractVal.hasContract,
      status: contractVal.hasViolation ? 'FAILED' : (contractVal.hasContract ? 'SUCCESS' : 'INFO'),
      detail: contractVal.hasViolation
        ? `⚠️ Sözleşme İhlali: ${contractVal.violationMessage || 'Fiyat aşımı tespit edildi'}`
        : (contractVal.hasContract ? `Sözleşme fiyatları onaylandı (#${contractVal.contractNo || 'Aktif'})` : 'Bu tedarikçi için aktif sözleşme kaydı yok.'),
      score: contractVal.hasViolation ? 0 : (contractVal.hasContract ? 10 : 5),
    })
    totalScore += contractVal.hasViolation ? 0 : (contractVal.hasContract ? 10 : 5)

    return {
      totalScore: Math.min(100, totalScore),
      checklist,
      isFullyPassed: checklist.every(c => c.passed),
      hasViolation: contractVal.hasViolation,
      isCrossBilled,
    }
  }

  /**
   * 12. ÇOKLU İRSALİYE KONSOLİDASYONU VE CANLI TUTAR DENGELEME (N:1)
   */
  evaluateMultiReceiptConsolidation(invoice, receiptsList = []) {
    const invPayable = Number(invoice.payable_amount || invoice.tax_inclusive_amount || 0)
    let totalReceiptsAmount = 0
    let totalReceiptsTax = 0
    const aggregatedLines = []

    receiptsList.forEach((rcpt) => {
      const amt = Number(rcpt.total_amount_vat_inc || rcpt.total_amount || 0)
      const tax = Number(rcpt.tax_amount || 0)
      totalReceiptsAmount += amt
      totalReceiptsTax += tax

      const lines = rcpt.lines || []
      lines.forEach((l) => {
        aggregatedLines.push({
          ...l,
          receiptId: rcpt.id,
          receiptDespatchNo: rcpt.despatch_number || rcpt.receipt_number || 'İRSALİYE',
          deliveredOn: rcpt.delivered_on,
        })
      })
    })

    totalReceiptsAmount = Math.round(totalReceiptsAmount * 100) / 100
    const difference = Math.round((invPayable - totalReceiptsAmount) * 100) / 100
    const isBalanced = Math.abs(difference) <= 0.05

    return {
      invoicePayable: invPayable,
      selectedReceiptsCount: receiptsList.length,
      totalReceiptsAmount,
      totalReceiptsTax,
      difference,
      isBalanced,
      status: isBalanced ? 'BALANCED' : (difference > 0 ? 'MISSING_RECEIPTS' : 'EXCEEDED'),
      statusLabel: isBalanced
        ? 'Denge Sağlandı (Tam Eşleşme) ✅'
        : (difference > 0
            ? `Kalan Tutar: ${difference.toFixed(2)} ₺ (Eklenmesi gereken irsaliye var)`
            : `Fatura Aşıldı: ${Math.abs(difference).toFixed(2)} ₺ fazla irsaliye seçildi`),
      aggregatedLines,
    }
  }

  /**
   * 13. HİZMET FATURALARI İÇİN AÇIK TAHAKKUK VE MASRAF BELGELERİNİ ARAMA
   */
  async findPotentialAccrualsForInvoice(invoiceIdOrObj) {
    try {
      let invoice = invoiceIdOrObj
      if (typeof invoiceIdOrObj !== 'object' || !invoiceIdOrObj?.id) {
        const invRes = await eInvoiceService.getInvoiceDetails(invoiceIdOrObj)
        if (!invRes.success) throw new Error(invRes.error)
        invoice = invRes.data
      }

      const invAmount = Number(invoice.payable_amount || invoice.tax_inclusive_amount || 0)
      const invTitleNorm = normalizeString(invoice.sender_title)

      // Açık tahakkuk ve faturası henüz gelmemiş masraf kayıtlarını çek
      const { data: allAccruals, error: accErr } = await db
        .from('expense_documents')
        .select('*')
        .or('doc_type.eq.accrual,is_matched.eq.false,is_matched.is.null')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(30)

      if (accErr) throw accErr

      const candidates = (allAccruals || []).map((acc) => {
        const accAmount = Number(acc.amount || 0)
        const diff = invAmount - accAmount
        const diffAbs = Math.abs(diff)
        const diffPct = accAmount > 0 ? (diffAbs / accAmount) * 100 : 100

        let score = 0
        const reasons = []

        // 1. Tedarikçi / Kurum İsmi Uyumu
        if (acc.supplier_name && invTitleNorm && (normalizeString(acc.supplier_name).includes(invTitleNorm) || invTitleNorm.includes(normalizeString(acc.supplier_name)))) {
          score += 45
          reasons.push('Kurum/Tedarikçi İsmi Uyumlu')
        }

        // 2. Tutar Yakınlığı
        if (diffAbs <= 0.05) {
          score += 45
          reasons.push('Tahakkuk Tutarı Birebir Eşit')
        } else if (diffPct <= 10) {
          score += 35
          reasons.push(`Tutar %${diffPct.toFixed(1)} Sapma İçinde`)
        } else if (diffPct <= 25) {
          score += 20
          reasons.push(`Tutar %${diffPct.toFixed(1)} Sapma İçinde`)
        }

        // 3. Tahakkuk Belge Tipi
        if (acc.doc_type === 'accrual') {
          score += 15
          reasons.push('Açık Gider Tahakkuku')
        }

        return {
          accrual: acc,
          matchScore: Math.min(100, score),
          reasons,
          invoiceAmount: invAmount,
          accrualAmount: accAmount,
          difference: diff,
          budgetVariancePercent: accAmount > 0 ? Math.round((diff / accAmount) * 10000) / 100 : 0,
        }
      })

      candidates.sort((a, b) => b.matchScore - a.matchScore)

      return {
        success: true,
        invoice,
        candidates,
        bestMatch: candidates.length > 0 && candidates[0].matchScore >= 40 ? candidates[0] : null,
      }
    } catch (err) {
      console.error('findPotentialAccrualsForInvoice error:', err)
      return { success: false, error: err.message, candidates: [] }
    }
  }

  /**
   * 14. UYUŞMAZLIK / İTİRAZ METNİ ÜRETİCİ
   */
  generateDisputeSummaryText(invoice, receipt, comparison) {
    if (!invoice) return ''
    const supplierTitle = invoice.sender_title || 'Tedarikçi'
    const invNo = invoice.invoice_number || 'Belirtilmemiş'
    const invDate = invoice.issue_date || ''
    const invAmount = Number(invoice.payable_amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })
    const rcptNo = receipt?.receipt_number || receipt?.delivery_note_number || 'Fiziki Mal Kabul'
    const rcptDate = receipt?.delivered_on || receipt?.created_at || ''
    const rcptAmount = Number(receipt?.total_amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })
    const diffAmount = comparison?.totalNetDiff ? Math.abs(comparison.totalNetDiff).toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '0,00'

    let text = `SAYIN ${supplierTitle.toUpperCase()},\n\n`
    text += `Şirketimize düzenlemiş olduğunuz ${invDate} tarihli ve #${invNo} numaralı, ${invAmount} ₺ tutarındaki e-faturanız ile tesislerimizde gerçekleştirilen mal kabul fiziki irsaliyesi (#${rcptNo}) arasında yapılan 3-Way Matching denetiminde uyuşmazlıklar tespit edilmiştir.\n\n`
    text += `TESPİT EDİLEN UYUŞMAZLIKLAR:\n`
    text += `------------------------------------------------------------\n`

    if (comparison?.discrepancies && comparison.discrepancies.length > 0) {
      comparison.discrepancies.forEach((d, idx) => {
        text += `${idx + 1}. [${d.type || 'FARK'}] ${d.title}\n   Detay: ${d.description || ''}\n`
      })
    } else {
      text += `• Fatura tutarı (${invAmount} ₺) ile fiziki mal kabul tutarı (${rcptAmount} ₺) arasında ${diffAmount} ₺ tutarında mutabakatsızlık bulunmaktadır.\n`
    }

    text += `------------------------------------------------------------\n`
    text += `SONUÇ VE TALEP:\n`
    text += `Yukarıda listelenen uyuşmazlıklar doğrultusunda faturanız mevcut haliyle kabul edilememektedir.\n`
    text += `Lütfen aradaki net ${diffAmount} ₺ fark için tarafımıza FİYAT FARKI / İADE FATURASI düzenleyiniz veya faturayı GİB üzerinden iptal ederek düzeltilmiş yeni faturanızı iletiniz.\n\n`
    text += `Saygılarımızla,\nSuitableRMS Mal Kabul & Muhasebe Denetim Birimi`

    return text
  }

  /**
   * 15. TİCARİ FATURA RED VE UYUŞMAZLIK LOGU OLUŞTURMA
   */
  async rejectInvoiceWithDiscrepancy({ invoiceId, receiptId, reason, discrepancies = [], userPin = 'ADMIN' }) {
    try {
      if (!invoiceId) throw new Error('Fatura ID belirtilmedi.')

      // 1. Faturayı güncelle
      const { data: invArr, error: invFetchErr } = await db.from('e_invoices').select('*').eq('id', invoiceId).limit(1)
      if (invFetchErr) throw invFetchErr
      const invoice = invArr?.[0]
      if (!invoice) throw new Error('Fatura bulunamadı.')

      const { error: updErr } = await db
        .from('e_invoices')
        .update({
          status_code: EINVOICE_STATUS.REJECTED,
          commercial_status: 'REDDEDILDI',
          commercial_response_notes: reason,
          commercial_responded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoiceId)

      if (updErr) throw updErr

      // 2. Matching log kaydı oluştur
      await db.from('e_invoice_matching_logs').insert({
        invoice_id: invoiceId,
        matching_type: 'DISPUTE_REJECTION',
        matched_entity_id: receiptId || null,
        matched_entity_type: receiptId ? 'purchase_receipts' : 'none',
        discrepancy_type: discrepancies.length > 0 ? discrepancies[0].type : 'GENERAL_DISPUTE',
        discrepancy_amount: Math.abs(Number(invoice.payable_amount || 0)),
        notes: `Ticari Red & İtiraz Tutanağı Kaydedildi. Gerekçe: ${reason}`,
        performed_by: userPin,
      })

      return {
        success: true,
        message: `Fatura #${invoice.invoice_number} için İtiraz / Ticari Red işlemi başarıyla kaydedildi.`,
      }
    } catch (err) {
      console.error('rejectInvoiceWithDiscrepancy error:', err)
      return { success: false, error: err.message }
    }
  }
}

export const matchingEngine = new MatchingEngine()

