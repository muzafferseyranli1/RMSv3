import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { db } from '@/lib/db'
import { useToast } from '@/hooks/useToast'
import { eInvoiceService } from '@/lib/eInvoice/eInvoiceService'
import { matchingEngine } from '@/lib/eInvoice/matchingEngine'
import { interCompanyTransferService } from '@/lib/eInvoice/interCompanyTransferService'
import { findActiveContractForSupplier } from '@/lib/eInvoice/contractPriceValidator'
import { eAdisyonService, EADISYON_STATUS, EADISYON_STATUS_META } from '@/lib/eInvoice/eAdisyonService'
import {
  EINVOICE_STATUS,
  EINVOICE_STATUS_META,
  getStatusMeta,
  getProfileMeta,
  getTypeMeta,
} from '@/lib/eInvoice/types'

export default function EInvoiceManager() {
  const toast = useToast()

  // State
  const [activeTab, setActiveTab] = useState('inbox') // 'inbox', 'outbox', 'intercompany', 'eadisyon', 'settings'
  const [interCompanyFilter, setInterCompanyFilter] = useState('ALL') // 'ALL', 'INTER_COMPANY_ONLY', 'SUPPLIER_ONLY'
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState({
    totalInboundCount: 0,
    totalInboundAmount: 0,
    pendingApprovalCount: 0,
    acceptedCount: 0,
    rejectedCount: 0,
    totalOutboundCount: 0,
    totalOutboundAmount: 0,
    totalInterCompanyCount: 0,
    totalInterCompanyAmount: 0,
  })

  // Invoices list
  const [invoices, setInvoices] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')

  // Selected Invoice for Preview Modal
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [previewTab, setPreviewTab] = useState('html') // 'html', 'xml', 'lines'
  const [loadingDetails, setLoadingDetails] = useState(false)

  // 3-Way Matching Modal State
  const [matchingModalOpen, setMatchingModalOpen] = useState(false)
  const [matchingInvoice, setMatchingInvoice] = useState(null)
  const [matchingLoading, setMatchingLoading] = useState(false)
  const [candidateReceipts, setCandidateReceipts] = useState([])
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState(0)
  const [matchedSupplierInfo, setMatchedSupplierInfo] = useState(null)
  const [toleranceSettings, setToleranceSettings] = useState({
    priceTolerancePercent: 1.0,
    qtyTolerance: 0.01,
    checkTaxRates: true,
  })
  const [toleranceModalOpen, setToleranceModalOpen] = useState(false)
  const [showOnlyDiscrepantLines, setShowOnlyDiscrepantLines] = useState(false)
  const [approvingMatch, setApprovingMatch] = useState(false)
  const [matchingNote, setMatchingNote] = useState('')

  // Dispute & Rejection Modal State
  const [disputeModalOpen, setDisputeModalOpen] = useState(false)
  const [disputeReason, setDisputeReason] = useState('')
  const [disputeSummaryText, setDisputeSummaryText] = useState('')
  const [rejectingDispute, setRejectingDispute] = useState(false)

  // Response Modal State (Commercial Accept / Reject)
  const [responseModalOpen, setResponseModalOpen] = useState(false)
  const [respondingInvoice, setRespondingInvoice] = useState(null)
  const [responseType, setResponseType] = useState('KABUL')
  const [responseReason, setResponseReason] = useState('')
  const [submittingResponse, setSubmittingResponse] = useState(false)

  // Contract Quick View Modal State
  const [contractModalOpen, setContractModalOpen] = useState(false)
  const [viewingContract, setViewingContract] = useState(null)
  const [loadingContract, setLoadingContract] = useState(false)

  // Manual Item Mapping Modal State (Supplier Item Cross-Reference)
  const [mappingModalOpen, setMappingModalOpen] = useState(false)
  const [mappingTargetLine, setMappingTargetLine] = useState(null)
  const [stockItemsList, setStockItemsList] = useState([])
  const [stockSearchQuery, setStockSearchQuery] = useState('')
  const [selectedStockForMapping, setSelectedStockForMapping] = useState(null)
  const [saveToMemoryChecked, setSaveToMemoryChecked] = useState(true)
  const [savingMapping, setSavingMapping] = useState(false)

  const loadStockItemsForMapping = async () => {
    if (stockItemsList.length > 0) return
    const { data } = await db
      .from('stock_items')
      .select('id, name, sku, unit, current_cost')
      .is('deleted_at', null)
      .order('name', { ascending: true })
    if (data) setStockItemsList(data)
  }

  const handleOpenItemMappingModal = (lineComp) => {
    setMappingTargetLine(lineComp)
    setSelectedStockForMapping(
      lineComp.receiptLine
        ? { id: lineComp.receiptLine.stock_item_id, name: lineComp.receiptLine.item_name, sku: lineComp.receiptLine.item_sku }
        : null
    )
    setStockSearchQuery('')
    setSaveToMemoryChecked(true)
    setMappingModalOpen(true)
    loadStockItemsForMapping()
  }

  const handleSaveItemMapping = async () => {
    if (!selectedStockForMapping || !mappingTargetLine || !matchingInvoice) {
      toast('Lütfen eşleştirilecek bir RMS stok kartı seçin.', 'error')
      return
    }

    setSavingMapping(true)
    try {
      const supplierId = matchedSupplierInfo?.id || activeCandidate?.receipt?.supplier_id
      const invoiceItemName = mappingTargetLine.invoiceLine.item_name
      const invoiceItemCode = mappingTargetLine.invoiceLine.item_code || ''

      if (saveToMemoryChecked && supplierId) {
        await matchingEngine.saveSupplierItemMapping(supplierId, invoiceItemName, selectedStockForMapping.id, {
          supplierItemCode: invoiceItemCode,
          unitCode: mappingTargetLine.invoiceLine.unit_code || 'C62',
          mappingSource: 'MANUAL',
          confidenceScore: 100,
        })
      }

      toast(`✅ "${invoiceItemName}" ➔ "${selectedStockForMapping.name}" eşleştirmesi hafızaya kaydedildi!`, 'success')
      setMappingModalOpen(false)

      // Refresh candidate comparisons immediately
      await handleOpenMatchingModal(matchingInvoice)
    } catch (err) {
      console.error('Mapping save error:', err)
      toast('Eşleştirme kaydedilirken hata: ' + err.message, 'error')
    } finally {
      setSavingMapping(false)
    }
  }

  const handleOpenContractModal = async (contractOrId) => {
    if (!contractOrId) return
    setContractModalOpen(true)
    if (typeof contractOrId === 'object' && contractOrId !== null) {
      setViewingContract(contractOrId)
    } else {
      setLoadingContract(true)
      try {
        const { data } = await db.from('contracts').select('*').eq('id', contractOrId).single()
        if (data) setViewingContract(data)
      } catch (err) {
        console.error('Contract load error:', err)
      } finally {
        setLoadingContract(false)
      }
    }
  }

  // Settings State
  const [integratorConfig, setIntegratorConfig] = useState({
    provider: 'mock',
    sender_vkn_tckn: '1234567890',
    sender_title: 'SuitableRMS Restoran Grubu A.Ş.',
    sender_tax_office: 'Beşiktaş',
    sender_address: 'Nispetiye Cad. No:12 Beşiktaş / İstanbul',
    alias_pk: 'urn:mail:defaultpk@gib.gov.tr',
    alias_gb: 'urn:mail:defaultgb@gib.gov.tr',
    username: '',
    password: '',
    api_key: '',
    api_secret: '',
    is_active: true,
    is_test_mode: true,
    auto_fetch_interval_min: 15,
  })
  const [savingConfig, setSavingConfig] = useState(false)

  // Live Connection Test & Tax Payer Query
  const [testingConnection, setTestingConnection] = useState(false)
  const [testConnectionResult, setTestConnectionResult] = useState(null)
  const [taxPayerQueryVkn, setTaxPayerQueryVkn] = useState('3248921839')
  const [taxPayerQueryResult, setTaxPayerQueryResult] = useState(null)
  const [queryingTaxPayer, setQueryingTaxPayer] = useState(false)
  const [syncingInbounds, setSyncingInbounds] = useState(false)

  // E-Adisyon State
  const [eadisyons, setEadisyons] = useState([])
  const [loadingEAdisyons, setLoadingEAdisyons] = useState(false)
  const [eadisyonFilter, setEAdisyonFilter] = useState('ALL')
  const [selectedEAdisyon, setSelectedEAdisyon] = useState(null)
  const [eadisyonDetailsModalOpen, setEAdisyonDetailsModalOpen] = useState(false)
  const [eadisyonCompliance, setEAdisyonCompliance] = useState({
    totalCount: 0,
    openCount: 0,
    invoicedCount: 0,
    closedCount: 0,
    cancelledCount: 0,
    complianceScore: 100,
    compliantLinked: 0,
    vukStandard: 'VUK 509 / 526 Uyumludur',
    isGibCompliant: true,
  })

  // New E-Adisyon Modal State
  const [newAdisyonModalOpen, setNewAdisyonModalOpen] = useState(false)
  const [newAdisyonForm, setNewAdisyonForm] = useState({
    table_name: 'Masa 4 (Bahçe)',
    table_key: 'BAHCE_M4',
    waiter_name: 'Ahmet Y.',
    guest_count: 2,
    items: [
      { item_name: 'Özel Suitable Burger 180g', item_code: 'MNU-BGR-01', quantity: 2, unit_price: 320, tax_rate: 10 },
      { item_name: 'Patates Kızartması Trüflü', item_code: 'MNU-PAT-02', quantity: 1, unit_price: 140, tax_rate: 10 },
      { item_name: 'Kutu Kola 330ml', item_code: 'IC-KOL-01', quantity: 2, unit_price: 65, tax_rate: 10 },
    ],
  })
  const [creatingAdisyon, setCreatingAdisyon] = useState(false)

  // Convert E-Adisyon to Invoice Modal State
  const [convertModalOpen, setConvertModalOpen] = useState(false)
  const [convertingAdisyon, setConvertingAdisyon] = useState(null)
  const [convertInvoiceForm, setConvertInvoiceForm] = useState({
    profile_id: 'EARSIVFATURA',
    receiver_vkn_tckn: '11111111111',
    receiver_title: 'Nihai Tüketici (Müşteri)',
    receiver_tax_office: '',
    receiver_address: 'Nispetiye Cad. Beşiktaş / İstanbul',
    notes: '',
  })
  const [submittingConversion, setSubmittingConversion] = useState(false)

  // Load Invoices, EAdisyons & Stats
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      let direction = 'INBOUND'
      let isInterCompany = null

      if (activeTab === 'outbox') {
        direction = 'OUTBOUND'
      } else if (activeTab === 'intercompany') {
        direction = 'ALL'
        isInterCompany = true
      }

      if (interCompanyFilter === 'INTER_COMPANY_ONLY') {
        isInterCompany = true
      } else if (interCompanyFilter === 'SUPPLIER_ONLY') {
        isInterCompany = false
      }

      const statusCode = statusFilter !== 'ALL' ? Number(statusFilter) : null

      const [invoicesRes, statsRes, configRes, adisyonsRes, compRes] = await Promise.all([
        eInvoiceService.getInvoices({ direction, statusCode, isInterCompany, search: searchQuery }),
        eInvoiceService.getStatistics(),
        eInvoiceService.getIntegratorConfig(),
        eAdisyonService.getEAdisyons({ status: eadisyonFilter, search: searchQuery }),
        eAdisyonService.getEAdisyonComplianceReport(),
      ])

      if (invoicesRes.success) {
        setInvoices(invoicesRes.data)
      }
      if (statsRes) setStats(statsRes)
      if (configRes) setIntegratorConfig(configRes)
      if (adisyonsRes.success) setEadisyons(adisyonsRes.data)
      if (compRes) setEAdisyonCompliance(compRes)
    } catch (err) {
      console.error('Data load error:', err)
      toast('Veriler yüklenirken hata oluştu', 'error')
    } finally {
      setLoading(false)
    }
  }, [activeTab, statusFilter, searchQuery, interCompanyFilter, eadisyonFilter, toast])

  useEffect(() => {
    loadData()
  }, [activeTab, statusFilter, interCompanyFilter, eadisyonFilter])

  // Search debounce / trigger
  const handleSearchSubmit = (e) => {
    e.preventDefault()
    loadData()
  }

  // Open Details Preview
  const handleOpenPreview = async (invoice) => {
    setSelectedInvoice(invoice)
    setPreviewTab('html')
    setLoadingDetails(true)
    try {
      const details = await eInvoiceService.getInvoiceDetails(invoice.id)
      if (details.success) {
        setSelectedInvoice(details.data)
      }
    } catch (err) {
      console.error('Details load error:', err)
    } finally {
      setLoadingDetails(false)
    }
  }

  // Open 3-Way Matching Modal
  const handleOpenMatchingModal = async (invoice) => {
    setMatchingInvoice(invoice)
    setMatchingModalOpen(true)
    setMatchingLoading(true)
    setMatchingNote('')
    setShowOnlyDiscrepantLines(false)
    try {
      // First get full invoice details with lines
      const details = await eInvoiceService.getInvoiceDetails(invoice.id)
      const fullInvoice = details.success ? details.data : invoice
      setMatchingInvoice(fullInvoice)

      // Search for candidate receipts and run 3-way matching engine
      const matchResult = await matchingEngine.findPotentialReceiptsForInvoice(fullInvoice, {
        priceTolerancePercent: toleranceSettings.priceTolerancePercent,
        qtyTolerance: toleranceSettings.qtyTolerance,
        checkTaxRates: toleranceSettings.checkTaxRates,
      })

      if (matchResult.success) {
        setCandidateReceipts(matchResult.candidateReceipts || [])
        setSelectedCandidateIndex(0)
        setMatchedSupplierInfo(matchResult.matchedSupplier || null)
      } else {
        toast(matchResult.error || 'Mal kabul irsaliyeleri taranamadı.', 'error')
        setCandidateReceipts([])
      }
    } catch (err) {
      console.error('Matching load error:', err)
      toast('Mal kabul eşleştirme verisi yüklenirken hata: ' + err.message, 'error')
    } finally {
      setMatchingLoading(false)
    }
  }

  // Re-run matching comparison when tolerance settings change
  const handleApplyTolerance = (newSettings) => {
    setToleranceSettings(newSettings)
    setToleranceModalOpen(false)

    if (matchingInvoice && candidateReceipts.length > 0) {
      const updatedCandidates = candidateReceipts.map((cand) => {
        const comparison = matchingEngine.compareInvoiceWithReceipt(matchingInvoice, cand.receipt, newSettings)
        return {
          ...cand,
          comparison,
          score: comparison.matchScore,
          status: comparison.status,
          isExactMatch: comparison.isFullyMatched,
        }
      })
      setCandidateReceipts(updatedCandidates)
      toast('Tolerans ayarları uygulandı ve karşılaştırma güncellendi.', 'info')
    }
  }

  // Active selected candidate receipt
  const activeCandidate = candidateReceipts[selectedCandidateIndex] || null
  const activeComparison = activeCandidate?.comparison || null

  // Approve 3-Way Match Action
  const handleApproveMatch = async () => {
    if (!matchingInvoice || !activeCandidate) {
      toast('Lütfen eşleştirilecek geçerli bir mal kabul irsaliyesi seçin.', 'error')
      return
    }

    setApprovingMatch(true)
    try {
      const res = await matchingEngine.approveInvoiceReceiptMatch({
        invoiceId: matchingInvoice.id,
        receiptId: activeCandidate.receipt.id,
        matchData: activeComparison,
        userPin: 'ADMIN',
        note: matchingNote.trim() || '3-Way Matching UI üzerinden onaylandı.',
      })

      if (res.success) {
        toast(res.message, 'success')
        setMatchingModalOpen(false)
        await loadData()
      } else {
        toast(res.error || 'Eşleştirme onaylanamadı.', 'error')
      }
    } catch (err) {
      toast('Onay sırasında hata: ' + err.message, 'error')
    } finally {
      setApprovingMatch(false)
    }
  }

  // Open Dispute / Rejection Modal
  const handleOpenDisputeModal = () => {
    if (!matchingInvoice) return
    const disputeText = matchingEngine.generateDisputeSummaryText(
      matchingInvoice,
      activeCandidate?.receipt,
      activeComparison
    )
    setDisputeSummaryText(disputeText)
    setDisputeReason(
      activeComparison?.discrepancies?.map((d) => `${d.title}: ${d.description}`).join('\n') ||
        '3-Way Matching Mal Kabul Uyuşmazlığı'
    )
    setDisputeModalOpen(true)
  }

  // Confirm Dispute / Commercial Rejection
  const handleConfirmDisputeReject = async () => {
    if (!matchingInvoice) return
    if (!disputeReason.trim()) {
      toast('Lütfen itiraz / red gerekçesi belirtin.', 'error')
      return
    }

    setRejectingDispute(true)
    try {
      const res = await matchingEngine.rejectInvoiceWithDiscrepancy({
        invoiceId: matchingInvoice.id,
        receiptId: activeCandidate?.receipt?.id || null,
        reason: disputeReason.trim(),
        discrepancies: activeComparison?.discrepancies || [],
        userPin: 'ADMIN',
      })

      if (res.success) {
        toast(res.message, 'success')
        setDisputeModalOpen(false)
        setMatchingModalOpen(false)
        await loadData()
      } else {
        toast(res.error || 'İtiraz iletilemedi', 'error')
      }
    } catch (err) {
      toast('İtiraz hatası: ' + err.message, 'error')
    } finally {
      setRejectingDispute(false)
    }
  }

  // Copy dispute text to clipboard
  const handleCopyDisputeText = () => {
    if (!disputeSummaryText) return
    navigator.clipboard.writeText(disputeSummaryText)
    toast('Uyuşmazlık tutanağı panoya kopyalandı.', 'success')
  }

  // Open Commercial Response Modal
  const handleOpenResponseModal = (invoice) => {
    setRespondingInvoice(invoice)
    setResponseType('KABUL')
    setResponseReason('')
    setResponseModalOpen(true)
  }

  // Submit Commercial Response
  const handleSubmitResponse = async () => {
    if (!respondingInvoice) return
    if (responseType === 'RED' && !responseReason.trim()) {
      toast('Reddetme işlemi için lütfen bir gerekçe belirtin.', 'error')
      return
    }

    setSubmittingResponse(true)
    try {
      const res = await eInvoiceService.sendCommercialResponse(
        respondingInvoice.id,
        responseType,
        responseReason.trim(),
        'ADMIN'
      )
      if (res.success) {
        toast(res.message, 'success')
        setResponseModalOpen(false)
        if (selectedInvoice && selectedInvoice.id === respondingInvoice.id) {
          setSelectedInvoice(null)
        }
        await loadData()
      } else {
        toast(res.error || 'Yanıt gönderilemedi', 'error')
      }
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSubmittingResponse(false)
    }
  }

  // Save Integrator Config
  const handleSaveConfig = async (e) => {
    if (e) e.preventDefault()
    setSavingConfig(true)
    try {
      const res = await eInvoiceService.saveIntegratorConfig(integratorConfig)
      if (res && res.success) {
        toast('Entegratör ayarları başarıyla kaydedildi.', 'success')
      } else {
        toast('Ayarlar kaydedilemedi: ' + (res?.error || 'Bilinmeyen hata'), 'error')
      }
    } catch (err) {
      toast('Kayıt hatası: ' + err.message, 'error')
    } finally {
      setSavingConfig(false)
    }
  }

  // Test Integrator Connection (Ping / Session Auth)
  const handleTestConnection = async () => {
    setTestingConnection(true)
    setTestConnectionResult(null)
    try {
      const res = await eInvoiceService.testConnection(integratorConfig)
      setTestConnectionResult(res)
      if (res.success) {
        toast(res.message, 'success')
      } else {
        toast('Bağlantı testi başarısız: ' + (res.error || 'Bilinmeyen hata'), 'error')
      }
    } catch (err) {
      setTestConnectionResult({ success: false, error: err.message })
      toast('Bağlantı hatası: ' + err.message, 'error')
    } finally {
      setTestingConnection(false)
    }
  }

  // Live Tax Payer Query (VKN/TCKN)
  const handleQueryTaxPayer = async (e) => {
    if (e) e.preventDefault()
    if (!taxPayerQueryVkn || !taxPayerQueryVkn.trim()) {
      toast('Lütfen geçerli bir VKN veya TCKN girin.', 'warning')
      return
    }
    setQueryingTaxPayer(true)
    setTaxPayerQueryResult(null)
    try {
      const res = await eInvoiceService.checkTaxPayer(taxPayerQueryVkn.trim())
      setTaxPayerQueryResult(res)
      if (res.isEInvoiceUser) {
        toast(`Mükellef Bulundu: ${res.title}`, 'success')
      } else {
        toast('Mükellef e-Fatura kullanıcısı değil (e-Arşiv kapsamındadır).', 'info')
      }
    } catch (err) {
      toast('Sorgulama hatası: ' + err.message, 'error')
    } finally {
      setQueryingTaxPayer(false)
    }
  }

  // Sync Inbound Invoices from Integrator
  const handleSyncInboundInvoices = async () => {
    setSyncingInbounds(true)
    try {
      const res = await eInvoiceService.syncInvoicesFromIntegratorToRms()
      if (res.success) {
        toast(`✅ ${res.message}`, 'success')
        await loadData()
      } else {
        toast(res.error || 'Faturalar senkronize edilemedi.', 'error')
      }
    } catch (err) {
      toast('Senkronizasyon hatası: ' + err.message, 'error')
    } finally {
      setSyncingInbounds(false)
    }
  }

  // Create new E-Adisyon
  const handleCreateEAdisyon = async (e) => {
    e.preventDefault()
    setCreatingAdisyon(true)
    try {
      const res = await eAdisyonService.createEAdisyonForOrder(
        null,
        {
          table_name: newAdisyonForm.table_name,
          table_key: newAdisyonForm.table_key,
          waiter_name: newAdisyonForm.waiter_name,
          guest_count: newAdisyonForm.guest_count,
        },
        newAdisyonForm.items,
        { notes: `${newAdisyonForm.table_name} için oluşturuldu.` }
      )

      if (res.success) {
        toast(res.message, 'success')
        setNewAdisyonModalOpen(false)
        await loadData()
      } else {
        toast(res.error || 'E-Adisyon oluşturulamadı', 'error')
      }
    } catch (err) {
      toast('Hata: ' + err.message, 'error')
    } finally {
      setCreatingAdisyon(false)
    }
  }

  // Open Convert Modal
  const handleOpenConvertModal = (adisyon) => {
    setConvertingAdisyon(adisyon)
    setConvertInvoiceForm({
      profile_id: 'EARSIVFATURA',
      receiver_vkn_tckn: '11111111111',
      receiver_title: `${adisyon.table_name || 'Masa'} Müşterisi`,
      receiver_tax_office: '',
      receiver_address: 'İstanbul',
      notes: `E-Adisyon (#${adisyon.adisyon_number}) kapanışı ile düzenlenmiştir. ETTN: ${adisyon.ettn}`,
    })
    setConvertModalOpen(true)
  }

  // Confirm Convert & Link E-Adisyon to Invoice
  const handleConfirmConvertAndLink = async (e) => {
    e.preventDefault()
    if (!convertingAdisyon) return
    setSubmittingConversion(true)
    try {
      const res = await eAdisyonService.closeEAdisyonAndLinkInvoice(convertingAdisyon.id, convertInvoiceForm)
      if (res.success) {
        toast(res.message, 'success')
        setConvertModalOpen(false)
        setConvertingAdisyon(null)
        await loadData()
      } else {
        toast(res.error || 'Dönüştürme başarısız', 'error')
      }
    } catch (err) {
      toast('Hata: ' + err.message, 'error')
    } finally {
      setSubmittingConversion(false)
    }
  }

  // View E-Adisyon Details
  const handleViewEAdisyonDetails = async (adisyon) => {
    setSelectedEAdisyon(adisyon)
    setEAdisyonDetailsModalOpen(true)
    try {
      const res = await eAdisyonService.getEAdisyonById(adisyon.id)
      if (res.success) {
        setSelectedEAdisyon(res.data)
      }
    } catch (err) {
      console.error('EAdisyon details error:', err)
    }
  }

  // Cancel E-Adisyon
  const handleCancelEAdisyon = async (adisyonId) => {
    if (!window.confirm('Bu E-Adisyonu iptal etmek istediğinize emin misiniz?')) return
    try {
      const res = await eAdisyonService.cancelEAdisyon(adisyonId, 'Kullanıcı İptali')
      if (res.success) {
        toast(res.message, 'success')
        await loadData()
      } else {
        toast(res.error || 'İptal edilemedi', 'error')
      }
    } catch (err) {
      toast('Hata: ' + err.message, 'error')
    }
  }

  // Copy text helper
  const handleCopyText = (text, label = 'Metin') => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text)
      toast(`${label} panoya kopyalandı.`, 'info')
    }
  }

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* Header & Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-strong)', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: '#f5a623' }}>
              <i className="fa-solid fa-file-invoice-dollar" />
            </span>
            E-Fatura & E-Dönüşüm Portalı
          </h1>
          <p style={{ margin: '4px 0 0 0', fontSize: '.85rem', color: 'var(--text-muted)' }}>
            GİB UBL-TR 2.1 Standardı, Gelen/Giden e-Faturalar, Ticari Uygulama Yanıtları ve Entegratör Simülatörü
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Link
            to="/integrator-studio"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 8,
              border: '1.5px solid #f5a623',
              background: 'rgba(245,166,35,0.12)',
              color: '#f5a623',
              fontSize: '.85rem',
              fontWeight: 800,
              textDecoration: 'none',
              transition: 'all .2s ease',
            }}
          >
            <i className="fa-solid fa-cloud-bolt" />
            Özel Entegratör Stüdyosu ➔
          </Link>

          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text-strong)',
              fontSize: '.85rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <i className={`fa-solid fa-arrows-rotate ${loading ? 'fa-spin' : ''}`} />
            Yenile
          </button>

          <button
            type="button"
            onClick={handleSyncInboundInvoices}
            disabled={syncingInbounds}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 8,
              border: '1.5px solid #0284c7',
              background: 'linear-gradient(135deg, rgba(2,132,199,0.15) 0%, rgba(56,189,248,0.1) 100%)',
              color: '#0284c7',
              fontSize: '.85rem',
              fontWeight: 800,
              cursor: syncingInbounds ? 'not-allowed' : 'pointer',
              boxShadow: '0 2px 8px rgba(2,132,199,0.15)',
            }}
          >
            <i className={`fa-solid fa-arrows-rotate ${syncingInbounds ? 'fa-spin' : ''}`} />
            {syncingInbounds ? 'Entegratörden Alınıyor...' : `Entegratörden Faturaları Getir (${(integratorConfig?.provider || 'sandbox').toUpperCase()})`}
          </button>

          <button
            type="button"
            onClick={() => {
              setNewAdisyonModalOpen(true)
              toast('ℹ️ e-adisyon POS tarafında geliştirilmeli ve e-dönüşüm entegratörü ile entegre olarak tamamlanmalıdır, şirket kuruluşunda e-adisyon kullanılacak seçimiyle aktif ve deaktif edilebilmelidir', 'info')
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid #86efac',
              background: '#f0fdf4',
              color: '#15803d',
              fontSize: '.85rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <i className="fa-solid fa-circle-info" />
            Yeni E-Adisyon Aç
          </button>
        </div>
      </div>

      {/* KPI / Metric Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 20 }}>
        {/* Card 1 */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(16, 185, 129, 0.12)', color: '#10b981', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', fontSize: '1.25rem' }}>
            <i className="fa-solid fa-inbox" />
          </div>
          <div>
            <div style={{ fontSize: '.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Gelen e-Faturalar</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-strong)' }}>
              {stats.totalInboundCount} <span style={{ fontSize: '.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Adet</span>
            </div>
            <div style={{ fontSize: '.75rem', color: '#10b981', fontWeight: 700 }}>
              {stats.totalInboundAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
            </div>
          </div>
        </div>

        {/* Card 2 */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(245, 166, 35, 0.12)', color: '#f5a623', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', fontSize: '1.25rem' }}>
            <i className="fa-solid fa-clock-rotate-left" />
          </div>
          <div>
            <div style={{ fontSize: '.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Onay Bekleyenler</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f5a623' }}>
              {stats.pendingApprovalCount} <span style={{ fontSize: '.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Fatura</span>
            </div>
            <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>Ticari Kabul/Red Bekliyor</div>
          </div>
        </div>

        {/* Card 3 */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', fontSize: '1.25rem' }}>
            <i className="fa-solid fa-circle-check" />
          </div>
          <div>
            <div style={{ fontSize: '.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Kabul / Onaylanan</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-strong)' }}>
              {stats.acceptedCount} <span style={{ fontSize: '.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Adet</span>
            </div>
            <div style={{ fontSize: '.75rem', color: '#38bdf8' }}>{stats.rejectedCount} Reddedildi</div>
          </div>
        </div>

        {/* Card 4 */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(167, 139, 250, 0.12)', color: '#a78bfa', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', fontSize: '1.25rem' }}>
            <i className="fa-solid fa-paper-plane" />
          </div>
          <div>
            <div style={{ fontSize: '.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Giden e-Faturalar</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-strong)' }}>
              {stats.totalOutboundCount} <span style={{ fontSize: '.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Adet</span>
            </div>
            <div style={{ fontSize: '.75rem', color: '#a78bfa', fontWeight: 700 }}>
              {stats.totalOutboundAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
            </div>
          </div>
        </div>

        {/* Card 5: Inter-Company Transfers */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(234, 88, 12, 0.12)', color: '#ea580c', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', fontSize: '1.25rem' }}>
            <i className="fa-solid fa-building-circle-arrow-right" />
          </div>
          <div>
            <div style={{ fontSize: '.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Şirketler Arası Transfer</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-strong)' }}>
              {stats.totalInterCompanyCount || 0} <span style={{ fontSize: '.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Fatura</span>
            </div>
            <div style={{ fontSize: '.75rem', color: '#ea580c', fontWeight: 700 }}>
              {(stats.totalInterCompanyAmount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Bar */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border)', marginBottom: 20, overflowX: 'auto' }}>
        <button
          type="button"
          onClick={() => setActiveTab('inbox')}
          style={{
            padding: '10px 18px',
            border: 'none',
            background: 'transparent',
            color: activeTab === 'inbox' ? '#f5a623' : 'var(--text-muted)',
            borderBottom: activeTab === 'inbox' ? '2px solid #f5a623' : '2px solid transparent',
            fontWeight: activeTab === 'inbox' ? 700 : 500,
            fontSize: '.9rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            whiteSpace: 'nowrap',
          }}
        >
          <i className="fa-solid fa-inbox" />
          Gelen Kutusu (Alış Faturaları)
          <span style={{ fontSize: '.75rem', padding: '2px 6px', borderRadius: 10, background: activeTab === 'inbox' ? 'rgba(245,166,35,0.2)' : 'var(--surface-2)', color: activeTab === 'inbox' ? '#f5a623' : 'var(--text-muted)' }}>
            {stats.totalInboundCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('outbox')}
          style={{
            padding: '10px 18px',
            border: 'none',
            background: 'transparent',
            color: activeTab === 'outbox' ? '#f5a623' : 'var(--text-muted)',
            borderBottom: activeTab === 'outbox' ? '2px solid #f5a623' : '2px solid transparent',
            fontWeight: activeTab === 'outbox' ? 700 : 500,
            fontSize: '.9rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            whiteSpace: 'nowrap',
          }}
        >
          <i className="fa-solid fa-paper-plane" />
          Giden Kutusu (Satış Faturaları)
          <span style={{ fontSize: '.75rem', padding: '2px 6px', borderRadius: 10, background: activeTab === 'outbox' ? 'rgba(245,166,35,0.2)' : 'var(--surface-2)', color: activeTab === 'outbox' ? '#f5a623' : 'var(--text-muted)' }}>
            {stats.totalOutboundCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('intercompany')}
          style={{
            padding: '10px 18px',
            border: 'none',
            background: 'transparent',
            color: activeTab === 'intercompany' ? '#ea580c' : 'var(--text-muted)',
            borderBottom: activeTab === 'intercompany' ? '2px solid #ea580c' : '2px solid transparent',
            fontWeight: activeTab === 'intercompany' ? 700 : 500,
            fontSize: '.9rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            whiteSpace: 'nowrap',
          }}
        >
          <i className="fa-solid fa-building-circle-arrow-right" />
          Şirketler Arası (Inter-Company)
          <span style={{ fontSize: '.75rem', padding: '2px 6px', borderRadius: 10, background: activeTab === 'intercompany' ? 'rgba(234,88,12,0.2)' : 'var(--surface-2)', color: activeTab === 'intercompany' ? '#ea580c' : 'var(--text-muted)' }}>
            {stats.totalInterCompanyCount || 0}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          style={{
            padding: '10px 18px',
            border: 'none',
            background: 'transparent',
            color: activeTab === 'settings' ? '#f5a623' : 'var(--text-muted)',
            borderBottom: activeTab === 'settings' ? '2px solid #f5a623' : '2px solid transparent',
            fontWeight: activeTab === 'settings' ? 700 : 500,
            fontSize: '.9rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            whiteSpace: 'nowrap',
          }}
        >
          <i className="fa-solid fa-sliders" />
          Entegratör Ayarları
        </button>
      </div>

      {/* Tab 1, Tab 2 & Tab 3: INBOX / OUTBOX / INTER-COMPANY List Views */}
      {(activeTab === 'inbox' || activeTab === 'outbox' || activeTab === 'intercompany') && (
        <div>
          {/* Filters Bar */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: 8, flex: 1, minWidth: 260 }}>
              <div style={{ position: 'relative', width: '100%' }}>
                <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '.85rem' }} />
                <input
                  type="text"
                  placeholder="Fatura No, Tedarikçi / Alıcı Ünvanı, VKN veya ETTN ile ara..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px 8px 36px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--app-bg)',
                    color: 'var(--text-strong)',
                    fontSize: '.85rem',
                  }}
                />
              </div>
              <button
                type="submit"
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'var(--surface-2)',
                  color: 'var(--text-strong)',
                  fontWeight: 600,
                  fontSize: '.85rem',
                  cursor: 'pointer',
                }}
              >
                Ara
              </button>
            </form>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: '.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Durum:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--app-bg)',
                  color: 'var(--text-strong)',
                  fontSize: '.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <option value="ALL">Tüm Durumlar</option>
                <option value="1000">1000 - Kuyrukta / Taslak</option>
                <option value="1100">1100 - Entegratöre Gönderildi</option>
                <option value="1120">1120 - GİB'e İletildi</option>
                <option value="1163">1163 - GİB'de İşlendi</option>
                <option value="1200">1200 - Alıcıya Ulaştı (Bekliyor)</option>
                <option value="1300">1300 - Kabul Edildi (Onaylandı)</option>
                <option value="1301">1301 - Reddedildi</option>
                <option value="9999">9999 - Hatalı / Başarısız</option>
              </select>

              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: '.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Tür:</span>
                <button
                  type="button"
                  onClick={() => setInterCompanyFilter('ALL')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 20,
                    border: '1px solid var(--border)',
                    background: interCompanyFilter === 'ALL' ? 'var(--surface-2)' : 'transparent',
                    color: interCompanyFilter === 'ALL' ? 'var(--text-strong)' : 'var(--text-muted)',
                    fontSize: '.75rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Tümü
                </button>
                <button
                  type="button"
                  onClick={() => setInterCompanyFilter('SUPPLIER_ONLY')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 20,
                    border: '1px solid var(--border)',
                    background: interCompanyFilter === 'SUPPLIER_ONLY' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                    color: interCompanyFilter === 'SUPPLIER_ONLY' ? '#0284c7' : 'var(--text-muted)',
                    fontSize: '.75rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Tedarikçi / Müşteri
                </button>
                <button
                  type="button"
                  onClick={() => setInterCompanyFilter('INTER_COMPANY_ONLY')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 20,
                    border: '1px solid #fed7aa',
                    background: interCompanyFilter === 'INTER_COMPANY_ONLY' ? '#fff7ed' : 'transparent',
                    color: interCompanyFilter === 'INTER_COMPANY_ONLY' ? '#c2410c' : 'var(--text-muted)',
                    fontSize: '.75rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <i className="fa-solid fa-building-circle-arrow-right" />
                  Şirketler Arası
                </button>
              </div>

              {activeTab === 'inbox' && (
                <button
                  type="button"
                  onClick={() => handleRunScenario('MATCHED')}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: '1px solid #f5a623',
                    background: 'rgba(245,166,35,0.12)',
                    color: '#f5a623',
                    fontSize: '.85rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <i className="fa-solid fa-plus" />
                  Test Faturası İndir
                </button>
              )}

              {activeTab === 'outbox' && (
                <button
                  type="button"
                  onClick={() => handleRunScenario('OUTBOUND_SIM')}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#f5a623',
                    color: '#000',
                    fontSize: '.85rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <i className="fa-solid fa-paper-plane" />
                  Yeni e-Fatura Düzenle
                </button>
              )}

              {activeTab === 'intercompany' && (
                <button
                  type="button"
                  onClick={() => handleRunScenario('INTER_COMPANY')}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: '1px solid #fed7aa',
                    background: '#fff7ed',
                    color: '#c2410c',
                    fontSize: '.85rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <i className="fa-solid fa-building-circle-arrow-right" />
                  Transfer Faturası Simüle Et
                </button>
              )}
            </div>
          </div>

          {/* Invoices Table */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '.85rem' }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '.75rem', fontWeight: 700 }}>
                  <th style={{ padding: '12px 16px' }}>Fatura No & Tip</th>
                  <th style={{ padding: '12px 16px' }}>
                    {activeTab === 'inbox' ? 'Tedarikçi (Gönderici)' : activeTab === 'outbox' ? 'Müşteri (Alıcı)' : 'Gönderici ➔ Alıcı'}
                  </th>
                  <th style={{ padding: '12px 16px' }}>Tarih</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Vergisiz Tutar</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>KDV</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Ödenecek Tutar</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Durum</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="8" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                      <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} />
                      Faturalar yükleniyor...
                    </td>
                  </tr>
                ) : invoices.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ padding: 48, textAlign: 'center' }}>
                      <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px auto', color: 'var(--text-muted)', fontSize: '1.5rem' }}>
                        <i className="fa-solid fa-file-invoice" />
                      </div>
                      <div style={{ fontWeight: 700, color: 'var(--text-strong)', marginBottom: 4 }}>Kayıtlı Fatura Bulunamadı</div>
                      <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', maxWidth: 360, margin: '0 auto 16px auto' }}>
                        Kriterlerinize uygun e-fatura kaydı bulunmuyor. Simülatör üzerinden test faturası oluşturabilirsiniz.
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRunScenario(activeTab === 'intercompany' ? 'INTER_COMPANY' : activeTab === 'inbox' ? 'MATCHED' : 'OUTBOUND_SIM')}
                        style={{
                          padding: '8px 16px',
                          borderRadius: 8,
                          border: 'none',
                          background: '#f5a623',
                          color: '#000',
                          fontWeight: 700,
                          fontSize: '.85rem',
                          cursor: 'pointer',
                        }}
                      >
                        <i className="fa-solid fa-magic-wand-sparkles" style={{ marginRight: 6 }} />
                        Hemen Test Faturası Oluştur
                      </button>
                    </td>
                  </tr>
                ) : (
                  invoices.map((inv) => {
                    const status = getStatusMeta(inv.status_code)
                    const profile = getProfileMeta(inv.profile_id)
                    const isPendingCommercial = (activeTab === 'inbox' || activeTab === 'intercompany') && inv.profile_id === 'TICARIFATURA' && inv.status_code === 1200

                    return (
                      <tr
                        key={inv.id}
                        style={{
                          borderBottom: '1px solid var(--border)',
                          transition: 'background .15s',
                        }}
                      >
                        {/* Fatura No & Tip */}
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 800, color: 'var(--text-strong)', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            {inv.invoice_number}
                            {inv.direction && (
                              <span style={{ fontSize: '.65rem', padding: '1px 5px', borderRadius: 4, background: inv.direction === 'INBOUND' ? 'rgba(16,185,129,0.15)' : 'rgba(167,139,250,0.15)', color: inv.direction === 'INBOUND' ? '#10b981' : '#a78bfa', fontWeight: 700 }}>
                                {inv.direction === 'INBOUND' ? 'GELEN' : 'GİDEN'}
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '.7rem', padding: '1px 6px', borderRadius: 4, background: 'rgba(245,166,35,0.12)', color: '#f5a623', fontWeight: 700 }}>
                              {profile.label}
                            </span>
                            <span style={{ fontSize: '.7rem', padding: '1px 6px', borderRadius: 4, background: 'var(--surface-2)', color: 'var(--text-muted)', fontWeight: 600 }}>
                              {inv.invoice_type || 'SATIS'}
                            </span>
                            {inv.is_inter_company && (
                              <span style={{ fontSize: '.7rem', padding: '1px 6px', borderRadius: 4, background: '#ffedd5', color: '#c2410c', fontWeight: 800 }}>
                                🏢 Şirketler Arası
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Tedarikçi / Alıcı */}
                        <td style={{ padding: '12px 16px', maxWidth: 300 }}>
                          <div style={{ fontWeight: 700, color: 'var(--text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {activeTab === 'inbox' ? inv.sender_title : activeTab === 'outbox' ? inv.receiver_title : `${inv.sender_title} ➔ ${inv.receiver_title}`}
                          </div>
                          <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span>VKN: {activeTab === 'inbox' ? inv.sender_vkn_tckn : inv.receiver_vkn_tckn}</span>
                            {inv.source_transfer_doc_no && (
                              <span className="badge" style={{ background: '#e0f2fe', color: '#0369a1', fontSize: '.68rem', padding: '1px 6px' }}>
                                <i className="fa-solid fa-truck-ramp-box" style={{ marginRight: 3 }} /> {inv.source_transfer_doc_no}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Tarih */}
                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          <div>{inv.issue_date}</div>
                          <div style={{ fontSize: '.75rem' }}>{inv.issue_time || ''}</div>
                        </td>

                        {/* Vergisiz */}
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--text-strong)' }}>
                          {Number(inv.line_extension_amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                        </td>

                        {/* KDV */}
                        <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-muted)' }}>
                          {Number(inv.tax_total_amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                        </td>

                        {/* Genel Toplam */}
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#f5a623', fontSize: '.95rem' }}>
                          {Number(inv.payable_amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                        </td>

                        {/* Durum Badge */}
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '4px 10px',
                                borderRadius: 20,
                                background: status.bg,
                                color: status.color,
                                border: `1px solid ${status.border || status.color}`,
                                fontSize: '.75rem',
                                fontWeight: 700,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <i className={`fa-solid ${status.icon}`} />
                              {status.label}
                            </span>

                            {(activeTab === 'inbox' || inv.direction === 'INBOUND') && (
                              inv.is_matched ? (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    padding: '2px 8px',
                                    borderRadius: 6,
                                    background: 'rgba(16,185,129,0.12)',
                                    color: '#10b981',
                                    border: '1px solid rgba(16,185,129,0.3)',
                                    fontSize: '.7rem',
                                    fontWeight: 700,
                                  }}
                                >
                                  <i className="fa-solid fa-link" />
                                  İrsaliye ile Eşleşti
                                </span>
                              ) : (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    padding: '2px 8px',
                                    borderRadius: 6,
                                    background: 'rgba(245,158,11,0.12)',
                                    color: '#f59e0b',
                                    border: '1px solid rgba(245,158,11,0.3)',
                                    fontSize: '.7rem',
                                    fontWeight: 700,
                                  }}
                                >
                                  <i className="fa-solid fa-link-slash" />
                                  Eşleşme Bekliyor
                                </span>
                              )
                            )}
                          </div>
                        </td>

                        {/* Aksiyonlar */}
                        <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                            {(activeTab === 'inbox' || inv.direction === 'INBOUND') && (
                              <button
                                type="button"
                                title="3-Way Matching: Mal Kabul İrsaliyesi ile Eşleştir & Mutabakat Yap"
                                onClick={() => handleOpenMatchingModal(inv)}
                                style={{
                                  padding: '6px 12px',
                                  borderRadius: 6,
                                  border: 'none',
                                  background: inv.is_matched ? 'rgba(16,185,129,0.15)' : '#f5a623',
                                  color: inv.is_matched ? '#10b981' : '#000000',
                                  fontWeight: 800,
                                  fontSize: '.75rem',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 5,
                                }}
                              >
                                <i className="fa-solid fa-scale-balanced" />
                                {inv.is_matched ? 'Eşleşmeyi Gör' : 'Mal Kabul ile Eşleştir'}
                              </button>
                            )}

                            {isPendingCommercial && (
                              <button
                                type="button"
                                title="Ticari Fatura Kabul / Red Yanıtı Ver"
                                onClick={() => handleOpenResponseModal(inv)}
                                style={{
                                  padding: '6px 10px',
                                  borderRadius: 6,
                                  border: 'none',
                                  background: 'var(--surface-2)',
                                  color: 'var(--text-strong)',
                                  fontWeight: 700,
                                  fontSize: '.75rem',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                <i className="fa-solid fa-reply" />
                                Yanıtla
                              </button>
                            )}

                            <button
                              type="button"
                              title="GİB Formatında Görüntüle"
                              onClick={() => handleOpenPreview(inv)}
                              style={{
                                padding: '6px 10px',
                                borderRadius: 6,
                                border: '1px solid var(--border)',
                                background: 'var(--surface-2)',
                                color: 'var(--text-strong)',
                                fontWeight: 600,
                                fontSize: '.75rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <i className="fa-solid fa-eye" />
                              İncele
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: E-Adisyon & E-Belge Uyumu (VUK 509/526) Tab */}
      {activeTab === 'eadisyon' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* VUK 509/526 Compliance & KPI Banner */}
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(6,95,70,0.03) 100%)',
              border: '1px solid #86efac',
              borderRadius: 14,
              padding: '20px 24px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 16,
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span
                  style={{
                    background: '#10b981',
                    color: '#fff',
                    padding: '4px 10px',
                    borderRadius: 6,
                    fontSize: '.75rem',
                    fontWeight: 800,
                    letterSpacing: '0.5px',
                  }}
                >
                  VUK 509 & 526 MEVZUAT UYUMLU
                </span>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-strong)', margin: 0 }}>
                  E-Adisyon & E-Belge Uyumluluk Takibi
                </h2>
              </div>
              <p style={{ margin: 0, fontSize: '.85rem', color: 'var(--text-muted)', maxWidth: 680, lineHeight: 1.5 }}>
                Masada servis yapan yeme-içme işletmelerinde ilk siparişle birlikte anlık dijital E-Adisyon (ETTN UUID) üretilir. Hesap kapandığında nihai mali faturaya <code style={{ color: '#10b981', fontWeight: 700 }}>&lt;cac:AdditionalDocumentReference&gt;</code> olarak bağlanır.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <div style={{ textAlign: 'center', padding: '10px 18px', background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>GİB UYUM SKORU</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: eadisyonCompliance.complianceScore >= 95 ? '#10b981' : '#f5a623' }}>
                  %{eadisyonCompliance.complianceScore}
                </div>
                <div style={{ fontSize: '.7rem', color: '#10b981', fontWeight: 600 }}>{eadisyonCompliance.vukStandard}</div>
              </div>

              <button
                type="button"
                onClick={() => setNewAdisyonModalOpen(true)}
                style={{
                  padding: '12px 20px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#10b981',
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: '.9rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
                }}
              >
                <i className="fa-solid fa-plus-circle" />
                Yeni E-Adisyon Başlat
              </button>
            </div>
          </div>

          {/* Metric Cards Row for EAdisyon */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 8, background: 'rgba(56,189,248,0.12)', color: '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>
                <i className="fa-solid fa-table" />
              </div>
              <div>
                <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>AÇIK ADİSYONLAR</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-strong)' }}>{eadisyonCompliance.openCount}</div>
              </div>
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 8, background: 'rgba(16,185,129,0.12)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>
                <i className="fa-solid fa-file-invoice-dollar" />
              </div>
              <div>
                <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>FATURALANAN & ETTN BAĞLI</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#10b981' }}>{eadisyonCompliance.invoicedCount}</div>
              </div>
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 8, background: 'rgba(167,139,250,0.12)', color: '#a78bfa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>
                <i className="fa-solid fa-circle-check" />
              </div>
              <div>
                <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>KAPALI / TAHSİL EDİLEN</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-strong)' }}>{eadisyonCompliance.closedCount}</div>
              </div>
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 8, background: 'rgba(239,68,68,0.12)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>
                <i className="fa-solid fa-circle-xmark" />
              </div>
              <div>
                <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>İPTAL EDİLEN ADİSYON</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ef4444' }}>{eadisyonCompliance.cancelledCount}</div>
              </div>
            </div>
          </div>

          {/* Filter & Search Bar */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: 8, flex: 1, minWidth: 260 }}>
              <div style={{ position: 'relative', width: '100%' }}>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Adisyon No, ETTN UUID, Masa Adı veya Fatura No ile ara..."
                  style={{
                    width: '100%',
                    padding: '8px 12px 8px 36px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--app-bg)',
                    color: 'var(--text-strong)',
                    fontSize: '.85rem',
                  }}
                />
                <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '.8rem' }} />
              </div>
              <button type="submit" style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#10b981', color: '#fff', fontWeight: 700, fontSize: '.85rem', cursor: 'pointer' }}>
                Ara
              </button>
            </form>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                value={eadisyonFilter}
                onChange={(e) => setEAdisyonFilter(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--app-bg)',
                  color: 'var(--text-strong)',
                  fontSize: '.85rem',
                  fontWeight: 600,
                }}
              >
                <option value="ALL">Tüm Adisyon Durumları</option>
                <option value="OPEN">Açık Adisyonlar</option>
                <option value="INVOICED">Faturalanan & ETTN Bağlılar</option>
                <option value="CLOSED">Kapalı / Tahsil Edilenler</option>
                <option value="CANCELLED">İptal Edilenler</option>
              </select>
            </div>
          </div>

          {/* E-Adisyon Table List */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '.85rem' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '.75rem', textTransform: 'uppercase' }}>
                    <th style={{ padding: '12px 16px' }}>Masa & Adisyon No</th>
                    <th style={{ padding: '12px 16px' }}>ETTN (UUID v4)</th>
                    <th style={{ padding: '12px 16px' }}>Garson & Kişi</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Toplam Tutar</th>
                    <th style={{ padding: '12px 16px' }}>Açılış Zamanı</th>
                    <th style={{ padding: '12px 16px' }}>Durum</th>
                    <th style={{ padding: '12px 16px' }}>Bağlı Fatura / XML ETTN</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {eadisyons.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                        <i className="fa-solid fa-receipt" style={{ fontSize: '2rem', marginBottom: 8, display: 'block', opacity: 0.4 }} />
                        Henüz kayıtlı E-Adisyon bulunamadı. "Yeni E-Adisyon Aç" butonu ile ilk adisyonu başlatabilirsiniz.
                      </td>
                    </tr>
                  ) : (
                    eadisyons.map((ad) => {
                      const statusMeta = EADISYON_STATUS_META[ad.status] || { label: ad.status, color: '#888', bg: 'rgba(136,136,136,0.12)' }
                      const isLinked = Boolean(ad.linked_invoice_id || ad.linked_invoice_ettn || ad.linked_invoice_number)

                      return (
                        <tr key={ad.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background .15s' }}>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ fontWeight: 800, color: 'var(--text-strong)' }}>{ad.table_name || ad.table_key || 'Masa'}</div>
                            <div style={{ fontSize: '.75rem', fontFamily: 'monospace', color: '#10b981', fontWeight: 700 }}>
                              #{ad.adisyon_number}
                            </div>
                          </td>

                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontFamily: 'monospace', fontSize: '.78rem', color: 'var(--text-muted)' }}>
                                {ad.ettn ? `${ad.ettn.substring(0, 13)}...` : '-'}
                              </span>
                              {ad.ettn && (
                                <button
                                  type="button"
                                  onClick={() => handleCopyText(ad.ettn, 'ETTN UUID')}
                                  title="ETTN UUID Kopyala"
                                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '.75rem' }}
                                >
                                  <i className="fa-solid fa-copy" />
                                </button>
                              )}
                            </div>
                          </td>

                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{ad.waiter_name || 'Garson'}</div>
                            <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{ad.guest_count || 1} Kişi</div>
                          </td>

                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            <div style={{ fontWeight: 800, color: '#10b981', fontSize: '.95rem' }}>
                              {Number(ad.payable_amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                            </div>
                            <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
                              KDV: {Number(ad.tax_total_amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                            </div>
                          </td>

                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ fontSize: '.8rem', color: 'var(--text-strong)' }}>
                              {ad.opened_at ? new Date(ad.opened_at).toLocaleDateString('tr-TR') : '-'}
                            </div>
                            <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
                              {ad.opened_at ? new Date(ad.opened_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''}
                            </div>
                          </td>

                          <td style={{ padding: '12px 16px' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '4px 10px',
                                borderRadius: 6,
                                fontSize: '.75rem',
                                fontWeight: 700,
                                color: statusMeta.color,
                                background: statusMeta.bg,
                                border: `1px solid ${statusMeta.color}30`,
                              }}
                            >
                              <i className={`fa-solid ${statusMeta.icon || 'fa-circle'}`} />
                              {statusMeta.label}
                            </span>
                          </td>

                          <td style={{ padding: '12px 16px' }}>
                            {isLinked ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '2px 8px',
                                    borderRadius: 6,
                                    fontSize: '.72rem',
                                    fontWeight: 700,
                                    color: '#065f46',
                                    background: '#ecfdf5',
                                    border: '1px solid #a7f3d0',
                                  }}
                                >
                                  <i className="fa-solid fa-link" />
                                  {ad.linked_invoice_number || 'Fatura Bağlandı'}
                                </span>
                                <span style={{ fontSize: '.68rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                  &lt;cac:AdditionalDocumentReference&gt;
                                </span>
                              </div>
                            ) : (
                              <span style={{ fontSize: '.75rem', color: '#94a3b8', fontStyle: 'italic' }}>
                                Henüz Faturaya Bağlanmadı
                              </span>
                            )}
                          </td>

                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <button
                                type="button"
                                onClick={() => handleViewEAdisyonDetails(ad)}
                                title="Detay & Kalemleri Görüntüle"
                                style={{
                                  padding: '6px 10px',
                                  borderRadius: 6,
                                  border: '1px solid var(--border)',
                                  background: 'var(--surface-2)',
                                  color: 'var(--text-strong)',
                                  fontSize: '.75rem',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                <i className="fa-solid fa-eye" />
                              </button>

                              {ad.status === 'OPEN' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenConvertModal(ad)}
                                    style={{
                                      padding: '6px 12px',
                                      borderRadius: 6,
                                      border: 'none',
                                      background: '#10b981',
                                      color: '#fff',
                                      fontSize: '.75rem',
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 6,
                                    }}
                                  >
                                    <i className="fa-solid fa-file-invoice" />
                                    Faturaya Dönüştür
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleCancelEAdisyon(ad.id)}
                                    title="Adisyonu İptal Et"
                                    style={{
                                      padding: '6px 10px',
                                      borderRadius: 6,
                                      border: '1px solid #fca5a5',
                                      background: '#fef2f2',
                                      color: '#b91c1c',
                                      fontSize: '.75rem',
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                    }}
                                  >
                                    <i className="fa-solid fa-xmark" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Settings Tab (Multi-Integrator Management: Mock, Uyumsoft, EDM) */}
      {activeTab === 'settings' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 20, alignItems: 'start', maxWidth: 1200, margin: '0 auto' }}>
          {/* Sol Kolon: Entegratör Konfigürasyon Formu */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-strong)', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fa-solid fa-sliders" style={{ color: '#f5a623' }} />
              Özel Entegratör & GİB Bağlantı Ayarları
            </h2>
            <p style={{ fontSize: '.85rem', color: 'var(--text-muted)', margin: '0 0 20px 0' }}>
              SuitableRMS çoklu entegratör mimarisi: Uyumsoft Cloud (SOAP/REST), EDM Bilişim (WCF/Session) ve Sandbox Simülatör yapılandırması.
            </p>

            <form onSubmit={handleSaveConfig} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Provider Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '.85rem', fontWeight: 700, color: 'var(--text-strong)', marginBottom: 6 }}>
                  Aktif Entegratör Sağlayıcı:
                </label>
                <select
                  value={integratorConfig.provider}
                  onChange={(e) => setIntegratorConfig({ ...integratorConfig, provider: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--app-bg)',
                    color: 'var(--text-strong)',
                    fontSize: '.9rem',
                    fontWeight: 700,
                  }}
                >
                  <option value="mock">SuitableRMS Mock Sandbox (Yerel Simülatör Motoru)</option>
                  <option value="uyumsoft">Uyumsoft E-Dönüşüm (SOAP 1.1 / WCF / eKüp REST)</option>
                  <option value="edm">EDM Bilişim (WCF EFaturaEDMessageService & Session Token)</option>
                </select>
              </div>

              {/* Dynamic Provider Notice */}
              {integratorConfig.provider === 'uyumsoft' && (
                <div style={{ background: '#f0fdf4', border: '1px solid #86efac', padding: 12, borderRadius: 8, fontSize: '.8rem', color: '#166534' }}>
                  <strong>Uyumsoft Cloud Entegrasyonu:</strong> WCF SOAP 1.1 servisi (<code style={{ color: '#15803d' }}>efatura.uyumsoft.com.tr</code>) ve REST E-Adisyon uç noktaları (<code style={{ color: '#15803d' }}>webservis.ekupbilisim.com</code>) üzerinden işlem yapılır.
                </div>
              )}

              {integratorConfig.provider === 'edm' && (
                <div style={{ background: '#eff6ff', border: '1px solid #93c5fd', padding: 12, borderRadius: 8, fontSize: '.8rem', color: '#1e40af' }}>
                  <strong>EDM Bilişim Entegrasyonu:</strong> WCF tabanlı <code style={{ color: '#1d4ed8' }}>EFaturaEDMessageService.svc</code> oturum tokeni (<code style={{ color: '#1d4ed8' }}>SESSION_ID</code>) ile kimlik doğrulaması yapılır.
                </div>
              )}

              {/* Mode & Active Switches */}
              <div style={{ display: 'flex', gap: 20, alignItems: 'center', padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.85rem', fontWeight: 700, color: 'var(--text-strong)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(integratorConfig.is_test_mode)}
                    onChange={(e) => setIntegratorConfig({ ...integratorConfig, is_test_mode: e.target.checked })}
                  />
                  Test / Sandbox Ortamı Aktif
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.85rem', fontWeight: 700, color: 'var(--text-strong)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(integratorConfig.is_active)}
                    onChange={(e) => setIntegratorConfig({ ...integratorConfig, is_active: e.target.checked })}
                  />
                  Entegratör Servisi Aktif
                </label>
              </div>

              {/* Provider Credentials Inputs */}
              {(integratorConfig.provider === 'uyumsoft' || integratorConfig.provider === 'edm') && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, background: 'var(--app-bg)' }}>
                  <div style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 12 }}>
                    {integratorConfig.provider.toUpperCase()} API / Web Servis Kimlik Bilgileri
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Web Servis Kullanıcı Adı:</label>
                      <input
                        type="text"
                        value={integratorConfig.username || ''}
                        placeholder={integratorConfig.provider === 'uyumsoft' ? 'Uyumsoft' : 'EDM_TEST_USER'}
                        onChange={(e) => setIntegratorConfig({ ...integratorConfig, username: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                          background: 'var(--surface)',
                          color: 'var(--text-strong)',
                          fontSize: '.85rem',
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Web Servis Şifresi:</label>
                      <input
                        type="password"
                        value={integratorConfig.password || ''}
                        placeholder="••••••••"
                        onChange={(e) => setIntegratorConfig({ ...integratorConfig, password: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                          background: 'var(--surface)',
                          color: 'var(--text-strong)',
                          fontSize: '.85rem',
                        }}
                      />
                    </div>
                  </div>

                  {integratorConfig.provider === 'uyumsoft' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>API Key / Client ID (Opsiyonel):</label>
                        <input
                          type="text"
                          value={integratorConfig.api_key || ''}
                          onChange={(e) => setIntegratorConfig({ ...integratorConfig, api_key: e.target.value })}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            borderRadius: 6,
                            border: '1px solid var(--border)',
                            background: 'var(--surface)',
                            color: 'var(--text-strong)',
                            fontSize: '.85rem',
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>API Secret (Opsiyonel):</label>
                        <input
                          type="password"
                          value={integratorConfig.api_secret || ''}
                          onChange={(e) => setIntegratorConfig({ ...integratorConfig, api_secret: e.target.value })}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            borderRadius: 6,
                            border: '1px solid var(--border)',
                            background: 'var(--surface)',
                            color: 'var(--text-strong)',
                            fontSize: '.85rem',
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tax Payer / Company Info */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Gönderici VKN / TCKN:</label>
                  <input
                    type="text"
                    value={integratorConfig.sender_vkn_tckn || ''}
                    onChange={(e) => setIntegratorConfig({ ...integratorConfig, sender_vkn_tckn: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--app-bg)',
                      color: 'var(--text-strong)',
                      fontSize: '.9rem',
                      fontFamily: 'monospace',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Vergi Dairesi:</label>
                  <input
                    type="text"
                    value={integratorConfig.sender_tax_office || ''}
                    onChange={(e) => setIntegratorConfig({ ...integratorConfig, sender_tax_office: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--app-bg)',
                      color: 'var(--text-strong)',
                      fontSize: '.9rem',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Firma Resmi Ünvanı:</label>
                <input
                  type="text"
                  value={integratorConfig.sender_title || ''}
                  onChange={(e) => setIntegratorConfig({ ...integratorConfig, sender_title: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--app-bg)',
                    color: 'var(--text-strong)',
                    fontSize: '.9rem',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Firma Resmi Adresi:</label>
                <textarea
                  rows={2}
                  value={integratorConfig.sender_address || ''}
                  onChange={(e) => setIntegratorConfig({ ...integratorConfig, sender_address: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--app-bg)',
                    color: 'var(--text-strong)',
                    fontSize: '.9rem',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Posta Kutusu Etiketi (PK):</label>
                  <input
                    type="text"
                    value={integratorConfig.alias_pk || ''}
                    onChange={(e) => setIntegratorConfig({ ...integratorConfig, alias_pk: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--app-bg)',
                      color: 'var(--text-strong)',
                      fontSize: '.85rem',
                      fontFamily: 'monospace',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Gönderici Birim Etiketi (GB):</label>
                  <input
                    type="text"
                    value={integratorConfig.alias_gb || ''}
                    onChange={(e) => setIntegratorConfig({ ...integratorConfig, alias_gb: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--app-bg)',
                      color: 'var(--text-strong)',
                      fontSize: '.85rem',
                      fontFamily: 'monospace',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, paddingTop: 10 }}>
                <button
                  type="submit"
                  disabled={savingConfig}
                  style={{
                    padding: '12px 24px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#f5a623',
                    color: '#000',
                    fontWeight: 800,
                    fontSize: '.95rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <i className={`fa-solid ${savingConfig ? 'fa-spinner fa-spin' : 'fa-check'}`} />
                  {savingConfig ? 'Kaydediliyor...' : 'Ayarları Kaydet'}
                </button>

                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testingConnection}
                  style={{
                    padding: '12px 20px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--surface-2)',
                    color: 'var(--text-strong)',
                    fontWeight: 700,
                    fontSize: '.9rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <i className={`fa-solid ${testingConnection ? 'fa-spinner fa-spin' : 'fa-plug-circle-check'}`} />
                  {testingConnection ? 'Test Ediliyor...' : 'Bağlantıyı Test Et'}
                </button>
              </div>
            </form>
          </div>

          {/* Sağ Kolon: Canlı Bağlantı Doğrulama & Mükellef Sorgulama */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Connection Test Result Card */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-strong)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className="fa-solid fa-tower-broadcast" style={{ color: '#38bdf8' }} />
                  Entegratör Sağlık & Bağlantı Durumu
                </h3>
              </div>

              {testConnectionResult ? (
                <div
                  style={{
                    background: testConnectionResult.success ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                    border: `1px solid ${testConnectionResult.success ? '#86efac' : '#fca5a5'}`,
                    borderRadius: 10,
                    padding: 14,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: testConnectionResult.success ? '#15803d' : '#b91c1c', marginBottom: 6 }}>
                    <i className={`fa-solid ${testConnectionResult.success ? 'fa-circle-check' : 'fa-circle-xmark'}`} />
                    {testConnectionResult.success ? 'BAĞLANTI BAŞARILI' : 'BAĞLANTI HATASI'}
                  </div>
                  <div style={{ fontSize: '.85rem', color: 'var(--text-strong)', marginBottom: 8 }}>
                    {testConnectionResult.message || testConnectionResult.error}
                  </div>
                  {testConnectionResult.latencyMs && (
                    <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
                      API Gecikme Süresi (Latency): <strong>{testConnectionResult.latencyMs} ms</strong>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ padding: 14, background: 'var(--surface-2)', borderRadius: 8, fontSize: '.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                  Entegratör servisiyle anlık handshake ve token testini başlatmak için "Bağlantıyı Test Et" butonuna basın.
                </div>
              )}
            </div>

            {/* Tax Payer Query (VKN/TCKN) Card */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-strong)', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="fa-solid fa-address-card" style={{ color: '#f5a623' }} />
                GİB / Entegratör Mükellef Sorgulama
              </h3>
              <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', margin: '0 0 14px 0' }}>
                VKN veya TCKN girerek müşterinin veya tedarikçinin e-Fatura mükellefiyeti ve posta kutusu adresini anlık sorgulayın:
              </p>

              <form onSubmit={handleQueryTaxPayer} style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <input
                  type="text"
                  value={taxPayerQueryVkn}
                  onChange={(e) => setTaxPayerQueryVkn(e.target.value)}
                  placeholder="VKN veya TCKN girin..."
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--app-bg)',
                    color: 'var(--text-strong)',
                    fontSize: '.85rem',
                    fontFamily: 'monospace',
                  }}
                />
                <button
                  type="submit"
                  disabled={queryingTaxPayer}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#f5a623',
                    color: '#000',
                    fontWeight: 700,
                    fontSize: '.85rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <i className={`fa-solid ${queryingTaxPayer ? 'fa-spinner fa-spin' : 'fa-magnifying-glass'}`} />
                  Sorgula
                </button>
              </form>

              {taxPayerQueryResult && (
                <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>MÜKELLEFİYET DURUMU:</span>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 6,
                        fontSize: '.72rem',
                        fontWeight: 800,
                        background: taxPayerQueryResult.isEInvoiceUser ? '#ecfdf5' : '#fffbeb',
                        color: taxPayerQueryResult.isEInvoiceUser ? '#065f46' : '#b45309',
                        border: `1px solid ${taxPayerQueryResult.isEInvoiceUser ? '#a7f3d0' : '#fde68a'}`,
                      }}
                    >
                      {taxPayerQueryResult.isEInvoiceUser ? 'E-FATURA MÜKELLEFİ (B2B)' : 'E-ARŞİV KAPSAMINDA (B2C)'}
                    </span>
                  </div>

                  <div style={{ fontWeight: 800, color: 'var(--text-strong)', fontSize: '.9rem', marginBottom: 4 }}>
                    {taxPayerQueryResult.title || '-'}
                  </div>

                  {taxPayerQueryResult.aliasPk && (
                    <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: 4 }}>
                      PK: {taxPayerQueryResult.aliasPk}
                    </div>
                  )}

                  {taxPayerQueryResult.taxOffice && (
                    <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      Vergi Dairesi: {taxPayerQueryResult.taxOffice}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal 1: GİB Resmi Formatında HTML / XML Fatura Önizleme Modalı */}
      {selectedInvoice && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: 14,
              width: '100%',
              maxWidth: 960,
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              overflow: 'hidden',
            }}
          >
            {/* Modal Header */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-strong)' }}>
                  {selectedInvoice.invoice_number}
                </span>
                <span style={{ fontSize: '.75rem', padding: '2px 8px', borderRadius: 6, background: 'rgba(245,166,35,0.15)', color: '#f5a623', fontWeight: 700 }}>
                  {selectedInvoice.profile_id}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* Preview tab switcher */}
                <div style={{ display: 'flex', background: 'var(--app-bg)', borderRadius: 8, padding: 3, border: '1px solid var(--border)' }}>
                  <button
                    type="button"
                    onClick={() => setPreviewTab('html')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      border: 'none',
                      background: previewTab === 'html' ? 'var(--surface)' : 'transparent',
                      color: previewTab === 'html' ? 'var(--text-strong)' : 'var(--text-muted)',
                      fontWeight: 600,
                      fontSize: '.75rem',
                      cursor: 'pointer',
                    }}
                  >
                    GİB Belgesi (HTML)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewTab('xml')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      border: 'none',
                      background: previewTab === 'xml' ? 'var(--surface)' : 'transparent',
                      color: previewTab === 'xml' ? 'var(--text-strong)' : 'var(--text-muted)',
                      fontWeight: 600,
                      fontSize: '.75rem',
                      cursor: 'pointer',
                    }}
                  >
                    UBL 2.1 XML
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedInvoice(null)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text-strong)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div style={{ padding: 24, overflowY: 'auto', flex: 1, background: previewTab === 'html' ? '#f1f5f9' : 'var(--app-bg)' }}>
              {loadingDetails ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                  <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} />
                  Fatura detayları yükleniyor...
                </div>
              ) : previewTab === 'html' ? (
                <div
                  dangerouslySetInnerHTML={{
                    __html: eInvoiceService.generateGibHtmlPreview(selectedInvoice),
                  }}
                />
              ) : (
                <pre
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '.8rem',
                    background: '#111',
                    color: '#4ade80',
                    padding: 16,
                    borderRadius: 8,
                    overflowX: 'auto',
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  {selectedInvoice.ubl_xml || 'XML içeriği mevcut değil.'}
                </pre>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-2)' }}>
              <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>
                ETTN: <span style={{ fontFamily: 'monospace' }}>{selectedInvoice.ettn}</span>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                {selectedInvoice.direction === 'INBOUND' && selectedInvoice.profile_id === 'TICARIFATURA' && selectedInvoice.status_code === 1200 && (
                  <button
                    type="button"
                    onClick={() => handleOpenResponseModal(selectedInvoice)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 8,
                      border: 'none',
                      background: '#f5a623',
                      color: '#000',
                      fontWeight: 700,
                      fontSize: '.85rem',
                      cursor: 'pointer',
                    }}
                  >
                    <i className="fa-solid fa-reply" style={{ marginRight: 6 }} />
                    Kabul / Red Yanıtı Ver
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setSelectedInvoice(null)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text-strong)',
                    fontWeight: 600,
                    fontSize: '.85rem',
                    cursor: 'pointer',
                  }}
                >
                  Kapat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Ticari Fatura Yanıt Modalı (Kabul / Red) */}
      {responseModalOpen && respondingInvoice && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: 14,
              width: '100%',
              maxWidth: 540,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 800, color: 'var(--text-strong)', fontSize: '1rem' }}>
                Ticari Fatura Yanıtı Gönder (ApplicationResponse)
              </div>
              <button
                type="button"
                onClick={() => setResponseModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem' }}
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <div style={{ padding: 20 }}>
              <div style={{ background: 'var(--app-bg)', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: '.85rem' }}>
                <div><strong>Fatura No:</strong> {respondingInvoice.invoice_number}</div>
                <div style={{ marginTop: 2 }}><strong>Tedarikçi:</strong> {respondingInvoice.sender_title}</div>
                <div style={{ marginTop: 2 }}><strong>Tutar:</strong> {Number(respondingInvoice.payable_amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: '.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>Uygulama Yanıtı Kararınız:</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setResponseType('KABUL')}
                    style={{
                      padding: '12px',
                      borderRadius: 8,
                      border: responseType === 'KABUL' ? '2px solid #10b981' : '1px solid var(--border)',
                      background: responseType === 'KABUL' ? 'rgba(16,185,129,0.12)' : 'var(--app-bg)',
                      color: responseType === 'KABUL' ? '#10b981' : 'var(--text-strong)',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                    }}
                  >
                    <i className="fa-solid fa-circle-check" />
                    KABUL ET
                  </button>

                  <button
                    type="button"
                    onClick={() => setResponseType('RED')}
                    style={{
                      padding: '12px',
                      borderRadius: 8,
                      border: responseType === 'RED' ? '2px solid #ef4444' : '1px solid var(--border)',
                      background: responseType === 'RED' ? 'rgba(239,68,68,0.12)' : 'var(--app-bg)',
                      color: responseType === 'RED' ? '#ef4444' : 'var(--text-strong)',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                    }}
                  >
                    <i className="fa-solid fa-circle-xmark" />
                    REDDET
                  </button>
                </div>
              </div>

              {responseType === 'RED' && (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: '.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                    Red Gerekçesi (Zorunlu):
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Red gerekçesini detaylı olarak açıklayınız..."
                    value={responseReason}
                    onChange={(e) => setResponseReason(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--app-bg)',
                      color: 'var(--text-strong)',
                      fontSize: '.85rem',
                      marginBottom: 8,
                    }}
                  />

                  {/* Quick reason templates */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {[
                      'Birim fiyat uyuşmazlığı',
                      'Eksik / hasarlı teslimat',
                      'Sipariş edilmeyen ürün',
                      'Hatalı vergi oranı',
                    ].map((tpl) => (
                      <button
                        key={tpl}
                        type="button"
                        onClick={() => setResponseReason(tpl)}
                        style={{
                          padding: '4px 8px',
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                          background: 'var(--surface-2)',
                          color: 'var(--text-muted)',
                          fontSize: '.75rem',
                          cursor: 'pointer',
                        }}
                      >
                        + {tpl}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', background: 'var(--surface-2)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setResponseModalOpen(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text-strong)',
                  fontWeight: 600,
                  fontSize: '.85rem',
                  cursor: 'pointer',
                }}
              >
                Vazgeç
              </button>

              <button
                type="button"
                disabled={submittingResponse}
                onClick={handleSubmitResponse}
                style={{
                  padding: '8px 20px',
                  borderRadius: 8,
                  border: 'none',
                  background: responseType === 'KABUL' ? '#10b981' : '#ef4444',
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: '.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <i className={`fa-solid ${submittingResponse ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`} />
                {submittingResponse ? 'İletiliyor...' : 'Yanıtı GİB Sistemine Gönder'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Rich 3-Way Matching & Mal Kabul Mutabakat Modalı */}
      {matchingModalOpen && matchingInvoice && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 1050,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: 14,
              width: '100%',
              maxWidth: 1280,
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              overflow: 'hidden',
              border: '1px solid var(--border)',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '16px 24px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--surface-2)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: 'rgba(245,166,35,0.15)',
                    color: '#f5a623',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.2rem',
                  }}
                >
                  <i className="fa-solid fa-scale-balanced" />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-strong)' }}>
                      3-Way Matching & Mal Kabul Mutabakatı
                    </span>
                    <span
                      style={{
                        fontSize: '.75rem',
                        padding: '2px 8px',
                        borderRadius: 6,
                        background: 'rgba(245,166,35,0.15)',
                        color: '#f5a623',
                        fontWeight: 700,
                        fontFamily: 'monospace',
                      }}
                    >
                      {matchingInvoice.invoice_number}
                    </span>
                  </div>
                  <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    Tedarikçi: <strong>{matchingInvoice.sender_title}</strong> (VKN: {matchingInvoice.sender_vkn_tckn})
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* Match Score Badge */}
                {activeComparison && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 14px',
                      borderRadius: 20,
                      background:
                        activeComparison.matchScore >= 95
                          ? 'rgba(16,185,129,0.15)'
                          : activeComparison.matchScore >= 75
                          ? 'rgba(245,158,11,0.15)'
                          : 'rgba(239,68,68,0.15)',
                      border: `1px solid ${
                        activeComparison.matchScore >= 95
                          ? '#10b981'
                          : activeComparison.matchScore >= 75
                          ? '#f59e0b'
                          : '#ef4444'
                      }`,
                      color:
                        activeComparison.matchScore >= 95
                          ? '#10b981'
                          : activeComparison.matchScore >= 75
                          ? '#f59e0b'
                          : '#ef4444',
                      fontWeight: 800,
                      fontSize: '.85rem',
                    }}
                  >
                    <i
                      className={`fa-solid ${
                        activeComparison.matchScore >= 95
                          ? 'fa-circle-check'
                          : activeComparison.matchScore >= 75
                          ? 'fa-triangle-exclamation'
                          : 'fa-circle-xmark'
                      }`}
                    />
                    <span>Uyum Skoru: %{activeComparison.matchScore}</span>
                    <span style={{ fontSize: '.75rem', fontWeight: 600, opacity: 0.9 }}>
                      ({activeComparison.matchedLinesCount} / {activeComparison.totalInvoiceLinesCount} Kalem Tam Uyumlu)
                    </span>
                  </div>
                )}

                {/* Tolerance Button */}
                <button
                  type="button"
                  title="Fiyat ve Miktar Tolerans Ayarlarını Yapılandır"
                  onClick={() => setToleranceModalOpen(true)}
                  style={{
                    padding: '7px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text-strong)',
                    fontSize: '.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <i className="fa-solid fa-sliders" />
                  Tolerans (%{toleranceSettings.priceTolerancePercent})
                </button>

                <button
                  type="button"
                  onClick={() => setMatchingModalOpen(false)}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text-strong)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div style={{ padding: 20, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}>
              {matchingLoading ? (
                <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
                  <i className="fa-solid fa-spinner fa-spin fa-2x" style={{ marginBottom: 12, color: '#f5a623' }} />
                  <div style={{ fontWeight: 700, fontSize: '.95rem', color: 'var(--text-strong)' }}>
                    Mal Kabul İrsaliyeleri Taranıyor & 3-Way Karşılaştırma Yapılıyor...
                  </div>
                  <div style={{ fontSize: '.8rem', marginTop: 4 }}>
                    Tedarikçi VKN'si ve kalem kodları taranarak en uyumlu teslimat fişleri eşleştiriliyor.
                  </div>
                </div>
              ) : (
                <>
                  {/* Top Split View: Fatura vs İrsaliye Seçimi */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    {/* Left Card: Fatura Bilgileri */}
                    <div
                      style={{
                        background: 'var(--app-bg)',
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        padding: 16,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                          <div style={{ fontSize: '.8rem', fontWeight: 800, color: '#f5a623', textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <i className="fa-solid fa-file-invoice" />
                            1. Gelen e-Fatura
                          </div>
                          <span style={{ fontSize: '.72rem', padding: '2px 8px', borderRadius: 4, background: 'rgba(245,166,35,0.15)', color: '#f5a623', fontWeight: 700 }}>
                            {matchingInvoice.profile_id}
                          </span>
                        </div>

                        <div style={{ fontSize: '.95rem', fontWeight: 800, color: 'var(--text-strong)', marginBottom: 4 }}>
                          {matchingInvoice.sender_title}
                        </div>
                        <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: 10 }}>
                          VKN: <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{matchingInvoice.sender_vkn_tckn}</span> | Tarih: <strong>{matchingInvoice.issue_date}</strong>
                        </div>
                      </div>

                      {/* Fatura Toplamları */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, background: 'var(--surface)', padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div>
                          <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>Mal/Hizmet</div>
                          <div style={{ fontWeight: 700, color: 'var(--text-strong)', fontSize: '.85rem' }}>
                            {Number(matchingInvoice.line_extension_amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>KDV Toplamı</div>
                          <div style={{ fontWeight: 700, color: 'var(--text-strong)', fontSize: '.85rem' }}>
                            {Number(matchingInvoice.tax_total_amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '.7rem', color: '#f5a623', fontWeight: 700 }}>Ödenecek Tutar</div>
                          <div style={{ fontWeight: 900, color: '#f5a623', fontSize: '.95rem' }}>
                            {Number(matchingInvoice.payable_amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right Card: Eşleşen Mal Kabul İrsaliyesi Seçici */}
                    <div
                      style={{
                        background: 'var(--app-bg)',
                        border: activeCandidate ? '1px solid #10b981' : '1px dashed var(--border)',
                        borderRadius: 10,
                        padding: 16,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                          <div style={{ fontSize: '.8rem', fontWeight: 800, color: '#10b981', textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <i className="fa-solid fa-truck-ramp-box" />
                            2. Mal Kabul İrsaliyesi (Fiziki Giriş)
                          </div>
                          {candidateReceipts.length > 0 && (
                            <span style={{ fontSize: '.72rem', padding: '2px 8px', borderRadius: 4, background: 'rgba(16,185,129,0.15)', color: '#10b981', fontWeight: 700 }}>
                              {candidateReceipts.length} Aday İrsaliye Bulundu
                            </span>
                          )}
                        </div>

                        {/* Candidate Receipts Selector Dropdown */}
                        {candidateReceipts.length > 0 ? (
                          <div style={{ marginBottom: 10 }}>
                            <select
                              value={selectedCandidateIndex}
                              onChange={(e) => setSelectedCandidateIndex(Number(e.target.value))}
                              style={{
                                width: '100%',
                                padding: '8px 12px',
                                borderRadius: 8,
                                border: '1px solid var(--border)',
                                background: 'var(--surface)',
                                color: 'var(--text-strong)',
                                fontSize: '.85rem',
                                fontWeight: 700,
                              }}
                            >
                              {candidateReceipts.map((cand, idx) => (
                                <option key={cand.receipt.id} value={idx}>
                                  {cand.receipt.receipt_no || cand.receipt.doc_no || `İrsaliye #${idx + 1}`} ({cand.receipt.delivered_on}) - {cand.receipt.branch_name || 'Ana Depo'} | Uyum: %{cand.score}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <div style={{ padding: '12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, color: '#ef4444', fontSize: '.8rem', marginBottom: 10 }}>
                            <i className="fa-solid fa-circle-exclamation" style={{ marginRight: 6 }} />
                            Bu tedarikçiye ait sistemde eşleşen açık mal kabul irsaliyesi bulunamadı.
                          </div>
                        )}

                        {activeCandidate && (
                          <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>
                            Kabul Şubesi: <strong>{activeCandidate.receipt.branch_name || 'Ana Depo'}</strong> | Sipariş No: <strong style={{ fontFamily: 'monospace' }}>{activeCandidate.receipt.order_no || activeCandidate.order?.order_no || 'Doğrudan Kabul'}</strong>
                          </div>
                        )}
                      </div>

                      {/* İrsaliye Toplamları */}
                      {activeCandidate && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, background: 'var(--surface)', padding: 10, borderRadius: 8, border: '1px solid var(--border)' }}>
                          <div>
                            <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>İrsaliye Tarihi</div>
                            <div style={{ fontWeight: 700, color: 'var(--text-strong)', fontSize: '.85rem' }}>
                              {activeCandidate.receipt.delivered_on || '-'}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>Teslim Kalemi</div>
                            <div style={{ fontWeight: 700, color: 'var(--text-strong)', fontSize: '.85rem' }}>
                              {activeCandidate.lines?.length || 0} Kalem
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: '.7rem', color: '#10b981', fontWeight: 700 }}>İrsaliye Tutarı</div>
                            <div style={{ fontWeight: 900, color: '#10b981', fontSize: '.95rem' }}>
                              {Number(activeCandidate.receipt.total_amount_vat_inc || activeCandidate.receipt.total_amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Contract Price Violation Banner (Hard Violation Alert) */}
                  {activeComparison && (activeComparison.hasContractPriceViolation || activeComparison.contractValidation?.hasViolation) && (
                    <div
                      style={{
                        background: 'linear-gradient(135deg, rgba(239,68,68,0.16) 0%, rgba(185,28,28,0.16) 100%)',
                        border: '2px solid #ef4444',
                        borderRadius: 12,
                        padding: '16px 20px',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 16,
                        boxShadow: '0 4px 16px rgba(239,68,68,0.15)',
                      }}
                    >
                      <div
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 10,
                          background: '#ef4444',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '1.3rem',
                          flexShrink: 0,
                          boxShadow: '0 2px 8px rgba(239,68,68,0.4)',
                        }}
                      >
                        <i className="fa-solid fa-ban" />
                      </div>

                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                          <span style={{ fontSize: '.95rem', fontWeight: 900, color: '#ef4444', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            ⛔ SÖZLEŞME FİYAT İHLALİ TESPİT EDİLDİ! EŞLEŞTİRME ONAYI KİLİTLENDİ
                          </span>

                          {activeComparison.contractValidation?.contract && (
                            <button
                              type="button"
                              onClick={() => handleOpenContractModal(activeComparison.contractValidation.contract)}
                              style={{
                                fontSize: '.78rem',
                                padding: '4px 12px',
                                borderRadius: 8,
                                background: '#ef4444',
                                color: '#ffffff',
                                border: 'none',
                                fontWeight: 800,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                              }}
                            >
                              <i className="fa-solid fa-file-contract" />
                              #{activeComparison.contractValidation.contractNo} Sözleşmesini İncele ➔
                            </button>
                          )}
                        </div>

                        <div style={{ fontSize: '.86rem', color: 'var(--text-strong)', marginTop: 6, fontWeight: 700, lineHeight: 1.4 }}>
                          {activeComparison.contractValidation?.violationMessage ||
                            'Geçerliliği devam eden sözleşmeden farklı fiyatla kesilen fatura kabul edilemez!'}
                        </div>

                        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {activeComparison.contractValidation?.discrepantLines?.map((dl, idx) => (
                            <span
                              key={idx}
                              style={{
                                fontSize: '.76rem',
                                padding: '4px 10px',
                                borderRadius: 6,
                                background: 'rgba(239,68,68,0.22)',
                                color: '#ef4444',
                                border: '1px solid rgba(239,68,68,0.5)',
                                fontWeight: 800,
                              }}
                            >
                              {dl.itemName}: Sözleşme: {Number(dl.contractPrice).toFixed(2)} ₺ ➔ Fatura: {Number(dl.invoicePrice).toFixed(2)} ₺ (+%{dl.priceDiffPercent} Aşım)
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Discrepancy Alert Banner */}
                  {activeComparison && activeComparison.discrepancies?.length > 0 && !(activeComparison.hasContractPriceViolation || activeComparison.contractValidation?.hasViolation) && (
                    <div
                      style={{
                        background: 'rgba(245,158,11,0.08)',
                        border: '1px solid rgba(245,158,11,0.3)',
                        borderRadius: 10,
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 12,
                      }}
                    >
                      <i className="fa-solid fa-triangle-exclamation" style={{ color: '#f59e0b', fontSize: '1.2rem', marginTop: 2 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 800, color: '#f59e0b', fontSize: '.88rem', marginBottom: 4 }}>
                          {activeComparison.discrepancies.length} Kalemde Uyuşmazlık Tespit Edildi (Net Fark: {activeComparison.totalNetDiff > 0 ? `+${activeComparison.totalNetDiff.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : activeComparison.totalNetDiff.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺)
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {activeComparison.discrepancies.slice(0, 3).map((d, i) => (
                            <span
                              key={i}
                              style={{
                                fontSize: '.75rem',
                                padding: '3px 8px',
                                borderRadius: 6,
                                background: d.severity === 'danger' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                                color: d.severity === 'danger' ? '#ef4444' : '#f59e0b',
                                fontWeight: 600,
                              }}
                            >
                              {d.title}
                            </span>
                          ))}
                          {activeComparison.discrepancies.length > 3 && (
                            <span style={{ fontSize: '.75rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
                              +{activeComparison.discrepancies.length - 3} diğer fark
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleOpenDisputeModal}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 6,
                          border: '1px solid rgba(239,68,68,0.4)',
                          background: 'rgba(239,68,68,0.12)',
                          color: '#ef4444',
                          fontWeight: 700,
                          fontSize: '.75rem',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <i className="fa-solid fa-file-circle-xmark" />
                        İtiraz Tutanağı
                      </button>
                    </div>
                  )}

                  {/* Kalem Bazlı 3-Way Karşılaştırma Matrisi Tablosu */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ fontSize: '.85rem', fontWeight: 800, color: 'var(--text-strong)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className="fa-solid fa-table-cells" style={{ color: '#f5a623' }} />
                        Kalem Bazlı 3-Way Eşleştirme & Discrepancy Tablosu
                      </div>

                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={() => setShowOnlyDiscrepantLines(false)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: 6,
                            border: '1px solid var(--border)',
                            background: !showOnlyDiscrepantLines ? 'var(--surface-2)' : 'transparent',
                            color: !showOnlyDiscrepantLines ? 'var(--text-strong)' : 'var(--text-muted)',
                            fontWeight: 700,
                            fontSize: '.75rem',
                            cursor: 'pointer',
                          }}
                        >
                          Tüm Kalemler ({activeComparison?.lineComparisons?.length || 0})
                        </button>

                        <button
                          type="button"
                          onClick={() => setShowOnlyDiscrepantLines(true)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: 6,
                            border: '1px solid var(--border)',
                            background: showOnlyDiscrepantLines ? 'rgba(245,158,11,0.15)' : 'transparent',
                            color: showOnlyDiscrepantLines ? '#f5a623' : 'var(--text-muted)',
                            fontWeight: 700,
                            fontSize: '.75rem',
                            cursor: 'pointer',
                          }}
                        >
                          Sadece Uyuşmazlıklar ({activeComparison?.discrepancies?.length || 0})
                        </button>
                      </div>
                    </div>

                    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '.82rem' }}>
                        <thead>
                          <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '.72rem', textTransform: 'uppercase', fontWeight: 700 }}>
                            <th style={{ padding: '10px 12px', width: 36, textAlign: 'center' }}>#</th>
                            <th style={{ padding: '10px 12px' }}>Mal / Hizmet Açıklaması</th>
                            <th style={{ padding: '10px 12px', textAlign: 'right' }}>Fatura Miktarı</th>
                            <th style={{ padding: '10px 12px', textAlign: 'right' }}>İrsaliye Teslimatı</th>
                            <th style={{ padding: '10px 12px', textAlign: 'right' }}>Fatura Fiyatı</th>
                            <th style={{ padding: '10px 12px', textAlign: 'right' }}>Kabul Fiyatı</th>
                            <th style={{ padding: '10px 12px', textAlign: 'center' }}>KDV</th>
                            <th style={{ padding: '10px 12px', textAlign: 'right' }}>Fatura Tutarı</th>
                            <th style={{ padding: '10px 12px', textAlign: 'right' }}>Net Fark</th>
                            <th style={{ padding: '10px 12px', textAlign: 'center' }}>Uyum Durumu</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(!activeComparison || activeComparison.lineComparisons.length === 0) ? (
                            <tr>
                              <td colSpan="10" style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>
                                Karşılaştırılacak satır verisi bulunamadı.
                              </td>
                            </tr>
                          ) : (
                            activeComparison.lineComparisons
                              .filter((line) => (showOnlyDiscrepantLines ? line.status !== 'EXACT_MATCH' && line.status !== 'PRICE_UNDER' : true))
                              .map((comp) => {
                                const isDiscrepant = comp.status !== 'EXACT_MATCH' && comp.status !== 'PRICE_UNDER'

                                return (
                                  <tr
                                    key={comp.lineIndex}
                                    style={{
                                      borderBottom: '1px solid var(--border)',
                                      background: isDiscrepant ? 'rgba(245,158,11,0.03)' : 'transparent',
                                    }}
                                  >
                                    <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}>
                                      {comp.lineIndex}
                                    </td>

                                    {/* Ürün Adı, Eşleşme Rozeti & RMS Stok Eşleme Butonu */}
                                    <td style={{ padding: '10px 12px' }}>
                                      {(() => {
                                        const isConfident =
                                          comp.matchMethod === 'EXACT' ||
                                          comp.matchMethod === 'MAPPED_MEMORY' ||
                                          comp.matchMethod === 'UNIQUE_QTY_PRICE'
                                        const showWarningOrAction = !isConfident || !comp.receiptLine

                                        return (
                                          <>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                              <div style={{ fontWeight: 700, color: 'var(--text-strong)' }}>
                                                {comp.invoiceLine.item_name}
                                              </div>

                                              {/* Manuel Eşle / Değiştir Butonu SADECE şüpheli/fonetik veya eşleşmeyen satırlarda çıkar */}
                                              {showWarningOrAction && (
                                                <button
                                                  type="button"
                                                  title="Bu fatura kalemini farklı bir RMS Stok Kartına bağla"
                                                  onClick={() => handleOpenItemMappingModal(comp)}
                                                  style={{
                                                    padding: '3px 8px',
                                                    borderRadius: 6,
                                                    border: '1px solid #f59e0b',
                                                    background: 'rgba(245,158,11,0.12)',
                                                    color: '#d97706',
                                                    fontSize: '.7rem',
                                                    fontWeight: 700,
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 4,
                                                    whiteSpace: 'nowrap',
                                                  }}
                                                >
                                                  <i className="fa-solid fa-link" />
                                                  {comp.receiptLine ? 'Eşlemeyi Değiştir' : 'Stok Eşle'}
                                                </button>
                                              )}
                                            </div>

                                            <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 3, alignItems: 'center' }}>
                                              {comp.invoiceLine.item_code && <span>Kod: {comp.invoiceLine.item_code}</span>}

                                              {/* Rozet SADECE fonetik öneri veya belirsiz durumlarda görünür */}
                                              {comp.matchMethod === 'PHONETIC_SUGGESTION' && comp.matchMethodBadge && (
                                                <span
                                                  style={{
                                                    padding: '1px 6px',
                                                    borderRadius: 4,
                                                    background: comp.matchMethodBadge.bg,
                                                    color: comp.matchMethodBadge.color,
                                                    fontWeight: 700,
                                                    fontSize: '.68rem',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: 4,
                                                  }}
                                                >
                                                  <i className={`fa-solid ${comp.matchMethodBadge.icon}`} />
                                                  {comp.matchMethodLabel}
                                                </span>
                                              )}

                                              {/* İrsaliyedeki isim farklıysa küçük gri/yeşil yönlendirme göster */}
                                              {comp.receiptLine && comp.receiptLine.item_name !== comp.invoiceLine.item_name && (
                                                <span style={{ color: '#10b981', fontWeight: 600 }}>
                                                  <i className="fa-solid fa-arrow-right" style={{ marginRight: 3, opacity: 0.7 }} />
                                                  İrsaliye: {comp.receiptLine.item_name}
                                                </span>
                                              )}
                                            </div>
                                          </>
                                        )
                                      })()}
                                    </td>

                                    {/* Fatura Miktarı */}
                                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>
                                      {Number(comp.invQty).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {comp.invoiceLine.unit_code || 'Adet'}
                                    </td>

                                    {/* İrsaliye Miktarı */}
                                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>
                                      {comp.receiptLine ? (
                                        <span>
                                          {Number(comp.rcptQty).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {comp.receiptLine.unit || comp.invoiceLine.unit_code || 'Adet'}
                                          {comp.qtyDiff !== 0 && (
                                            <span
                                              style={{
                                                display: 'block',
                                                fontSize: '.7rem',
                                                fontWeight: 700,
                                                color: comp.qtyDiff > 0 ? '#ef4444' : '#22d3ee',
                                              }}
                                            >
                                              {comp.qtyDiff > 0 ? `-${comp.qtyDiff} Eksik` : `+${Math.abs(comp.qtyDiff)} Fazla`}
                                            </span>
                                          )}
                                        </span>
                                      ) : (
                                        <span style={{ color: '#ef4444', fontStyle: 'italic' }}>Teslim Alınmadı</span>
                                      )}
                                    </td>

                                    {/* Fatura Birim Fiyatı */}
                                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>
                                      {Number(comp.invUnitPrice).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                                    </td>

                                    {/* Kabul Birim Fiyatı */}
                                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>
                                      {comp.receiptLine ? (
                                        <span>
                                          {Number(comp.rcptUnitPrice).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                                          {Math.abs(comp.priceDiffPercent) > toleranceSettings.priceTolerancePercent && (
                                            <span
                                              style={{
                                                display: 'block',
                                                fontSize: '.7rem',
                                                fontWeight: 700,
                                                color: comp.priceDiffPercent > 0 ? '#f59e0b' : '#10b981',
                                              }}
                                            >
                                              {comp.priceDiffPercent > 0 ? `+%${Math.round(comp.priceDiffPercent)} Zam` : `-%${Math.abs(Math.round(comp.priceDiffPercent))}`}
                                            </span>
                                          )}
                                        </span>
                                      ) : (
                                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                                      )}
                                    </td>

                                    {/* KDV */}
                                    <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600 }}>
                                      %{comp.invTaxRate}
                                      {comp.invTaxRate !== comp.rcptTaxRate && (
                                        <span style={{ display: 'block', fontSize: '.7rem', color: '#a78bfa', fontWeight: 700 }}>
                                          İrs: %{comp.rcptTaxRate}
                                        </span>
                                      )}
                                    </td>

                                    {/* Fatura Tutarı */}
                                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-strong)' }}>
                                      {Number(comp.invTotal).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                                    </td>

                                    {/* Net Fark */}
                                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>
                                      <span
                                        style={{
                                          color:
                                            comp.lineTotalDiff > 0
                                              ? '#ef4444'
                                              : comp.lineTotalDiff < 0
                                              ? '#10b981'
                                              : 'var(--text-muted)',
                                        }}
                                      >
                                        {comp.lineTotalDiff > 0 ? `+${comp.lineTotalDiff.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : comp.lineTotalDiff.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                                      </span>
                                    </td>

                                    {/* Durum Rozeti */}
                                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                      <span
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 5,
                                          padding: '3px 8px',
                                          borderRadius: 14,
                                          background: comp.statusBadge.bg,
                                          color: comp.statusBadge.color,
                                          border: `1px solid ${comp.statusBadge.border || comp.statusBadge.color}`,
                                          fontSize: '.72rem',
                                          fontWeight: 700,
                                          whiteSpace: 'nowrap',
                                        }}
                                      >
                                        <i className={`fa-solid ${comp.statusBadge.icon}`} />
                                        {comp.statusLabel}
                                      </span>
                                    </td>
                                  </tr>
                                )
                              })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Mutabakat Notu Ekleme */}
                  <div>
                    <label style={{ display: 'block', fontSize: '.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                      Mutabakat Notu / Açıklama (İsteğe Bağlı):
                    </label>
                    <input
                      type="text"
                      placeholder="Mal kabul fişi ve sipariş karşılaştırılarak onaylanmıştır..."
                      value={matchingNote}
                      onChange={(e) => setMatchingNote(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--app-bg)',
                        color: 'var(--text-strong)',
                        fontSize: '.85rem',
                      }}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '14px 24px',
                borderTop: '1px solid var(--border)',
                background: 'var(--surface-2)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              {/* Sol Taraf: Net Fark Özeti */}
              <div>
                {activeComparison && (
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: '.85rem' }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Fatura: </span>
                      <strong style={{ color: 'var(--text-strong)' }}>
                        {Number(activeComparison.totalInvoicedAmount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>İrsaliye: </span>
                      <strong style={{ color: 'var(--text-strong)' }}>
                        {Number(activeComparison.totalReceiptAmount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                      </strong>
                    </div>
                    <div
                      style={{
                        padding: '4px 10px',
                        borderRadius: 6,
                        background:
                          Math.abs(activeComparison.totalNetDiff) <= 1
                            ? 'rgba(16,185,129,0.15)'
                            : 'rgba(239,68,68,0.15)',
                        color:
                          Math.abs(activeComparison.totalNetDiff) <= 1 ? '#10b981' : '#ef4444',
                        fontWeight: 800,
                      }}
                    >
                      Net Fark: {activeComparison.totalNetDiff > 0 ? `+${activeComparison.totalNetDiff.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : activeComparison.totalNetDiff.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                    </div>
                  </div>
                )}
              </div>

              {/* Sağ Taraf: Aksiyon Butonları */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setMatchingModalOpen(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text-strong)',
                    fontWeight: 600,
                    fontSize: '.85rem',
                    cursor: 'pointer',
                  }}
                >
                  Kapat
                </button>

                {/* Dispute / Reject Button */}
                {activeComparison && activeComparison.discrepancies.length > 0 && (
                  <button
                    type="button"
                    onClick={handleOpenDisputeModal}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 8,
                      border: '1px solid #ef4444',
                      background: 'rgba(239,68,68,0.12)',
                      color: '#ef4444',
                      fontWeight: 700,
                      fontSize: '.85rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <i className="fa-solid fa-file-circle-xmark" />
                    Fark Faturası / İtiraz Oluştur
                  </button>
                )}

                {/* Contract Price Violation Status Warning & Blocked Button */}
                {activeComparison && (activeComparison.hasContractPriceViolation || activeComparison.contractValidation?.hasViolation) && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      color: '#ef4444',
                      fontSize: '.78rem',
                      fontWeight: 800,
                      background: 'rgba(239,68,68,0.12)',
                      padding: '6px 12px',
                      borderRadius: 8,
                      border: '1px solid rgba(239,68,68,0.3)',
                    }}
                  >
                    <i className="fa-solid fa-ban" />
                    Sözleşme İhlali Nedeniyle Onay Kilitli
                  </div>
                )}

                {/* Approve Match Button */}
                <button
                  type="button"
                  disabled={
                    approvingMatch ||
                    !activeCandidate ||
                    Boolean(activeComparison?.hasContractPriceViolation || activeComparison?.contractValidation?.hasViolation)
                  }
                  title={
                    (activeComparison?.hasContractPriceViolation || activeComparison?.contractValidation?.hasViolation)
                      ? 'Geçerliliği devam eden sözleşmeden farklı fiyatla kesilen fatura kabul edilemez! Onaylamak için fiyat uyuşmazlığı giderilmeli veya tedarikçiye itiraz tutanağı iletilmelidir.'
                      : 'Eşleştirmeyi onayla ve cari hesaba alacak kaydı işle'
                  }
                  onClick={handleApproveMatch}
                  style={{
                    padding: '8px 22px',
                    borderRadius: 8,
                    border: 'none',
                    background:
                      (activeComparison?.hasContractPriceViolation || activeComparison?.contractValidation?.hasViolation)
                        ? '#475569'
                        : '#f5a623',
                    color:
                      (activeComparison?.hasContractPriceViolation || activeComparison?.contractValidation?.hasViolation)
                        ? '#94a3b8'
                        : '#000000',
                    fontWeight: 800,
                    fontSize: '.9rem',
                    cursor:
                      (activeComparison?.hasContractPriceViolation || activeComparison?.contractValidation?.hasViolation)
                        ? 'not-allowed'
                        : 'pointer',
                    opacity:
                      (activeComparison?.hasContractPriceViolation || activeComparison?.contractValidation?.hasViolation)
                        ? 0.65
                        : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    boxShadow:
                      (activeComparison?.hasContractPriceViolation || activeComparison?.contractValidation?.hasViolation)
                        ? 'none'
                        : '0 4px 12px rgba(245,166,35,0.25)',
                  }}
                >
                  <i
                    className={`fa-solid ${
                      approvingMatch
                        ? 'fa-spinner fa-spin'
                        : (activeComparison?.hasContractPriceViolation || activeComparison?.contractValidation?.hasViolation)
                        ? 'fa-ban'
                        : 'fa-circle-check'
                    }`}
                  />
                  {approvingMatch
                    ? 'Cariye İşleniyor...'
                    : (activeComparison?.hasContractPriceViolation || activeComparison?.contractValidation?.hasViolation)
                    ? 'Sözleşme İhlali (Onay Engellendi)'
                    : 'Eşleştirmeyi Onayla & Cariye İşle'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: Tolerans Ayarları Modalı */}
      {toleranceModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 1150,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: 12,
              width: '100%',
              maxWidth: 460,
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)',
              overflow: 'hidden',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 800, color: 'var(--text-strong)', fontSize: '.95rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="fa-solid fa-sliders" style={{ color: '#f5a623' }} />
                3-Way Matching Tolerans Parametreleri
              </div>
              <button
                type="button"
                onClick={() => setToleranceModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Birim Fiyat Sapma Toleransı (%):
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="20"
                  value={toleranceSettings.priceTolerancePercent}
                  onChange={(e) => setToleranceSettings({ ...toleranceSettings, priceTolerancePercent: parseFloat(e.target.value) || 0 })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--app-bg)',
                    color: 'var(--text-strong)',
                    fontSize: '.85rem',
                  }}
                />
                <span style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: 2, display: 'block' }}>
                  Bu oranın altındaki küçük kur/fiyat yuvarlama farkları uyuşmazlık sayılmaz.
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Miktar / Gramaj Sapma Toleransı (Birim):
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="10"
                  value={toleranceSettings.qtyTolerance}
                  onChange={(e) => setToleranceSettings({ ...toleranceSettings, qtyTolerance: parseFloat(e.target.value) || 0 })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--app-bg)',
                    color: 'var(--text-strong)',
                    fontSize: '.85rem',
                  }}
                />
              </div>

              <div style={{ paddingTop: 4 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.85rem', fontWeight: 600, color: 'var(--text-strong)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={toleranceSettings.checkTaxRates}
                    onChange={(e) => setToleranceSettings({ ...toleranceSettings, checkTaxRates: e.target.checked })}
                  />
                  KDV Oranı Farklılıklarını Uyuşmazlık Olarak Denetle
                </label>
              </div>
            </div>

            <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', background: 'var(--surface-2)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => setToleranceModalOpen(false)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text-strong)',
                  fontSize: '.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                İptal
              </button>
              <button
                type="button"
                onClick={() => handleApplyTolerance(toleranceSettings)}
                style={{
                  padding: '6px 16px',
                  borderRadius: 6,
                  border: 'none',
                  background: '#f5a623',
                  color: '#000',
                  fontSize: '.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Uygula & Güncelle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 5: Uyuşmazlık Tutanağı & Fark İtiraz Modalı */}
      {disputeModalOpen && matchingInvoice && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            zIndex: 1200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: 14,
              width: '100%',
              maxWidth: 640,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              overflow: 'hidden',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 800, color: '#ef4444', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="fa-solid fa-file-circle-xmark" />
                Fatura İtiraz Tutanağı & Red Bildirimi
              </div>
              <button
                type="button"
                onClick={() => setDisputeModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: '.85rem', color: 'var(--text-muted)' }}>
                3-Way Matching motoru tarafından tespit edilen uyuşmazlıklar aşağıdaki gibidir. Bu tutanak tedarikçiye iletilebilir veya GİB ticari fatura red gerekçesi olarak kaydedilebilir:
              </div>

              {/* Formatted dispute text */}
              <div style={{ position: 'relative' }}>
                <pre
                  style={{
                    background: '#18181b',
                    color: '#f43f5e',
                    padding: '12px 14px',
                    borderRadius: 8,
                    fontSize: '.75rem',
                    fontFamily: 'monospace',
                    lineHeight: 1.45,
                    maxHeight: 200,
                    overflowY: 'auto',
                    margin: 0,
                    border: '1px solid #27272a',
                  }}
                >
                  {disputeSummaryText}
                </pre>
                <button
                  type="button"
                  onClick={handleCopyDisputeText}
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    padding: '4px 8px',
                    borderRadius: 4,
                    border: '1px solid #3f3f46',
                    background: '#27272a',
                    color: '#fff',
                    fontSize: '.7rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <i className="fa-solid fa-copy" style={{ marginRight: 4 }} />
                  Kopyala
                </button>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '.8rem', fontWeight: 700, color: 'var(--text-strong)', marginBottom: 6 }}>
                  GİB Red Gerekçesi Açıklaması:
                </label>
                <textarea
                  rows={3}
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  placeholder="Uyuşmazlık ve fark faturası gerekçesi..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--app-bg)',
                    color: 'var(--text-strong)',
                    fontSize: '.85rem',
                  }}
                />
              </div>
            </div>

            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', background: 'var(--surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                onClick={handleCopyDisputeText}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text-strong)',
                  fontWeight: 600,
                  fontSize: '.8rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <i className="fa-solid fa-copy" />
                Tutanağı Kopyala
              </button>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setDisputeModalOpen(false)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text-strong)',
                    fontWeight: 600,
                    fontSize: '.85rem',
                    cursor: 'pointer',
                  }}
                >
                  Vazgeç
                </button>

                <button
                  type="button"
                  disabled={rejectingDispute}
                  onClick={handleConfirmDisputeReject}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#ef4444',
                    color: '#fff',
                    fontWeight: 800,
                    fontSize: '.85rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <i className={`fa-solid ${rejectingDispute ? 'fa-spinner fa-spin' : 'fa-ban'}`} />
                  {rejectingDispute ? 'İletiliyor...' : 'Faturayı Reddet & İtirazı Gönder'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 6: E-Adisyon POS & Şirket Bilgilendirme Modalı */}
      {newAdisyonModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 1200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: 14,
              width: '100%',
              maxWidth: 560,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              overflow: 'hidden',
              border: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--surface-2)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ fontWeight: 800, color: '#10b981', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="fa-solid fa-circle-info" />
                E-Adisyon Entegrasyon Bilgilendirmesi
              </div>
              <button
                type="button"
                onClick={() => setNewAdisyonModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <div style={{ padding: '24px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div
                style={{
                  background: 'rgba(16,185,129,0.08)',
                  border: '1px solid rgba(16,185,129,0.25)',
                  borderRadius: 12,
                  padding: '18px 20px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 14,
                }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: '50%',
                    background: '#10b981',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.15rem',
                    flexShrink: 0,
                  }}
                >
                  <i className="fa-solid fa-receipt" />
                </div>
                <div style={{ fontSize: '.92rem', color: 'var(--text-strong)', lineHeight: 1.55, fontWeight: 600 }}>
                  e-adisyon POS tarafında geliştirilmeli ve e-dönüşüm entegratörü ile entegre olarak tamamlanmalıdır, şirket kuruluşunda e-adisyon kullanılacak seçimiyle aktif ve deaktif edilebilmelidir.
                </div>
              </div>
            </div>

            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', background: 'var(--surface-2)', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setNewAdisyonModalOpen(false)}
                style={{
                  padding: '8px 22px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#10b981',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '.85rem',
                  cursor: 'pointer',
                }}
              >
                Anladım / Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 7: E-Adisyon Faturaya Dönüştür & ETTN Bağla Modalı */}
      {convertModalOpen && convertingAdisyon && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            zIndex: 1200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: 14,
              width: '100%',
              maxWidth: 640,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              overflow: 'hidden',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 800, color: '#10b981', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="fa-solid fa-file-invoice-dollar" />
                E-Adisyon Faturaya Dönüştür & ETTN Bağla
              </div>
              <button
                type="button"
                onClick={() => setConvertModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <form onSubmit={handleConfirmConvertAndLink} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* ETTN Reference Alert */}
              <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: 12, borderRadius: 8, fontSize: '.8rem', color: '#065f46', lineHeight: 1.5 }}>
                <strong>VUK 509/526 ETTN Bağlantısı:</strong> Bu adisyona ait <code>{convertingAdisyon.ettn}</code> UUID numarası, oluşturulacak faturanın UBL-TR XML'ine <code style={{ fontWeight: 700 }}>&lt;cac:AdditionalDocumentReference&gt;</code> olarak enjekte edilecektir.
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '.8rem', fontWeight: 700, color: 'var(--text-strong)', marginBottom: 4 }}>Fatura Senaryosu / Türü:</label>
                  <select
                    value={convertInvoiceForm.profile_id}
                    onChange={(e) => setConvertInvoiceForm({ ...convertInvoiceForm, profile_id: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--app-bg)',
                      color: 'var(--text-strong)',
                      fontSize: '.85rem',
                      fontWeight: 700,
                    }}
                  >
                    <option value="EARSIVFATURA">e-Arşiv Fatura (B2C / Nihai Tüketici)</option>
                    <option value="TICARIFATURA">e-Fatura / Ticari (B2B Şirket)</option>
                    <option value="TEMELFATURA">e-Fatura / Temel</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '.8rem', fontWeight: 700, color: 'var(--text-strong)', marginBottom: 4 }}>Alıcı VKN / TCKN:</label>
                  <input
                    type="text"
                    value={convertInvoiceForm.receiver_vkn_tckn}
                    onChange={(e) => setConvertInvoiceForm({ ...convertInvoiceForm, receiver_vkn_tckn: e.target.value })}
                    required
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--app-bg)',
                      color: 'var(--text-strong)',
                      fontSize: '.85rem',
                      fontFamily: 'monospace',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '.8rem', fontWeight: 700, color: 'var(--text-strong)', marginBottom: 4 }}>Alıcı Ünvanı / Müşteri Adı:</label>
                <input
                  type="text"
                  value={convertInvoiceForm.receiver_title}
                  onChange={(e) => setConvertInvoiceForm({ ...convertInvoiceForm, receiver_title: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--app-bg)',
                    color: 'var(--text-strong)',
                    fontSize: '.85rem',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-2)', padding: '12px 16px', borderRadius: 8 }}>
                <div>
                  <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>Masa: {convertingAdisyon.table_name} (#{convertingAdisyon.adisyon_number})</div>
                  <div style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--text-strong)' }}>Fatura Tutarı:</div>
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#10b981' }}>
                  {Number(convertingAdisyon.payable_amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
                <button
                  type="button"
                  onClick={() => setConvertModalOpen(false)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text-strong)',
                    fontWeight: 600,
                    fontSize: '.85rem',
                    cursor: 'pointer',
                  }}
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={submittingConversion}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#10b981',
                    color: '#fff',
                    fontWeight: 800,
                    fontSize: '.85rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <i className={`fa-solid ${submittingConversion ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`} />
                  {submittingConversion ? 'İmzalanıyor & İletiliyor...' : 'Faturayı Kes & ETTN Bağla'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 8: E-Adisyon Detayı & UBL-TR AdditionalDocumentReference İnceleme Modalı */}
      {eadisyonDetailsModalOpen && selectedEAdisyon && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            zIndex: 1200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: 14,
              width: '100%',
              maxWidth: 720,
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 800, color: 'var(--text-strong)', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="fa-solid fa-receipt" style={{ color: '#10b981' }} />
                E-Adisyon Detayı: #{selectedEAdisyon.adisyon_number} ({selectedEAdisyon.table_name})
              </div>
              <button
                type="button"
                onClick={() => setEAdisyonDetailsModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Meta Info Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, background: 'var(--app-bg)', padding: 14, borderRadius: 10, border: '1px solid var(--border)', fontSize: '.8rem' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>ETTN (UUID):</span>
                  <strong style={{ fontFamily: 'monospace', color: 'var(--text-strong)', wordBreak: 'break-all' }}>{selectedEAdisyon.ettn}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>Garson & Kişi:</span>
                  <strong style={{ color: 'var(--text-strong)' }}>{selectedEAdisyon.waiter_name} ({selectedEAdisyon.guest_count} Kişi)</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block' }}>Açılış Zamanı:</span>
                  <strong style={{ color: 'var(--text-strong)' }}>
                    {selectedEAdisyon.opened_at ? new Date(selectedEAdisyon.opened_at).toLocaleString('tr-TR') : '-'}
                  </strong>
                </div>
              </div>

              {/* Kalemler Tablosu */}
              <div>
                <div style={{ fontSize: '.85rem', fontWeight: 800, color: 'var(--text-strong)', marginBottom: 6 }}>
                  Adisyon Kalemleri ({selectedEAdisyon.items?.length || 0})
                </div>
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.8rem', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '8px 12px' }}>#</th>
                        <th style={{ padding: '8px 12px' }}>Ürün Adı</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>Miktar</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>Birim Fiyat</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>KDV</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>Toplam</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedEAdisyon.items || []).map((it, idx) => (
                        <tr key={it.id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{idx + 1}</td>
                          <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-strong)' }}>{it.item_name}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>{it.quantity} {it.unit_code || 'Adet'}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>{Number(it.unit_price).toFixed(2)} ₺</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>%{it.tax_rate ?? 10}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#10b981' }}>
                            {Number(it.total_amount || 0).toFixed(2)} ₺
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* UBL-TR AdditionalDocumentReference XML Snippet */}
              <div>
                <div style={{ fontSize: '.85rem', fontWeight: 800, color: 'var(--text-strong)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="fa-solid fa-code" style={{ color: '#f5a623' }} />
                  GİB UBL-TR 2.1 E-Adisyon XML Bağlantısı (AdditionalDocumentReference)
                </div>
                <pre
                  style={{
                    background: '#18181b',
                    color: '#38bdf8',
                    padding: '12px 16px',
                    borderRadius: 8,
                    fontSize: '.75rem',
                    fontFamily: 'monospace',
                    lineHeight: 1.5,
                    margin: 0,
                    border: '1px solid #27272a',
                    overflowX: 'auto',
                  }}
                >
{`<cac:AdditionalDocumentReference>
  <cbc:ID>${selectedEAdisyon.ettn}</cbc:ID>
  <cbc:IssueDate>${selectedEAdisyon.opened_at ? selectedEAdisyon.opened_at.split('T')[0] : '2026-08-14'}</cbc:IssueDate>
  <cbc:DocumentTypeCode>E-ADISYON</cbc:DocumentTypeCode>
  <cbc:DocumentType>Elektronik Adisyon</cbc:DocumentType>
</cac:AdditionalDocumentReference>`}
                </pre>
              </div>

              {/* Linked Invoice Info */}
              {selectedEAdisyon.linked_invoice_number && (
                <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: 12, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 800, color: '#065f46', fontSize: '.85rem' }}>
                      <i className="fa-solid fa-link" style={{ marginRight: 6 }} />
                      Bağlı Fatura No: {selectedEAdisyon.linked_invoice_number}
                    </div>
                    <div style={{ fontSize: '.75rem', color: '#047857', marginTop: 2 }}>
                      Fatura ETTN: {selectedEAdisyon.linked_invoice_ettn}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'var(--surface-2)', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setEAdisyonDetailsModalOpen(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text-strong)',
                  fontWeight: 700,
                  fontSize: '.85rem',
                  cursor: 'pointer',
                }}
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 8: Sözleşme Şartları ve Fiyat Listesi Detay Modalı (ContractQuickViewModal) */}
      {contractModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 1200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: 14,
              width: '100%',
              maxWidth: 820,
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              overflow: 'hidden',
              border: '1px solid var(--border)',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--surface-2)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: 'rgba(45,212,191,0.15)',
                    color: '#2dd4bf',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.1rem',
                  }}
                >
                  <i className="fa-solid fa-file-contract" />
                </div>
                <div>
                  <div style={{ fontWeight: 800, color: 'var(--text-strong)', fontSize: '1.05rem' }}>
                    Sözleşme Detayları & Fiyat Listesi
                  </div>
                  <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>
                    Sözleşme No: <strong>#{viewingContract?.contract_no || 'Belirtilmemiş'}</strong>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setContractModalOpen(false)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: 20, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {loadingContract ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                  <i className="fa-solid fa-spinner fa-spin fa-2x" style={{ color: '#f5a623', marginBottom: 8 }} />
                  <div>Sözleşme verileri yükleniyor...</div>
                </div>
              ) : viewingContract ? (
                <>
                  {/* Contract Summary Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                    <div style={{ background: 'var(--app-bg)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>Geçerlilik Tarihleri</div>
                      <div style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--text-strong)', marginTop: 2 }}>
                        {viewingContract.start_date || '—'} ➔ {viewingContract.end_date || '—'}
                      </div>
                      <div style={{ fontSize: '.7rem', color: '#10b981', marginTop: 2 }}>
                        +{viewingContract.end_grace_days ?? 15} Gün Ek Opsiyon
                      </div>
                    </div>

                    <div style={{ background: 'var(--app-bg)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>Fiyat Toleransı</div>
                      <div style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--text-strong)', marginTop: 2 }}>
                        %{Number(viewingContract.price_tolerance != null ? (viewingContract.price_tolerance > 1 ? viewingContract.price_tolerance : viewingContract.price_tolerance * 100) : 5)} Tolerans
                      </div>
                      <div style={{ fontSize: '.7rem', color: viewingContract.block_on_exceed !== false ? '#ef4444' : '#f59e0b', marginTop: 2 }}>
                        {viewingContract.block_on_exceed !== false ? 'Aşımda Satınalma Kilitlenir' : 'Yalnızca Uyar'}
                      </div>
                    </div>

                    <div style={{ background: 'var(--app-bg)', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>Şube Kapsamı</div>
                      <div style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--text-strong)', marginTop: 2 }}>
                        {Array.isArray(viewingContract.branches) && viewingContract.branches.length > 0
                          ? `${viewingContract.branches.length} Şube/Şablon`
                          : 'Tüm Şubeler Geçerli'}
                      </div>
                      <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        Yetkili Lokasyonlar
                      </div>
                    </div>
                  </div>

                  {/* Contract Items Price List Table */}
                  <div>
                    <div style={{ fontSize: '.85rem', fontWeight: 800, color: 'var(--text-strong)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <i className="fa-solid fa-list-ul" style={{ color: '#f5a623' }} />
                      Sözleşmeli Stok Malları & Birim Fiyat Tablosu
                    </div>

                    <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
                        <thead>
                          <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                            <th style={{ padding: '8px 12px', textAlign: 'left' }}>Stok Malı</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left', width: 100 }}>SKU</th>
                            <th style={{ padding: '8px 12px', textAlign: 'center', width: 80 }}>Birim</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right', width: 120 }}>Sözleşme Fiyatı</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right', width: 100 }}>Kota (Miktar)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.isArray(viewingContract.rows) && viewingContract.rows.length > 0 ? (
                            viewingContract.rows.map((row, idx) => (
                              <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-strong)' }}>
                                  {row.name}
                                </td>
                                <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                  {row.sku || '—'}
                                </td>
                                <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                  {row.unit || '—'}
                                </td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: '#10b981' }}>
                                  {Number(row.price || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                                </td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-muted)' }}>
                                  {Number(row.qty || 0).toLocaleString('tr-TR')}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={5} style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
                                Bu sözleşmede kayıtlı kalem bulunamadı.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>
                  Sözleşme bilgisi bulunamadı.
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '12px 20px',
                borderTop: '1px solid var(--border)',
                background: 'var(--surface-2)',
                display: 'flex',
                justifyContent: 'flex-end',
              }}
            >
              <button
                type="button"
                onClick={() => setContractModalOpen(false)}
                style={{
                  padding: '8px 18px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text-strong)',
                  fontWeight: 700,
                  fontSize: '.85rem',
                  cursor: 'pointer',
                }}
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 9: Manuel Stok Kartı Eşleme & Tedarikçi Hafızası Modalı (ItemMappingModal) */}
      {mappingModalOpen && mappingTargetLine && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 1300,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: 14,
              width: '100%',
              maxWidth: 680,
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              overflow: 'hidden',
              border: '1px solid var(--border)',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--surface-2)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: 'rgba(147,51,234,0.15)',
                    color: '#9333ea',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.1rem',
                  }}
                >
                  <i className="fa-solid fa-brain" />
                </div>
                <div>
                  <div style={{ fontWeight: 800, color: 'var(--text-strong)', fontSize: '1.05rem' }}>
                    Tedarikçi Kalem Eşleme & RMS Stok Kartı Bağlama
                  </div>
                  <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>
                    Tedarikçi: <strong>{matchingInvoice?.sender_title}</strong>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setMappingModalOpen(false)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: 20, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Target Invoice Line Summary */}
              <div
                style={{
                  background: 'var(--app-bg)',
                  padding: '12px 16px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                    Faturadaki Tedarikçi Kalem İsmi
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-strong)', marginTop: 2 }}>
                    {mappingTargetLine.invoiceLine.item_name}
                  </div>
                  {mappingTargetLine.invoiceLine.item_code && (
                    <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      Tedarikçi Kodu: {mappingTargetLine.invoiceLine.item_code}
                    </div>
                  )}
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>Fatura Miktarı & Fiyatı</div>
                  <div style={{ fontSize: '.9rem', fontWeight: 800, color: '#f5a623', marginTop: 2 }}>
                    {Number(mappingTargetLine.invQty).toLocaleString('tr-TR')} {mappingTargetLine.invoiceLine.unit_code || 'Birim'} x {Number(mappingTargetLine.invUnitPrice).toFixed(2)} ₺
                  </div>
                </div>
              </div>

              {/* RMS Stock Items Search & Select */}
              <div>
                <label style={{ display: 'block', fontSize: '.82rem', fontWeight: 700, color: 'var(--text-strong)', marginBottom: 6 }}>
                  Eşleştirilecek RMS Standart Stok Kartını Seçin
                </label>
                <div style={{ position: 'relative', marginBottom: 10 }}>
                  <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    value={stockSearchQuery}
                    onChange={(e) => setStockSearchQuery(e.target.value)}
                    placeholder="Stok kartı adı veya SKU ile ara (Örn: Cheddar, STK-01)..."
                    style={{
                      width: '100%',
                      padding: '9px 12px 9px 36px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--surface-2)',
                      color: 'var(--text-strong)',
                      fontSize: '.85rem',
                      outline: 'none',
                    }}
                  />
                </div>

                {/* Stock Items List */}
                <div
                  style={{
                    maxHeight: 220,
                    overflowY: 'auto',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: 'var(--app-bg)',
                  }}
                >
                  {stockItemsList
                    .filter((s) => {
                      if (!stockSearchQuery) return true
                      const q = stockSearchQuery.toLowerCase()
                      return (
                        (s.name && s.name.toLowerCase().includes(q)) ||
                        (s.sku && s.sku.toLowerCase().includes(q))
                      )
                    })
                    .map((item) => {
                      const isSelected = selectedStockForMapping?.id === item.id
                      return (
                        <div
                          key={item.id}
                          onClick={() => setSelectedStockForMapping(item)}
                          style={{
                            padding: '10px 14px',
                            borderBottom: '1px solid var(--border)',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: isSelected ? 'rgba(16,185,129,0.12)' : 'transparent',
                            borderLeft: isSelected ? '4px solid #10b981' : '4px solid transparent',
                            transition: 'background 0.15s',
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 700, color: isSelected ? '#10b981' : 'var(--text-strong)', fontSize: '.86rem' }}>
                              {item.name}
                            </div>
                            <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', display: 'flex', gap: 8, marginTop: 2 }}>
                              <span>SKU: {item.sku || '—'}</span>
                              <span>Birim: {item.unit || 'Adet'}</span>
                            </div>
                          </div>

                          {isSelected && (
                            <i className="fa-solid fa-circle-check" style={{ color: '#10b981', fontSize: '1.1rem' }} />
                          )}
                        </div>
                      )
                    })}
                </div>
              </div>

              {/* Save To Memory Checkbox */}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 14px',
                  background: 'rgba(147,51,234,0.06)',
                  border: '1px solid rgba(147,51,234,0.25)',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={saveToMemoryChecked}
                  onChange={(e) => setSaveToMemoryChecked(e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: '#9333ea', cursor: 'pointer' }}
                />
                <div style={{ fontSize: '.82rem', color: 'var(--text-strong)', fontWeight: 600 }}>
                  Bu tedarikçi (<strong>{matchingInvoice?.sender_title}</strong>) için <strong>"{mappingTargetLine.invoiceLine.item_name}"</strong> tanımını kalıcı hafızaya kaydet ve gelecek tüm faturalarda otomatik eşleştir.
                </div>
              </label>
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '12px 20px',
                borderTop: '1px solid var(--border)',
                background: 'var(--surface-2)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <button
                type="button"
                onClick={() => setMappingModalOpen(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text-strong)',
                  fontWeight: 600,
                  fontSize: '.85rem',
                  cursor: 'pointer',
                }}
              >
                İptal
              </button>

              <button
                type="button"
                disabled={!selectedStockForMapping || savingMapping}
                onClick={handleSaveItemMapping}
                style={{
                  padding: '8px 20px',
                  borderRadius: 8,
                  border: 'none',
                  background: selectedStockForMapping ? 'linear-gradient(135deg, #9333ea, #7e22ce)' : 'var(--border)',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '.85rem',
                  cursor: selectedStockForMapping && !savingMapping ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: selectedStockForMapping ? '0 2px 8px rgba(147,51,234,0.35)' : 'none',
                }}
              >
                <i className={`fa-solid ${savingMapping ? 'fa-spinner fa-spin' : 'fa-check-double'}`} />
                {savingMapping ? 'Kaydediliyor...' : 'Eşleştirmeyi Kaydet & Uygula'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
