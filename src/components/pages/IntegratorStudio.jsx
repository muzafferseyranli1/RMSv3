import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useToast } from '@/hooks/useToast'
import { db } from '@/lib/db'
import { eInvoiceService } from '@/lib/eInvoice/eInvoiceService'
import { matchingEngine } from '@/lib/eInvoice/matchingEngine'
import { interCompanyTransferService } from '@/lib/eInvoice/interCompanyTransferService'
import { findActiveContractForSupplier, validateInvoiceAgainstContract } from '@/lib/eInvoice/contractPriceValidator'
import {
  generateETTN,
  generateInvoiceNumber,
  generateDespatchNumber,
  generateUBLXML,
  generateDespatchUBLXML,
  calculateInvoiceTotals,
} from '@/lib/eInvoice/coreUblGenerator'
import {
  EINVOICE_STATUS,
  EINVOICE_STATUS_META,
  getStatusMeta,
  getProfileMeta,
  getTypeMeta,
  UNIT_CODES,
  TAX_RATES,
} from '@/lib/eInvoice/types'

// Realistic item name distortion helper for supplier alias and phonetic testing
export function distortItemName(originalName) {
  if (!originalName || typeof originalName !== 'string') return originalName

  const trimmed = originalName.trim()
  const lower = trimmed.toLowerCase()

  const DICT = {
    'cheddar peyniri': 'çedar peynr',
    'cheddar peynir': 'çedar peynr',
    'cheddar': 'çedar pynr',
    'hamburger köftesi': 'Hamb. Koftesi (120gr)',
    'hamburger kofte': 'hmbrgr kftsi',
    'tavuk köftesi': 'Tvk Koftesi (Dond)',
    'tavuk kofte': 'tvk kfte',
    'patates (dondurulmuş)': 'Donuk Patats 9x9',
    'patates dondurulmuş': 'Donuk Patats 9x9',
    'patates': 'ptates donuk',
    'dana kıyma': 'Dana Kıyma %20 Yağlı (dn-kym)',
    'dana bonfile (taze vakumlu 1kg)': 'Taze Dna Bnfile 1kg',
    'dana bonfile': 'Dna Bonfile Vakum',
    'süt %3.1 yağlı': 'UHT Sut 1Lt (%3.1)',
    'süt': 'UHT Sut 1Lt',
    'mozzarella': 'mozarella blok peynr',
    'mozzarella peyniri': 'mozarella blok',
    'sızma zeytinyağı 5 lt teneke': 'Szma Zytnyagi 5L Tenk',
    'sızma zeytinyağı': 'Szma Zytnyagi 5L',
    'ayçiçek yağı 18 lt': 'Aycick Yagi 18L Teneke',
    'ayçiçek yağı': 'Aycicek Yag 18L',
    'domates salçası 28-30 brix': 'Dmt Slcsi 4.5kg Teneke',
    'domates salçası': 'Dmt Salcasi Tenk',
    'un (tip 550)': 'Bugday Unu Tip-550 (50kg)',
    'un': 'Bugday Unu (50kg)',
    'şeker (toz)': 'Kristal Toz Seker (50kg)',
    'tuz (iyotlu)': 'Sanayi Tuzu Iyotlu (25kg)',
  }

  if (DICT[lower]) return DICT[lower]

  for (const [key, val] of Object.entries(DICT)) {
    if (lower.includes(key)) {
      return trimmed.replace(new RegExp(key, 'i'), val)
    }
  }

  let transformed = trimmed
    .replace(/Peyniri/gi, 'Pynr')
    .replace(/Peynir/gi, 'Pynr')
    .replace(/Köftesi/gi, 'Kftesi')
    .replace(/Köfte/gi, 'Kfte')
    .replace(/Patates/gi, 'Ptats')
    .replace(/Dondurulmuş/gi, 'Dond')
    .replace(/Zeytinyağı/gi, 'Zytnyagi')
    .replace(/Salçası/gi, 'Slcsi')
    .replace(/Salça/gi, 'Slca')
    .replace(/Kıyma/gi, 'Kyma')
    .replace(/Bonfile/gi, 'Bnfile')

  if (transformed === trimmed) {
    transformed = trimmed
      .toLowerCase()
      .replace(/ı/g, 'i')
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ş/g, 's')
      .replace(/ö/g, 'o')
      .replace(/ç/g, 'c')
  }

  return transformed || originalName
}

export default function IntegratorStudio() {
  const toast = useToast()
  const navigate = useNavigate()

  // -------------------------------------------------------------
  // 2 MAIN SECTIONS: 'PORTAL' (Gerçek Entegratör Portalı) vs 'SIMULATOR' (Simülatör)
  // -------------------------------------------------------------
  const [mainSection, setMainSection] = useState('PORTAL') // 'PORTAL', 'SIMULATOR'

  // Section 1: Integrator Portal Sub-Tabs
  const [portalTab, setPortalTab] = useState('portal-inbox') // 'portal-inbox', 'portal-outbox', 'portal-status-sim', 'portal-config'
  const [portalDirectionFilter, setPortalDirectionFilter] = useState('INBOUND')
  const [portalSearchQuery, setPortalSearchQuery] = useState('')
  const [portalInvoices, setPortalInvoices] = useState([])

  // Section 2: Simulator Sub-Tabs
  const [simTab, setSimTab] = useState('shipment-generator') // 'shipment-generator', 'freeform-builder', 'transfer-hub'
  const [simulateDifferentNames, setSimulateDifferentNames] = useState(false)

  // Loading States
  const [loading, setLoading] = useState(false)
  const [actionLoadingId, setActionLoadingId] = useState(null)
  const [syncingToRms, setSyncingToRms] = useState(false)

  // Integrator Configuration State
  const [integratorConfig, setIntegratorConfig] = useState({
    provider: 'sandbox',
    sender_vkn_tckn: '1234567890',
    sender_title: 'SuitableRMS Restoran Grubu A.Ş.',
    username: '',
    password: '',
    api_key: '',
    is_test_mode: true,
  })
  const [testingConnection, setTestingConnection] = useState(false)

  // Purchase Receipts Data (for Simulator)
  const [receipts, setReceipts] = useState([])
  const [receiptLinesMap, setReceiptLinesMap] = useState({})
  const [receiptContractsMap, setReceiptContractsMap] = useState({})
  const [receiptSearchQuery, setReceiptSearchQuery] = useState('')
  const [selectedBranchFilter, setSelectedBranchFilter] = useState('ALL')
  const [branches, setBranches] = useState([])

  // Freeform Builder State (for Simulator)
  const [builderDocType, setBuilderDocType] = useState('INVOICE')
  const [builderProfileId, setBuilderProfileId] = useState('TICARIFATURA')
  const [builderInvoiceType, setBuilderInvoiceType] = useState('SATIS')
  const [builderDirection, setBuilderDirection] = useState('INBOUND')
  const [suppliers, setSuppliers] = useState([])
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [builderSupplierInfo, setBuilderSupplierInfo] = useState({
    title: 'Örnek Gıda ve Tedarik A.Ş.',
    vkn: '3248921839',
    taxOffice: 'Beşiktaş',
    address: 'Büyükdere Cad. No:140 Levent / İstanbul',
  })
  const [builderReceiverInfo, setBuilderReceiverInfo] = useState({
    title: 'SuitableRMS Restoran Grubu A.Ş.',
    vkn: '1234567890',
    taxOffice: 'Beşiktaş',
    address: 'Nispetiye Cad. No:12 Beşiktaş / İstanbul',
  })
  const [builderLines, setBuilderLines] = useState([
    {
      id: 'line-1',
      item_name: 'Dana Bonfile (Taze Vakumlu 1kg)',
      item_code: 'ET-BON-01',
      invoiced_quantity: 20,
      unit_code: 'KGM',
      unit_price: 650.0,
      tax_rate: 1,
    },
    {
      id: 'line-2',
      item_name: 'Sızma Zeytinyağı 5 Lt Teneke',
      item_code: 'YAG-ZYT-05',
      invoiced_quantity: 6,
      unit_code: 'LTR',
      unit_price: 380.0,
      tax_rate: 1,
    },
  ])
  const [builderNotes, setBuilderNotes] = useState('Özel Entegratör Portalı Test Faturası')

  // GİB Status Controller & Simulation
  const [selectedInvoiceForStatus, setSelectedInvoiceForStatus] = useState(null)
  const [targetStatusCode, setTargetStatusCode] = useState(1300)
  const [simReasonNote, setSimReasonNote] = useState('')
  const [updatingStatus, setUpdatingStatus] = useState(false)

  // Document Preview Modal
  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  const [previewDoc, setPreviewDoc] = useState(null)

  // 1. Initial Data Fetching
  const loadInitialData = useCallback(async () => {
    setLoading(true)
    try {
      // 1. Integrator Config
      const conf = await eInvoiceService.getIntegratorConfig()
      if (conf) setIntegratorConfig(conf)

      // 2. All Invoices in Integrator Portal
      const portalRes = await eInvoiceService.getIntegratorPortalInvoices({ direction: 'ALL', limit: 200 })
      if (portalRes.success) {
        setPortalInvoices(portalRes.data || [])
      }

      // 3. Purchase Receipts
      const { data: rcptData } = await db
        .from('purchase_receipts')
        .select('*')
        .is('deleted_at', null)
        .order('delivered_on', { ascending: false })
        .limit(100)

      setReceipts(rcptData || [])

      // 4. Receipt Lines
      if (rcptData && rcptData.length > 0) {
        const rcptIds = rcptData.map((r) => r.id)
        const { data: linesData } = await db
          .from('purchase_receipt_lines')
          .select('*')
          .in('receipt_id', rcptIds)

        const linesMap = {}
        ;(linesData || []).forEach((line) => {
          if (!linesMap[line.receipt_id]) linesMap[line.receipt_id] = []
          linesMap[line.receipt_id].push(line)
        })
        setReceiptLinesMap(linesMap)
      }

      // 5. Suppliers
      const { data: suppData } = await db
        .from('suppliers')
        .select('*')
        .is('deleted_at', null)
        .order('name', { ascending: true })

      setSuppliers(suppData || [])

      // 6. Contracts Map for Suppliers
      const { data: contractsData } = await db
        .from('contracts')
        .select('*')
        .eq('status', 'active')
        .is('deleted_at', null)

      const cMap = {}
      ;(contractsData || []).forEach((c) => {
        if (c.supplier_id) cMap[c.supplier_id] = c
      })
      setReceiptContractsMap(cMap)

      // 7. Branches / Nodes
      const { data: nodeData } = await db
        .from('company_nodes')
        .select('id, name, kind')
        .is('deleted_at', null)
        .order('name', { ascending: true })

      setBranches(nodeData || [])
    } catch (err) {
      console.error('IntegratorStudio loadInitialData error:', err)
      toast('Entegratör verileri yüklenirken hata: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadInitialData()
  }, [loadInitialData])

  // Change Active Integrator Provider (Sandbox / Uyumsoft / EDM)
  const handleChangeProvider = async (newProvider) => {
    try {
      const updated = { ...integratorConfig, provider: newProvider }
      setIntegratorConfig(updated)
      await eInvoiceService.saveIntegratorConfig(updated)
      toast(`✅ Aktif entegratör "${newProvider.toUpperCase()}" olarak ayarlandı.`, 'success')
      loadInitialData()
    } catch (err) {
      toast('Entegratör değiştirilemedi: ' + err.message, 'error')
    }
  }

  // Test Integrator Connection
  const handleTestConnection = async () => {
    setTestingConnection(true)
    try {
      const res = await eInvoiceService.testConnection(integratorConfig)
      if (res.success) {
        toast(`✅ ${res.message}`, 'success')
      } else {
        toast(`❌ Bağlantı hatası: ${res.error}`, 'error')
      }
    } catch (err) {
      toast(`Bağlantı testi başarısız: ${err.message}`, 'error')
    } finally {
      setTestingConnection(false)
    }
  }

  // Sync Invoices from Integrator to RMS
  const handleSyncToRms = async () => {
    setSyncingToRms(true)
    try {
      const res = await eInvoiceService.syncInvoicesFromIntegratorToRms()
      if (res.success) {
        toast(`🔄 ${res.message}`, 'success')
        loadInitialData()
      } else {
        toast(`Senkronizasyon hatası: ${res.error}`, 'error')
      }
    } catch (err) {
      toast(`Senkronizasyon başarısız: ${err.message}`, 'error')
    } finally {
      setSyncingToRms(false)
    }
  }

  // -------------------------------------------------------------
  // ACTION: Generate Invoices From Shipment / Purchase Receipt
  // Scenario Types: 'EXACT', 'SHORTAGE', 'SURPLUS', 'PRICE_OVER', 'TAX_MISMATCH'
  // NOTE: Invoices are written to INTEGRATOR INBOUND POOL (not directly to RMS!)
  // -------------------------------------------------------------
  const handleGenerateInvoiceFromReceipt = async (receipt, scenarioType) => {
    setActionLoadingId(`${receipt.id}-${scenarioType}`)
    try {
      const lines = receiptLinesMap[receipt.id] || []
      if (lines.length === 0) {
        throw new Error('Bu mal kabul irsaliyesinde kayıtlı kalem bulunamadı.')
      }

      const activeContract = receiptContractsMap[receipt.supplier_id] || null
      const invoiceEttn = generateETTN()
      const invoiceNumber = generateInvoiceNumber('ENT', new Date().getFullYear(), Math.floor(100000 + Math.random() * 899999))
      const issueDate = receipt.delivered_on || new Date().toISOString().split('T')[0]
      const issueTime = new Date().toTimeString().split(' ')[0]

      // Determine sender / receiver info
      const supplier = suppliers.find((s) => s.id === receipt.supplier_id)
      const senderVkn = supplier?.vergi_no || supplier?.tc_no || '3248921839'
      const senderTitle = receipt.supplier_name || supplier?.name || 'Tedarikçi A.Ş.'
      const senderTaxOffice = supplier?.vergi_dairesi || 'Merkez'
      const senderAddress = supplier?.adres || 'Tedarikçi Sevkiyat Merkezi'

      // Transform receipt lines according to selected scenario
      const invoiceLines = lines.map((rcptLine, idx) => {
        let qty = Number(rcptLine.received_qty || 1)
        let unitPrice = Number(rcptLine.unit_price || 100)
        let taxRate = Number(rcptLine.vat_rate != null ? (rcptLine.vat_rate <= 1 ? rcptLine.vat_rate * 100 : rcptLine.vat_rate) : 20)

        // Check if contract defines price for this item
        if (activeContract?.rows) {
          const cRow = activeContract.rows.find(
            (r) =>
              (rcptLine.stock_item_id && r.stock_item_id === rcptLine.stock_item_id) ||
              (rcptLine.item_sku && r.sku === rcptLine.item_sku)
          )
          if (cRow && Number(cRow.price) > 0) {
            unitPrice = Number(cRow.price)
          }
        }

        // Apply Scenario Modifications
        if (scenarioType === 'SHORTAGE') {
          qty = Math.round(qty * 1.333 * 100) / 100
        } else if (scenarioType === 'SURPLUS') {
          qty = Math.max(1, Math.round(qty * 0.7 * 100) / 100)
        } else if (scenarioType === 'PRICE_OVER') {
          unitPrice = Math.round(unitPrice * 1.25 * 100) / 100
        } else if (scenarioType === 'TAX_MISMATCH' && idx === 0) {
          taxRate = taxRate === 20 ? 10 : 20
        }

        const lineSubtotal = Math.round(qty * unitPrice * 100) / 100
        const lineTaxAmount = Math.round(((lineSubtotal * taxRate) / 100) * 100) / 100

        const originalName = rcptLine.item_name || 'Teslim Alınan Ürün'
        const finalItemName = simulateDifferentNames ? distortItemName(originalName) : originalName

        return {
          line_number: idx + 1,
          item_name: finalItemName,
          item_code: rcptLine.item_sku || rcptLine.stock_item_id?.slice(0, 8) || '',
          item_description: `Mal Kabul İrsaliye Kalemi (#${rcptLine.receipt_no || receipt.doc_no || ''})`,
          invoiced_quantity: qty,
          unit_code: rcptLine.unit || 'C62',
          unit_price: unitPrice,
          subtotal: lineSubtotal,
          tax_rate: taxRate,
          tax_amount: lineTaxAmount,
          total_line_amount: lineSubtotal + lineTaxAmount,
          matched_stock_item_id: rcptLine.stock_item_id || null,
          matched_stock_item_name: rcptLine.item_name || null,
        }
      })

      // If TAX_MISMATCH or Extra Line scenario, add a ghost item
      if (scenarioType === 'TAX_MISMATCH') {
        invoiceLines.push({
          line_number: invoiceLines.length + 1,
          item_name: 'Ekstra Sevkiyat & Taşıma Hizmet Bedeli (Uyuşmazlık Kalemi)',
          item_code: 'HZ-NAK-01',
          item_description: 'Mal kabulde teslim alınmayan fazladan faturalandırılmış hizmet kalemi',
          invoiced_quantity: 1,
          unit_code: 'C62',
          unit_price: 350.0,
          subtotal: 350.0,
          tax_rate: 20,
          tax_amount: 70.0,
          total_line_amount: 420.0,
          matched_stock_item_id: null,
          matched_stock_item_name: null,
        })
      }

      const totals = calculateInvoiceTotals(invoiceLines, 0, 0)
      const docReference = receipt.receipt_no || receipt.doc_no || `IRS-${receipt.id.slice(0, 8)}`

      let scenarioNote = ''
      if (scenarioType === 'EXACT') scenarioNote = 'Tam Uyumlu Mal Kabul Faturası (100% 3-Way Eşleşme).'
      if (scenarioType === 'SHORTAGE') scenarioNote = 'Eksik Teslimat Senaryosu Faturası (Faturada Fazla Miktar Kesildi).'
      if (scenarioType === 'SURPLUS') scenarioNote = 'Fazla Teslimat Senaryosu Faturası (Faturada Eksik Miktar Kesildi).'
      if (scenarioType === 'PRICE_OVER') scenarioNote = `Sözleşme Fiyat Farkı / Zam Senaryosu Faturası (${activeContract ? `Sözleşme: #${activeContract.contract_no}` : 'Sözleşmesiz'}).`
      if (scenarioType === 'TAX_MISMATCH') scenarioNote = 'KDV ve Kalem Uyuşmazlığı Senaryosu Faturası.'

      if (simulateDifferentNames) {
        scenarioNote += ' [Farklı / Kısaltılmış Tedarikçi İsimleri Simüle Edildi]'
      }

      const invoicePayload = {
        id: invoiceEttn,
        direction: 'INBOUND',
        ettn: invoiceEttn,
        invoice_number: invoiceNumber,
        invoice_type: 'SATIS',
        profile_id: 'TICARIFATURA',
        issue_date: issueDate,
        issue_time: issueTime,
        status_code: EINVOICE_STATUS.DELIVERED_TO_RECEIVER, // 1200
        status_description: 'Alıcıya Ulaştı (Entegratör Havuzunda)',
        currency_code: 'TRY',
        currency_rate: 1.0,
        sender_vkn_tckn: senderVkn,
        sender_title: senderTitle,
        sender_tax_office: senderTaxOffice,
        sender_address: senderAddress,
        sender_alias: 'urn:mail:defaultgb@gib.gov.tr',
        receiver_vkn_tckn: '1234567890',
        receiver_title: 'SuitableRMS Restoran Grubu A.Ş.',
        receiver_tax_office: 'Beşiktaş',
        receiver_address: 'Nispetiye Cad. No:12 Beşiktaş / İstanbul',
        receiver_alias: 'urn:mail:defaultpk@gib.gov.tr',
        line_extension_amount: totals.lineExtensionAmount,
        tax_exclusive_amount: totals.taxExclusiveAmount,
        tax_inclusive_amount: totals.taxInclusiveAmount,
        tax_total_amount: totals.taxTotalAmount,
        payable_amount: totals.payableAmount,
        notes: `${scenarioNote} İrsaliye No: ${docReference}. Özel Entegratör Portalı Simülasyonu.`.trim(),
        despatch_document_reference: docReference,
        source_transfer_doc_no: docReference,
        receipt_id: receipt.id,
        purchase_order_id: receipt.order_id || null,
        is_matched: false,
        is_synced_to_rms: false, // Entegratör havuzunda bekliyor!
        integrator_provider: integratorConfig.provider || 'sandbox',
        raw_json: {
          scenarioType,
          receiptId: receipt.id,
          supplierId: receipt.supplier_id,
          contractId: activeContract?.id || null,
          hasPriceViolation: scenarioType === 'PRICE_OVER',
          simulatedAlias: simulateDifferentNames,
        },
      }

      invoicePayload.ubl_xml = generateUBLXML({ ...invoicePayload, lines: invoiceLines })

      // PUSH TO INTEGRATOR INBOUND
      const pushRes = await eInvoiceService.pushInvoiceToIntegratorInbound(invoicePayload, invoiceLines)
      if (!pushRes.success) throw new Error(pushRes.error)

      toast(`✅ "${invoiceNumber}" faturası Özel Entegratör Gelen Kutusuna başarıyla üretildi!`, 'success')
      loadInitialData()
    } catch (err) {
      console.error('handleGenerateInvoiceFromReceipt error:', err)
      toast(`Fatura üretilemedi: ${err.message}`, 'error')
    } finally {
      setActionLoadingId(null)
    }
  }

  // -------------------------------------------------------------
  // ACTION: Generate Freeform Invoices
  // -------------------------------------------------------------
  const handleGenerateFreeform = async () => {
    if (builderLines.length === 0) {
      toast('Lütfen en az bir fatura kalemi ekleyin.', 'error')
      return
    }
    setLoading(true)
    try {
      const docEttn = generateETTN()
      const isDespatch = builderDocType === 'DESPATCH'
      const docNumber = isDespatch
        ? generateDespatchNumber('IRS', new Date().getFullYear(), Math.floor(100000 + Math.random() * 899999))
        : generateInvoiceNumber('FRM', new Date().getFullYear(), Math.floor(100000 + Math.random() * 899999))

      const issueDate = new Date().toISOString().split('T')[0]
      const issueTime = new Date().toTimeString().split(' ')[0]

      const formattedLines = builderLines.map((l, idx) => {
        const qty = Number(l.invoiced_quantity || 1)
        const unitPrice = Number(l.unit_price || 0)
        const subtotal = Math.round(qty * unitPrice * 100) / 100
        const taxRate = Number(l.tax_rate ?? 20)
        const taxAmount = Math.round(((subtotal * taxRate) / 100) * 100) / 100
        const finalName = simulateDifferentNames ? distortItemName(l.item_name) : l.item_name

        return {
          line_number: idx + 1,
          item_name: finalName,
          item_code: l.item_code || null,
          item_description: l.item_description || finalName,
          invoiced_quantity: qty,
          unit_code: l.unit_code || 'C62',
          unit_price: unitPrice,
          subtotal,
          tax_rate: taxRate,
          tax_amount: taxAmount,
          total_line_amount: subtotal + taxAmount,
        }
      })

      const totals = calculateInvoiceTotals(formattedLines, 0, 0)

      const docPayload = {
        direction: builderDirection,
        ettn: docEttn,
        invoice_number: docNumber,
        invoice_type: isDespatch ? 'SEVK_IRSALIYESI' : builderInvoiceType,
        profile_id: isDespatch ? 'TEMELIRSALIYE' : builderProfileId,
        issue_date: issueDate,
        issue_time: issueTime,
        status_code: builderDirection === 'INBOUND' ? 1200 : 1100,
        status_description:
          builderDirection === 'INBOUND'
            ? 'Alıcıya Ulaştı (Entegratör Serbest Havuz)'
            : 'Entegratöre Gönderildi (GİB Kuyruğunda)',
        currency_code: 'TRY',
        currency_rate: 1.0,
        id: docEttn,
        sender_vkn_tckn: builderSupplierInfo.vkn,
        sender_title: builderSupplierInfo.title,
        sender_tax_office: builderSupplierInfo.taxOffice,
        sender_address: builderSupplierInfo.address,
        receiver_vkn_tckn: builderReceiverInfo.vkn,
        receiver_title: builderReceiverInfo.title,
        receiver_tax_office: builderReceiverInfo.taxOffice,
        receiver_address: builderReceiverInfo.address,
        line_extension_amount: totals.lineExtensionAmount,
        tax_exclusive_amount: totals.taxExclusiveAmount,
        tax_inclusive_amount: totals.taxInclusiveAmount,
        tax_total_amount: totals.taxTotalAmount,
        payable_amount: totals.payableAmount,
        notes: builderNotes,
        is_matched: false,
        is_synced_to_rms: false,
        integrator_provider: integratorConfig.provider || 'sandbox',
        raw_json: {
          freeformBuilder: true,
          docType: builderDocType,
          simulatedAlias: simulateDifferentNames,
        },
      }

      docPayload.ubl_xml = isDespatch
        ? generateDespatchUBLXML({ ...docPayload, lines: formattedLines })
        : generateUBLXML({ ...docPayload, lines: formattedLines })

      const pushRes = await eInvoiceService.pushInvoiceToIntegratorInbound(docPayload, formattedLines)
      if (!pushRes.success) throw new Error(pushRes.error)

      toast(`✅ "${docNumber}" numaralı belge Entegratör Havuzuna başarıyla yazıldı!`, 'success')
      loadInitialData()
    } catch (err) {
      console.error('Freeform build error:', err)
      toast(`Belge üretilemedi: ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  // -------------------------------------------------------------
  // ACTION: Update GİB Status Simulation
  // -------------------------------------------------------------
  const handleUpdateStatus = async () => {
    if (!selectedInvoiceForStatus) {
      toast('Lütfen durumu değiştirilecek bir belge seçin.', 'error')
      return
    }
    setUpdatingStatus(true)
    try {
      const meta = getStatusMeta(targetStatusCode)
      const nowIso = new Date().toISOString()

      const updateData = {
        status_code: targetStatusCode,
        status_description: meta.label,
        updated_at: nowIso,
      }

      if (targetStatusCode === 1300) {
        updateData.response_code = 'KABUL'
        updateData.response_date = nowIso
      } else if (targetStatusCode === 1220) {
        updateData.response_code = 'RED'
        updateData.response_date = nowIso
        updateData.response_reason = simReasonNote || 'Ticari Red Yanıtı Simüle Edildi'
      }

      const { error } = await db.from('e_invoices').update(updateData).eq('id', selectedInvoiceForStatus.id)
      if (error) throw error

      await db.from('e_invoice_matching_logs').insert({
        invoice_id: selectedInvoiceForStatus.id,
        matching_type: 'GIB_STATUS_SIMULATION',
        notes: `Entegratör Konsolundan GİB durum kodu ${targetStatusCode} (${meta.label}) olarak güncellendi.`,
        performed_by: 'INTEGRATOR_STUDIO_ADMIN',
      })

      toast(`✅ Belge durumu "${meta.label}" (${targetStatusCode}) olarak güncellendi.`, 'success')
      loadInitialData()
    } catch (err) {
      toast(`Durum güncellenemedi: ${err.message}`, 'error')
    } finally {
      setUpdatingStatus(false)
    }
  }

  // Filtered Portal Invoices
  const filteredPortalInvoices = useMemo(() => {
    return portalInvoices.filter((inv) => {
      if (portalDirectionFilter !== 'ALL' && inv.direction !== portalDirectionFilter) {
        return false
      }
      if (portalSearchQuery) {
        const q = portalSearchQuery.toLowerCase()
        return (
          (inv.invoice_number && inv.invoice_number.toLowerCase().includes(q)) ||
          (inv.sender_title && inv.sender_title.toLowerCase().includes(q)) ||
          (inv.receiver_title && inv.receiver_title.toLowerCase().includes(q)) ||
          (inv.ettn && inv.ettn.toLowerCase().includes(q))
        )
      }
      return true
    })
  }, [portalInvoices, portalDirectionFilter, portalSearchQuery])

  // Filtered Receipts for Simulator
  const filteredReceipts = useMemo(() => {
    return receipts.filter((r) => {
      if (selectedBranchFilter !== 'ALL' && r.branch_id && r.branch_id !== selectedBranchFilter) {
        return false
      }
      if (receiptSearchQuery) {
        const q = receiptSearchQuery.toLowerCase()
        return (
          (r.receipt_no && r.receipt_no.toLowerCase().includes(q)) ||
          (r.doc_no && r.doc_no.toLowerCase().includes(q)) ||
          (r.supplier_name && r.supplier_name.toLowerCase().includes(q))
        )
      }
      return true
    })
  }, [receipts, selectedBranchFilter, receiptSearchQuery])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--app-bg)', color: 'var(--text-strong)', paddingBottom: 60 }}>
      {/* Top Banner / Integrator Brand Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0d1117 0%, #161b22 100%)',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          padding: '16px 28px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #f5a623 0%, #d97706 100%)',
              color: '#000000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.4rem',
              fontWeight: 900,
              boxShadow: '0 4px 12px rgba(245,166,35,0.35)',
            }}
          >
            <i className="fa-solid fa-cloud-bolt" />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#ffffff', letterSpacing: -0.3 }}>
                Özel Entegratör Bulut Yönetim Portalı
              </span>
              <span
                style={{
                  fontSize: '.72rem',
                  padding: '2px 8px',
                  borderRadius: 6,
                  background: 'rgba(16,185,129,0.2)',
                  color: '#10b981',
                  border: '1px solid rgba(16,185,129,0.4)',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
                GİB BTRANS Çevrimiçi (200 OK)
              </span>

              {/* Active Provider Badge */}
              <span
                style={{
                  fontSize: '.72rem',
                  padding: '2px 8px',
                  borderRadius: 6,
                  background:
                    integratorConfig.provider === 'uyumsoft'
                      ? 'rgba(59,130,246,0.25)'
                      : integratorConfig.provider === 'edm'
                      ? 'rgba(16,185,129,0.25)'
                      : 'rgba(239,68,68,0.25)',
                  color:
                    integratorConfig.provider === 'uyumsoft'
                      ? '#60a5fa'
                      : integratorConfig.provider === 'edm'
                      ? '#34d399'
                      : '#f87171',
                  border: '1px solid currentColor',
                  fontWeight: 900,
                  textTransform: 'uppercase',
                }}
              >
                Sağlayıcı: {integratorConfig.provider}
              </span>
            </div>
            <div style={{ fontSize: '.82rem', color: '#8b949e', marginTop: 2 }}>
              UBL-TR 2.1 E-Dönüşüm Merkezi (Uyumsoft, EDM Bilişim & Sandbox Simülasyonu)
            </div>
          </div>
        </div>

        {/* Header Right Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleSyncToRms}
            disabled={syncingToRms}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '9px 16px',
              borderRadius: 10,
              background: '#10b981',
              color: '#ffffff',
              border: 'none',
              fontWeight: 800,
              fontSize: '.85rem',
              cursor: syncingToRms ? 'not-allowed' : 'pointer',
              boxShadow: '0 2px 8px rgba(16,185,129,0.3)',
            }}
          >
            <i className={`fa-solid ${syncingToRms ? 'fa-spinner fa-spin' : 'fa-arrows-rotate'}`} />
            {syncingToRms ? 'RMS Senkronize Ediliyor...' : 'RMS ile Senkronize Et'}
          </button>

          <Link
            to="/einvoice"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '9px 18px',
              borderRadius: 10,
              background: 'rgba(245,166,35,0.15)',
              border: '1.5px solid #f5a623',
              color: '#f5a623',
              fontWeight: 800,
              fontSize: '.85rem',
              textDecoration: 'none',
            }}
          >
            <i className="fa-solid fa-arrow-left" />
            SuitableRMS E-Fatura Sayfasına Git
          </Link>
        </div>
      </div>

      {/* Main Container */}
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '24px 24px 0' }}>
        {/* ============================================================= */}
        {/* BÜYÜK 2-BÖLÜM GEÇİŞ BUTONLARI (SECTION SWITCHER) */}
        {/* ============================================================= */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 16,
            marginBottom: 24,
          }}
        >
          {/* 1. BÖLÜM BUTONU: GERÇEK ENTEGRATÖR PORTALI */}
          <button
            type="button"
            onClick={() => setMainSection('PORTAL')}
            style={{
              padding: '18px 22px',
              borderRadius: 14,
              border: mainSection === 'PORTAL' ? '2.5px solid #38bdf8' : '1px solid var(--border)',
              background: mainSection === 'PORTAL' ? 'linear-gradient(135deg, rgba(56,189,248,0.12), rgba(59,130,246,0.06))' : 'var(--surface)',
              color: 'var(--text-strong)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              textAlign: 'left',
              boxShadow: mainSection === 'PORTAL' ? '0 8px 24px rgba(56,189,248,0.15)' : '0 2px 6px rgba(0,0,0,0.02)',
              transition: 'all .2s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: mainSection === 'PORTAL' ? '#38bdf8' : 'var(--surface-2)',
                  color: mainSection === 'PORTAL' ? '#000' : 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.3rem',
                  fontWeight: 900,
                }}
              >
                <i className="fa-solid fa-globe" />
              </div>
              <div>
                <div style={{ fontWeight: 900, fontSize: '1.05rem', color: mainSection === 'PORTAL' ? '#38bdf8' : 'var(--text-strong)' }}>
                  1. GERÇEK ENTEGRATÖR PORTALI & BULUT KONSOLU
                </div>
                <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  Entegratörün gelen/giden kutusu, GİB zarfları, 1200/1300 durumları & canlı ayarları
                </div>
              </div>
            </div>

            <span
              style={{
                fontSize: '.75rem',
                fontWeight: 800,
                padding: '4px 10px',
                borderRadius: 8,
                background: mainSection === 'PORTAL' ? '#38bdf8' : 'var(--surface-2)',
                color: mainSection === 'PORTAL' ? '#000' : 'var(--text-muted)',
              }}
            >
              {portalInvoices.length} Belge
            </span>
          </button>

          {/* 2. BÖLÜM BUTONU: ENTEGRATÖR SİMÜLATÖRÜ (KIRMIZI KUTU) */}
          <button
            type="button"
            onClick={() => setMainSection('SIMULATOR')}
            style={{
              padding: '18px 22px',
              borderRadius: 14,
              border: mainSection === 'SIMULATOR' ? '2.5px solid #ef4444' : '1px solid var(--border)',
              background: mainSection === 'SIMULATOR' ? 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(220,38,38,0.06))' : 'var(--surface)',
              color: 'var(--text-strong)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              textAlign: 'left',
              boxShadow: mainSection === 'SIMULATOR' ? '0 8px 24px rgba(239,68,68,0.15)' : '0 2px 6px rgba(0,0,0,0.02)',
              transition: 'all .2s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: mainSection === 'SIMULATOR' ? '#ef4444' : 'var(--surface-2)',
                  color: mainSection === 'SIMULATOR' ? '#fff' : 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.3rem',
                  fontWeight: 900,
                }}
              >
                <i className="fa-solid fa-flask" />
              </div>
              <div>
                <div style={{ fontWeight: 900, fontSize: '1.05rem', color: mainSection === 'SIMULATOR' ? '#ef4444' : 'var(--text-strong)' }}>
                  2. ENTEGRATÖR SİMÜLATÖRÜ (Fatura Üretici)
                </div>
                <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  Faturayı doğrudan RMS'e değil, Özel Entegratör Havuzuna üretir (Alias & İsim Bozma)
                </div>
              </div>
            </div>

            <span
              style={{
                fontSize: '.75rem',
                fontWeight: 800,
                padding: '4px 10px',
                borderRadius: 8,
                background: mainSection === 'SIMULATOR' ? '#ef4444' : 'var(--surface-2)',
                color: mainSection === 'SIMULATOR' ? '#fff' : 'var(--text-muted)',
              }}
            >
              Simülatör
            </span>
          </button>
        </div>

        {/* ============================================================= */}
        {/* BÖLÜM 1: GERÇEK ENTEGRATÖR PORTALI & BULUT KONSOLU */}
        {/* ============================================================= */}
        {mainSection === 'PORTAL' && (
          <div>
            {/* Integrator Provider Selector Bar */}
            <div
              style={{
                background: 'var(--surface)',
                borderRadius: 14,
                padding: '14px 20px',
                border: '1px solid var(--border)',
                marginBottom: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: '.82rem', fontWeight: 800, color: 'var(--text-muted)' }}>
                  Aktif Entegratör Sağlayıcısı:
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[
                    { id: 'sandbox', label: 'Sandbox (Simülatör)', icon: 'fa-box', color: '#f5a623' },
                    { id: 'uyumsoft', label: 'Uyumsoft E-Fatura', icon: 'fa-building', color: '#3b82f6' },
                    { id: 'edm', label: 'EDM Bilişim', icon: 'fa-shield-halved', color: '#10b981' },
                  ].map((p) => {
                    const isSelected = (integratorConfig.provider || 'sandbox') === p.id
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleChangeProvider(p.id)}
                        style={{
                          padding: '6px 14px',
                          borderRadius: 8,
                          border: isSelected ? `2px solid ${p.color}` : '1px solid var(--border)',
                          background: isSelected ? `${p.color}22` : 'var(--surface-2)',
                          color: isSelected ? p.color : 'var(--text-muted)',
                          fontWeight: 800,
                          fontSize: '.8rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <i className={`fa-solid ${p.icon}`} />
                        {p.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testingConnection}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--surface-2)',
                    color: 'var(--text-strong)',
                    fontSize: '.8rem',
                    fontWeight: 700,
                    cursor: testingConnection ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <i className={`fa-solid ${testingConnection ? 'fa-spinner fa-spin' : 'fa-network-wired'}`} />
                  {testingConnection ? 'Test Ediliyor...' : 'API Bağlantısını Sına'}
                </button>
              </div>
            </div>

            {/* Portal Sub-Tab Menu */}
            <div
              style={{
                display: 'flex',
                gap: 8,
                borderBottom: '2px solid var(--border)',
                marginBottom: 20,
                overflowX: 'auto',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setPortalTab('portal-inbox')
                  setPortalDirectionFilter('INBOUND')
                }}
                style={{
                  padding: '10px 18px',
                  border: 'none',
                  background: 'transparent',
                  borderBottom: portalTab === 'portal-inbox' ? '3px solid #38bdf8' : '3px solid transparent',
                  color: portalTab === 'portal-inbox' ? '#38bdf8' : 'var(--text-muted)',
                  fontWeight: 800,
                  fontSize: '.9rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: -2,
                }}
              >
                <i className="fa-solid fa-inbox" />
                Entegratör Gelen Kutusu (Inbound)
                <span style={{ fontSize: '.72rem', padding: '2px 6px', borderRadius: 10, background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                  {portalInvoices.filter((i) => i.direction === 'INBOUND').length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPortalTab('portal-outbox')
                  setPortalDirectionFilter('OUTBOUND')
                }}
                style={{
                  padding: '10px 18px',
                  border: 'none',
                  background: 'transparent',
                  borderBottom: portalTab === 'portal-outbox' ? '3px solid #38bdf8' : '3px solid transparent',
                  color: portalTab === 'portal-outbox' ? '#38bdf8' : 'var(--text-muted)',
                  fontWeight: 800,
                  fontSize: '.9rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: -2,
                }}
              >
                <i className="fa-solid fa-paper-plane" />
                Entegratör Giden Kutusu & GİB Kuyruğu (Outbound)
                <span style={{ fontSize: '.72rem', padding: '2px 6px', borderRadius: 10, background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                  {portalInvoices.filter((i) => i.direction === 'OUTBOUND').length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setPortalTab('portal-status-sim')}
                style={{
                  padding: '10px 18px',
                  border: 'none',
                  background: 'transparent',
                  borderBottom: portalTab === 'portal-status-sim' ? '3px solid #38bdf8' : '3px solid transparent',
                  color: portalTab === 'portal-status-sim' ? '#38bdf8' : 'var(--text-muted)',
                  fontWeight: 800,
                  fontSize: '.9rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: -2,
                }}
              >
                <i className="fa-solid fa-code-compare" />
                GİB Durum Kodu & Webhook Simülatörü
              </button>
            </div>

            {/* Portal Table Search / Filter Bar */}
            {(portalTab === 'portal-inbox' || portalTab === 'portal-outbox') && (
              <div
                style={{
                  background: 'var(--surface)',
                  borderRadius: 12,
                  padding: '12px 16px',
                  border: '1px solid var(--border)',
                  marginBottom: 16,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div style={{ position: 'relative', flex: 1, maxWidth: 400 }}>
                  <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: 12, top: 11, color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    value={portalSearchQuery}
                    onChange={(e) => setPortalSearchQuery(e.target.value)}
                    placeholder="Belge no, ETTN veya VKN ile ara..."
                    style={{
                      width: '100%',
                      padding: '8px 12px 8px 36px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--app-bg)',
                      color: 'var(--text-strong)',
                      fontSize: '.82rem',
                    }}
                  />
                </div>

                <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>
                  Toplam <strong>{filteredPortalInvoices.length}</strong> entegratör kaydı listeleniyor
                </div>
              </div>
            )}

            {/* Portal Invoices Table */}
            {(portalTab === 'portal-inbox' || portalTab === 'portal-outbox') && (
              <div
                style={{
                  background: 'var(--surface)',
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  overflow: 'hidden',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                }}
              >
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '10px 12px', textAlign: 'left' }}>Belge No & ETTN</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left' }}>Profil / Tür</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left' }}>
                          {portalTab === 'portal-inbox' ? 'Gönderici Tedarikçi' : 'Alıcı Müşteri / Şube'}
                        </th>
                        <th style={{ padding: '10px 12px', textAlign: 'left' }}>Tarih</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>Ödenecek Tutar</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center' }}>GİB Durum Kodu</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center' }}>RMS Senkronizasyonu</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center' }}>İşlemler</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPortalInvoices.length === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                            Entegratör havuzunda kayıtlı belge bulunamadı. Simülatör sekmesinden yeni fatura üretebilirsiniz.
                          </td>
                        </tr>
                      ) : (
                        filteredPortalInvoices.map((inv) => {
                          const statusMeta = getStatusMeta(inv.status_code)
                          const isSynced = inv.is_synced_to_rms !== false

                          return (
                            <tr key={inv.id} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '10px 12px' }}>
                                <div style={{ fontWeight: 800, color: 'var(--text-strong)', fontFamily: 'monospace' }}>
                                  {inv.invoice_number}
                                </div>
                                <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                  {inv.ettn?.slice(0, 18)}...
                                </div>
                              </td>

                              <td style={{ padding: '10px 12px' }}>
                                <span style={{ fontWeight: 700, color: 'var(--text-strong)' }}>{inv.profile_id}</span>
                                <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{inv.invoice_type}</div>
                              </td>

                              <td style={{ padding: '10px 12px' }}>
                                <div style={{ fontWeight: 700, color: 'var(--text-strong)' }}>
                                  {portalTab === 'portal-inbox' ? inv.sender_title : inv.receiver_title}
                                </div>
                                <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>
                                  VKN: {portalTab === 'portal-inbox' ? inv.sender_vkn_tckn : inv.receiver_vkn_tckn}
                                </div>
                              </td>

                              <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '.78rem' }}>
                                {inv.issue_date}
                              </td>

                              <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--text-strong)' }}>
                                {Number(inv.payable_amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                              </td>

                              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                <span
                                  style={{
                                    padding: '3px 8px',
                                    borderRadius: 6,
                                    fontSize: '.72rem',
                                    fontWeight: 700,
                                    background: statusMeta.bg,
                                    color: statusMeta.color,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                  }}
                                >
                                  <i className={`fa-solid ${statusMeta.icon}`} />
                                  {inv.status_code} - {statusMeta.label}
                                </span>
                              </td>

                              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                {isSynced ? (
                                  <span
                                    style={{
                                      padding: '2px 8px',
                                      borderRadius: 6,
                                      background: 'rgba(16,185,129,0.12)',
                                      color: '#10b981',
                                      fontSize: '.7rem',
                                      fontWeight: 700,
                                    }}
                                  >
                                    <i className="fa-solid fa-check" style={{ marginRight: 4 }} />
                                    RMS'e Aktarıldı
                                  </span>
                                ) : (
                                  <span
                                    style={{
                                      padding: '2px 8px',
                                      borderRadius: 6,
                                      background: 'rgba(245,158,11,0.15)',
                                      color: '#d97706',
                                      fontSize: '.7rem',
                                      fontWeight: 700,
                                    }}
                                  >
                                    <i className="fa-solid fa-clock" style={{ marginRight: 4 }} />
                                    Havuzda Bekliyor
                                  </span>
                                )}
                              </td>

                              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                                  <button
                                    type="button"
                                    title="GİB Formatında Görüntüle"
                                    onClick={() => {
                                      setPreviewDoc(inv)
                                      setPreviewModalOpen(true)
                                    }}
                                    style={{
                                      padding: '4px 8px',
                                      borderRadius: 6,
                                      border: '1px solid var(--border)',
                                      background: 'var(--surface-2)',
                                      color: 'var(--text-strong)',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    <i className="fa-solid fa-eye" />
                                  </button>

                                  <button
                                    type="button"
                                    title="Durumunu Simüle Et"
                                    onClick={() => {
                                      setSelectedInvoiceForStatus(inv)
                                      setTargetStatusCode(inv.status_code || 1200)
                                      setPortalTab('portal-status-sim')
                                    }}
                                    style={{
                                      padding: '4px 8px',
                                      borderRadius: 6,
                                      border: '1px solid #38bdf8',
                                      background: 'rgba(56,189,248,0.12)',
                                      color: '#0284c7',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    <i className="fa-solid fa-sliders" />
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

            {/* Portal Tab 3: GİB Durum Simülatörü */}
            {portalTab === 'portal-status-sim' && (
              <div
                style={{
                  background: 'var(--surface)',
                  borderRadius: 14,
                  padding: 24,
                  border: '1px solid var(--border)',
                  maxWidth: 800,
                }}
              >
                <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-strong)', marginBottom: 8 }}>
                  <i className="fa-solid fa-code-compare" style={{ color: '#38bdf8', marginRight: 8 }} />
                  GİB Durum Kodu & Webhook Yanıt Simülatörü
                </div>
                <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: 20 }}>
                  Entegratör havuzundaki bir belgenin GİB akış durumunu (1100 Gönderildi ➔ 1200 Alıcıya Ulaştı ➔ 1210 Kabul / 1220 Red / 1300 Başarılı) anında güncelleyebilirsiniz.
                </div>

                <div style={{ display: 'grid', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '.8rem', fontWeight: 700, color: 'var(--text-strong)', marginBottom: 6 }}>
                      İşlem Yapılacak Belgeyi Seçin:
                    </label>
                    <select
                      value={selectedInvoiceForStatus?.id || ''}
                      onChange={(e) => {
                        const found = portalInvoices.find((i) => i.id === e.target.value)
                        setSelectedInvoiceForStatus(found || null)
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--app-bg)',
                        color: 'var(--text-strong)',
                        fontSize: '.85rem',
                        fontWeight: 700,
                      }}
                    >
                      <option value="">-- Belge Seçin --</option>
                      {portalInvoices.map((inv) => (
                        <option key={inv.id} value={inv.id}>
                          {inv.invoice_number} | {inv.sender_title} ({Number(inv.payable_amount).toFixed(2)} ₺) - Mevcut: {inv.status_code}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '.8rem', fontWeight: 700, color: 'var(--text-strong)', marginBottom: 6 }}>
                      Yeni GİB Durum Kodu:
                    </label>
                    <select
                      value={targetStatusCode}
                      onChange={(e) => setTargetStatusCode(Number(e.target.value))}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--app-bg)',
                        color: 'var(--text-strong)',
                        fontSize: '.85rem',
                        fontWeight: 700,
                      }}
                    >
                      <option value={1100}>1100 - GİB Kuyruğunda / Gönderiliyor (Outbound)</option>
                      <option value={1200}>1200 - Alıcıya Başarıyla Ulaştı (Teslim Edildi)</option>
                      <option value={1210}>1210 - Alıcı Faturayı KABUL Etti (Ticari Yanıt)</option>
                      <option value={1220}>1220 - Alıcı Faturayı REDDETTİ (Ticari Yanıt)</option>
                      <option value={1300}>1300 - Süreç Başarıyla Tamamlandı (Başarılı Sonuç)</option>
                      <option value={1160}>1160 - GİB Schematron / İmza Hatası (Hata Aldı)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '.8rem', fontWeight: 700, color: 'var(--text-strong)', marginBottom: 6 }}>
                      Durum / Yanıt Açıklaması (Opsiyonel):
                    </label>
                    <input
                      type="text"
                      value={simReasonNote}
                      onChange={(e) => setSimReasonNote(e.target.value)}
                      placeholder="Örn: GİB BTRANS Onaylandı, Ticari Kabul Yanıtı Alındı"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--app-bg)',
                        color: 'var(--text-strong)',
                        fontSize: '.85rem',
                      }}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleUpdateStatus}
                    disabled={!selectedInvoiceForStatus || updatingStatus}
                    style={{
                      padding: '12px 20px',
                      borderRadius: 10,
                      border: 'none',
                      background: selectedInvoiceForStatus ? 'linear-gradient(135deg, #38bdf8, #0284c7)' : 'var(--border)',
                      color: '#ffffff',
                      fontWeight: 800,
                      fontSize: '.9rem',
                      cursor: selectedInvoiceForStatus && !updatingStatus ? 'pointer' : 'not-allowed',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                    }}
                  >
                    <i className={`fa-solid ${updatingStatus ? 'fa-spinner fa-spin' : 'fa-check'}`} />
                    {updatingStatus ? 'Güncelleniyor...' : 'GİB Durumunu Güncelle & Simüle Et'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================= */}
        {/* BÖLÜM 2: ENTEGRATÖR SİMÜLATÖRÜ (KIRMIZI KUTU) */}
        {/* ============================================================= */}
        {mainSection === 'SIMULATOR' && (
          <div>
            {/* Simulator Red Header Banner */}
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(239,68,68,0.12) 0%, rgba(185,28,28,0.06) 100%)',
                border: '1.5px solid rgba(239,68,68,0.4)',
                borderRadius: 14,
                padding: '16px 20px',
                marginBottom: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: '#ef4444',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.2rem',
                    fontWeight: 900,
                  }}
                >
                  <i className="fa-solid fa-flask" />
                </div>
                <div>
                  <div style={{ fontWeight: 900, fontSize: '1rem', color: '#ef4444' }}>
                    Entegratör Fatura & İrsaliye Simülatörü
                  </div>
                  <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    ⚠️ Simülatör faturayı doğrudan RMS'e yazmaz; <strong>Özel Entegratör Havuzuna</strong> üretir. RMS faturayı Entegratörden senkronize eder.
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '.75rem', fontWeight: 800, color: '#ef4444', background: 'rgba(239,68,68,0.15)', padding: '4px 10px', borderRadius: 8 }}>
                  Hedef: {integratorConfig.provider.toUpperCase()} Entegratör Gelen Kutusu
                </span>
              </div>
            </div>

            {/* Global Simülasyon Ayarları: İsim Yönünde Farklı / Hatalı İsimle Fatura Üretme Modu */}
            <div
              style={{
                background: simulateDifferentNames
                  ? 'linear-gradient(135deg, rgba(147,51,234,0.14) 0%, rgba(245,158,11,0.09) 100%)'
                  : 'var(--surface)',
                border: simulateDifferentNames ? '1.5px solid #9333ea' : '1px solid var(--border)',
                borderRadius: 14,
                padding: '14px 20px',
                marginBottom: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 16,
                boxShadow: simulateDifferentNames ? '0 4px 20px rgba(147,51,234,0.15)' : '0 2px 6px rgba(0,0,0,0.02)',
                transition: 'all .25s ease',
              }}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', flex: 1, minWidth: 320 }}>
                <input
                  type="checkbox"
                  checked={simulateDifferentNames}
                  onChange={(e) => setSimulateDifferentNames(e.target.checked)}
                  style={{
                    width: 22,
                    height: 22,
                    accentColor: '#9333ea',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                />
                <div>
                  <div style={{ fontWeight: 800, fontSize: '.92rem', color: simulateDifferentNames ? '#9333ea' : 'var(--text-strong)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <i className="fa-solid fa-wand-magic-sparkles" style={{ color: '#9333ea' }} />
                    İsim Yönünde Farklı / Hatalı İsimle Fatura Üret (Tedarikçi Alias & Fonetisite Simülasyonu)
                    {simulateDifferentNames ? (
                      <span
                        style={{
                          fontSize: '.68rem',
                          padding: '2px 8px',
                          borderRadius: 6,
                          background: '#9333ea',
                          color: '#ffffff',
                          fontWeight: 900,
                          letterSpacing: 0.5,
                          textTransform: 'uppercase',
                        }}
                      >
                        Aktif (Tüm Modellerle Birlikte Çalışır)
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: '.68rem',
                          padding: '2px 8px',
                          borderRadius: 6,
                          background: 'var(--surface-2)',
                          color: 'var(--text-muted)',
                          fontWeight: 700,
                        }}
                      >
                        Pasif (Birebir Standart İsimler)
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4 }}>
                    Bu kutu işaretlendiğinde, simülatördeki <strong>tüm fatura üretme modellerinde</strong> (Birebir, Eksik Teslimat, Fazla Teslimat, Fiyat Artışı/Sözleşme İhlali, KDV Uyuşmazlığı ve Serbest Belge) ürün adları gerçek tedarikçi kısaltmalarına dönüştürülür (Örn: <em>"Cheddar Peyniri"</em> ➔ <strong style={{ color: '#9333ea' }}>"çedar peynr"</strong>, <em>"Hamburger Köftesi"</em> ➔ <strong style={{ color: '#9333ea' }}>"Hamb. Koftesi (120gr)"</strong>, <em>"Patates (dondurulmuş)"</em> ➔ <strong style={{ color: '#9333ea' }}>"Donuk Patats 9x9"</strong>).
                  </div>
                </div>
              </label>
            </div>

            {/* Simulator Sub-Tab Navigation */}
            <div
              style={{
                display: 'flex',
                gap: 8,
                borderBottom: '2px solid var(--border)',
                marginBottom: 20,
                overflowX: 'auto',
              }}
            >
              <button
                type="button"
                onClick={() => setSimTab('shipment-generator')}
                style={{
                  padding: '10px 18px',
                  border: 'none',
                  background: 'transparent',
                  borderBottom: simTab === 'shipment-generator' ? '3px solid #ef4444' : '3px solid transparent',
                  color: simTab === 'shipment-generator' ? '#ef4444' : 'var(--text-muted)',
                  fontWeight: 800,
                  fontSize: '.9rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: -2,
                }}
              >
                <i className="fa-solid fa-truck-ramp-box" />
                1. Mal Kabul Sevkiyatından Fatura Üretici
                <span style={{ fontSize: '.72rem', padding: '2px 6px', borderRadius: 10, background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                  {receipts.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSimTab('freeform-builder')}
                style={{
                  padding: '10px 18px',
                  border: 'none',
                  background: 'transparent',
                  borderBottom: simTab === 'freeform-builder' ? '3px solid #ef4444' : '3px solid transparent',
                  color: simTab === 'freeform-builder' ? '#ef4444' : 'var(--text-muted)',
                  fontWeight: 800,
                  fontSize: '.9rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: -2,
                }}
              >
                <i className="fa-solid fa-pen-ruler" />
                2. Serbest E-Fatura & E-İrsaliye Tasarımcısı
              </button>

              <button
                type="button"
                onClick={() => setSimTab('transfer-hub')}
                style={{
                  padding: '10px 18px',
                  border: 'none',
                  background: 'transparent',
                  borderBottom: simTab === 'transfer-hub' ? '3px solid #ef4444' : '3px solid transparent',
                  color: simTab === 'transfer-hub' ? '#ef4444' : 'var(--text-muted)',
                  fontWeight: 800,
                  fontSize: '.9rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: -2,
                }}
              >
                <i className="fa-solid fa-arrow-right-arrow-left" />
                3. Şirketler Arası & Dahili Transfer Hub
              </button>
            </div>

            {/* Sim Tab 1: Mal Kabul Sevkiyatından Fatura Üretici */}
            {simTab === 'shipment-generator' && (
              <div>
                {/* Search Bar */}
                <div
                  style={{
                    background: 'var(--surface)',
                    borderRadius: 12,
                    padding: '12px 16px',
                    border: '1px solid var(--border)',
                    marginBottom: 16,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 280 }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: 12, top: 11, color: 'var(--text-muted)' }} />
                      <input
                        type="text"
                        placeholder="Tedarikçi adı veya irsaliye no ara..."
                        value={receiptSearchQuery}
                        onChange={(e) => setReceiptSearchQuery(e.target.value)}
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

                    <select
                      value={selectedBranchFilter}
                      onChange={(e) => setSelectedBranchFilter(e.target.value)}
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
                      <option value="ALL">Tüm Teslimat Şubeleri</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>
                    Toplam <strong>{filteredReceipts.length}</strong> teslimat irsaliyesi listeleniyor
                  </div>
                </div>

                {/* List of Receipts for Generator */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {filteredReceipts.map((receipt) => {
                    const lines = receiptLinesMap[receipt.id] || []
                    const activeContract = receiptContractsMap[receipt.supplier_id] || null
                    const totalAmount = Number(receipt.total_amount_vat_inc || receipt.total_amount || 0)

                    return (
                      <div
                        key={receipt.id}
                        style={{
                          background: 'var(--surface)',
                          borderRadius: 12,
                          border: '1px solid var(--border)',
                          padding: 16,
                          boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                        }}
                      >
                        {/* Top Info Row */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-strong)' }}>
                                {receipt.supplier_name || 'Tedarikçi'}
                              </span>
                              <span
                                style={{
                                  fontSize: '.75rem',
                                  padding: '2px 8px',
                                  borderRadius: 6,
                                  background: 'rgba(56,189,248,0.12)',
                                  color: '#38bdf8',
                                  fontWeight: 700,
                                  fontFamily: 'monospace',
                                }}
                              >
                                İrsaliye: {receipt.receipt_no || receipt.doc_no || 'No Yok'}
                              </span>

                              {activeContract && (
                                <span
                                  style={{
                                    fontSize: '.72rem',
                                    padding: '2px 8px',
                                    borderRadius: 6,
                                    background: 'rgba(16,185,129,0.12)',
                                    color: '#10b981',
                                    fontWeight: 700,
                                  }}
                                >
                                  <i className="fa-solid fa-file-contract" style={{ marginRight: 4 }} />
                                  Sözleşme: #{activeContract.contract_no}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 3 }}>
                              Teslimat: {receipt.delivered_on || 'Tarih Belirtilmemiş'} | Kalem Sayısı: <strong>{lines.length} Kalem</strong>
                            </div>
                          </div>

                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>Mal Kabul Tutarı</div>
                            <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#10b981' }}>
                              {totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                            </div>
                          </div>
                        </div>

                        {/* Scenario Generation Buttons */}
                        <div
                          style={{
                            display: 'flex',
                            gap: 8,
                            flexWrap: 'wrap',
                            paddingTop: 10,
                            borderTop: '1px solid var(--border)',
                          }}
                        >
                          <button
                            type="button"
                            disabled={actionLoadingId === `${receipt.id}-EXACT`}
                            onClick={() => handleGenerateInvoiceFromReceipt(receipt, 'EXACT')}
                            style={{
                              padding: '7px 12px',
                              borderRadius: 8,
                              background: 'rgba(16,185,129,0.12)',
                              border: '1px solid #10b981',
                              color: '#10b981',
                              fontWeight: 700,
                              fontSize: '.76rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <i className="fa-solid fa-check" />
                            🟢 Birebir Uyumlu Fatura Üret
                          </button>

                          <button
                            type="button"
                            disabled={actionLoadingId === `${receipt.id}-SHORTAGE`}
                            onClick={() => handleGenerateInvoiceFromReceipt(receipt, 'SHORTAGE')}
                            style={{
                              padding: '7px 12px',
                              borderRadius: 8,
                              background: 'rgba(239,68,68,0.1)',
                              border: '1px solid #ef4444',
                              color: '#ef4444',
                              fontWeight: 700,
                              fontSize: '.76rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <i className="fa-solid fa-box-open" />
                            🔴 Eksik Teslimat Faturası Üret
                          </button>

                          <button
                            type="button"
                            disabled={actionLoadingId === `${receipt.id}-SURPLUS`}
                            onClick={() => handleGenerateInvoiceFromReceipt(receipt, 'SURPLUS')}
                            style={{
                              padding: '7px 12px',
                              borderRadius: 8,
                              background: 'rgba(34,211,238,0.1)',
                              border: '1px solid #22d3ee',
                              color: '#0891b2',
                              fontWeight: 700,
                              fontSize: '.76rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <i className="fa-solid fa-dolly" />
                            🔵 Fazla Teslimat Faturası Üret
                          </button>

                          <button
                            type="button"
                            disabled={actionLoadingId === `${receipt.id}-PRICE_OVER`}
                            onClick={() => handleGenerateInvoiceFromReceipt(receipt, 'PRICE_OVER')}
                            style={{
                              padding: '7px 12px',
                              borderRadius: 8,
                              background: 'rgba(245,158,11,0.1)',
                              border: '1px solid #f59e0b',
                              color: '#d97706',
                              fontWeight: 700,
                              fontSize: '.76rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <i className="fa-solid fa-arrow-trend-up" />
                            🟡 Fiyat Artışı / Sözleşme İhlali Üret
                          </button>

                          <button
                            type="button"
                            disabled={actionLoadingId === `${receipt.id}-TAX_MISMATCH`}
                            onClick={() => handleGenerateInvoiceFromReceipt(receipt, 'TAX_MISMATCH')}
                            style={{
                              padding: '7px 12px',
                              borderRadius: 8,
                              background: 'rgba(168,85,247,0.1)',
                              border: '1px solid #a855f7',
                              color: '#9333ea',
                              fontWeight: 700,
                              fontSize: '.76rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <i className="fa-solid fa-percent" />
                            🟣 KDV & Ekstra Kalem Uyuşmazlığı Üret
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Sim Tab 2: Serbest Fatura Tasarımcısı */}
            {simTab === 'freeform-builder' && (
              <div
                style={{
                  background: 'var(--surface)',
                  borderRadius: 14,
                  padding: 24,
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-strong)' }}>
                      Serbest E-Fatura & E-İrsaliye Tasarımcısı
                    </div>
                    <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>
                      İstediğiniz tedarikçi ve kalem bilgilerini girerek Özel Entegratör Havuzuna serbest UBL belgesi oluşturun.
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setBuilderLines((prev) =>
                          prev.map((l) => ({
                            ...l,
                            item_name: distortItemName(l.item_name),
                          }))
                        )
                        toast('✨ Kalem isimleri tedarikçi formatına dönüştürüldü!', 'info')
                      }}
                      style={{
                        padding: '7px 12px',
                        borderRadius: 8,
                        border: '1px solid #9333ea',
                        background: 'rgba(147,51,234,0.12)',
                        color: '#9333ea',
                        fontWeight: 800,
                        fontSize: '.78rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <i className="fa-solid fa-wand-magic-sparkles" />
                      İsimleri Fonetik Kısalt
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setBuilderLines((prev) => [
                          ...prev,
                          {
                            id: `line-${Date.now()}`,
                            item_name: 'Yeni Kalem / Malzeme',
                            item_code: 'KOD-001',
                            invoiced_quantity: 10,
                            unit_code: 'C62',
                            unit_price: 100.0,
                            tax_rate: 20,
                          },
                        ])
                      }}
                      style={{
                        padding: '7px 14px',
                        borderRadius: 8,
                        border: 'none',
                        background: '#f5a623',
                        color: '#000',
                        fontWeight: 800,
                        fontSize: '.78rem',
                        cursor: 'pointer',
                      }}
                    >
                      <i className="fa-solid fa-plus" style={{ marginRight: 6 }} />
                      Kalem Ekle
                    </button>
                  </div>
                </div>

                {/* Freeform Lines Table */}
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Ürün / Kalem Adı</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', width: 120 }}>SKU</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', width: 90 }}>Miktar</th>
                        <th style={{ padding: '8px 10px', textAlign: 'center', width: 90 }}>Birim</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', width: 110 }}>Birim Fiyat</th>
                        <th style={{ padding: '8px 10px', textAlign: 'center', width: 80 }}>KDV %</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', width: 110 }}>Toplam</th>
                        <th style={{ padding: '8px 6px', textAlign: 'center', width: 40 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {builderLines.map((line, idx) => {
                        const sub = Number(line.invoiced_quantity || 1) * Number(line.unit_price || 0)
                        return (
                          <tr key={line.id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: 6 }}>
                              <input
                                type="text"
                                value={line.item_name}
                                onChange={(e) => {
                                  const val = e.target.value
                                  setBuilderLines((prev) => prev.map((l, i) => (i === idx ? { ...l, item_name: val } : l)))
                                }}
                                style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--app-bg)', color: 'var(--text-strong)', fontSize: '.82rem' }}
                              />
                            </td>
                            <td style={{ padding: 6 }}>
                              <input
                                type="text"
                                value={line.item_code || ''}
                                onChange={(e) => {
                                  const val = e.target.value
                                  setBuilderLines((prev) => prev.map((l, i) => (i === idx ? { ...l, item_code: val } : l)))
                                }}
                                style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--app-bg)', color: 'var(--text-strong)', fontSize: '.82rem' }}
                              />
                            </td>
                            <td style={{ padding: 6 }}>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={line.invoiced_quantity}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0
                                  setBuilderLines((prev) => prev.map((l, i) => (i === idx ? { ...l, invoiced_quantity: val } : l)))
                                }}
                                style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--app-bg)', color: 'var(--text-strong)', fontSize: '.82rem', textAlign: 'right' }}
                              />
                            </td>
                            <td style={{ padding: 6 }}>
                              <select
                                value={line.unit_code}
                                onChange={(e) => {
                                  const val = e.target.value
                                  setBuilderLines((prev) => prev.map((l, i) => (i === idx ? { ...l, unit_code: val } : l)))
                                }}
                                style={{ width: '100%', padding: '6px 4px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--app-bg)', color: 'var(--text-strong)', fontSize: '.82rem' }}
                              >
                                {UNIT_CODES.map((u) => (
                                  <option key={u.code} value={u.code}>
                                    {u.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td style={{ padding: 6 }}>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={line.unit_price}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0
                                  setBuilderLines((prev) => prev.map((l, i) => (i === idx ? { ...l, unit_price: val } : l)))
                                }}
                                style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--app-bg)', color: 'var(--text-strong)', fontSize: '.82rem', textAlign: 'right' }}
                              />
                            </td>
                            <td style={{ padding: 6 }}>
                              <select
                                value={line.tax_rate}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0
                                  setBuilderLines((prev) => prev.map((l, i) => (i === idx ? { ...l, tax_rate: val } : l)))
                                }}
                                style={{ width: '100%', padding: '6px 4px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--app-bg)', color: 'var(--text-strong)', fontSize: '.82rem' }}
                              >
                                {TAX_RATES.map((t) => (
                                  <option key={t.rate} value={t.rate}>
                                    %{t.rate}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700 }}>
                              {sub.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                            </td>
                            <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                              <button
                                type="button"
                                onClick={() => setBuilderLines((prev) => prev.filter((_, i) => i !== idx))}
                                style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}
                              >
                                <i className="fa-solid fa-trash" />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={handleGenerateFreeform}
                    disabled={loading}
                    style={{
                      padding: '10px 24px',
                      borderRadius: 10,
                      border: 'none',
                      background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                      color: '#ffffff',
                      fontWeight: 800,
                      fontSize: '.88rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      boxShadow: '0 4px 12px rgba(239,68,68,0.3)',
                    }}
                  >
                    <i className="fa-solid fa-cloud-arrow-up" />
                    Entegratör Gelen Kutusuna Üret & Gönder
                  </button>
                </div>
              </div>
            )}

            {/* Sim Tab 3: Transfer Hub */}
            {simTab === 'transfer-hub' && (
              <div
                style={{
                  background: 'var(--surface)',
                  borderRadius: 14,
                  padding: 24,
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-strong)', marginBottom: 8 }}>
                  Şirketler Arası & Dahili Transfer Faturalaşması (Inter-Company Hub)
                </div>
                <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: 20 }}>
                  Farklı tüzel kişiliklere sahip şubeler arasındaki dahili transferlerin otomatik e-irsaliye ve e-fatura akışlarını yönetin.
                </div>
                <div style={{ background: 'var(--app-bg)', padding: 18, borderRadius: 10, border: '1px solid var(--border)', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <i className="fa-solid fa-network-wired fa-2x" style={{ color: '#ef4444', marginBottom: 10 }} />
                  <div style={{ fontWeight: 700 }}>Şirketler Arası Transfer Otomasyonu Devrede</div>
                  <div style={{ fontSize: '.78rem', marginTop: 4 }}>
                    Stok Transferi ekranından yapılan tüzel kişilikler arası transferler otomatik olarak buradaki Entegratör Giden Kutusuna aktarılır.
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Document HTML / XML Preview Modal */}
      {previewModalOpen && previewDoc && (
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
              <div style={{ fontWeight: 800, color: 'var(--text-strong)' }}>
                Belge Detayı & GİB Formatı: {previewDoc.invoice_number}
              </div>
              <button
                type="button"
                onClick={() => setPreviewModalOpen(false)}
                style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
              <div
                dangerouslySetInnerHTML={{
                  __html: eInvoiceService.generateGibHtmlPreview(previewDoc),
                }}
              />
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'var(--surface-2)', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setPreviewModalOpen(false)}
                style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-strong)', fontWeight: 700, cursor: 'pointer' }}
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
