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

  // 1. Yaygın gıda/restoran stok isimleri için gerçekçi tedarikçi kısaltmaları sözlüğü
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

  // 2. Kural Tabanlı Kısaltma ve Fonetik Değiştirme (Fallback)
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

  // Active Main Tab
  const [activeTab, setActiveTab] = useState('shipment-generator') // 'shipment-generator', 'freeform-builder', 'rms-outbound', 'transfer-hub'

  // Global Simulation Options
  const [simulateDifferentNames, setSimulateDifferentNames] = useState(false)

  // Loading States
  const [loading, setLoading] = useState(false)
  const [actionLoadingId, setActionLoadingId] = useState(null)

  // Tab 1: Purchase Receipts Data
  const [receipts, setReceipts] = useState([])
  const [receiptLinesMap, setReceiptLinesMap] = useState({})
  const [receiptContractsMap, setReceiptContractsMap] = useState({})
  const [receiptSearchQuery, setReceiptSearchQuery] = useState('')
  const [selectedBranchFilter, setSelectedBranchFilter] = useState('ALL')
  const [branches, setBranches] = useState([])

  // Tab 2: Freeform Invoice / Despatch Builder
  const [builderDocType, setBuilderDocType] = useState('INVOICE') // 'INVOICE', 'DESPATCH'
  const [builderProfileId, setBuilderProfileId] = useState('TICARIFATURA') // 'TICARIFATURA', 'TEMELFATURA', 'EARSIVFATURA', 'TEMELIRSALIYE'
  const [builderInvoiceType, setBuilderInvoiceType] = useState('SATIS') // 'SATIS', 'IADE', 'TEVKIFAT'
  const [builderDirection, setBuilderDirection] = useState('INBOUND') // 'INBOUND', 'OUTBOUND'
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
  const [builderNotes, setBuilderNotes] = useState('Özel Entegratör Stüdyosu Test Faturası')

  // Tab 3: Outbound Invoices & GİB Status Controller
  const [outboundInvoices, setOutboundInvoices] = useState([])
  const [selectedOutboundId, setSelectedOutboundId] = useState('')
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [simReasonNote, setSimReasonNote] = useState('')

  // XML / Detail Preview Modal
  const [previewModalOpen, setPreviewModalOpen] = useState(false)
  const [previewData, setPreviewData] = useState(null)

  // 1. Initial Data Fetching
  const loadInitialData = useCallback(async () => {
    setLoading(true)
    try {
      // 1. Fetch Receipts with Lines
      const { data: rcptData } = await db
        .from('purchase_receipts')
        .select('*')
        .is('deleted_at', null)
        .order('delivered_on', { ascending: false })
        .limit(40)

      const fetchedReceipts = rcptData || []
      setReceipts(fetchedReceipts)

      // Fetch Lines for all receipts
      const rcptIds = fetchedReceipts.map((r) => r.id)
      if (rcptIds.length > 0) {
        const { data: linesData } = await db
          .from('purchase_receipt_lines')
          .select('*')
          .is('deleted_at', null)
          .in('receipt_id', rcptIds)
          .order('line_no', { ascending: true })

        const lMap = {}
        ;(linesData || []).forEach((l) => {
          if (!lMap[l.receipt_id]) lMap[l.receipt_id] = []
          lMap[l.receipt_id].push(l)
        })
        setReceiptLinesMap(lMap)
      }

      // 2. Fetch Suppliers
      const { data: suppData } = await db
        .from('suppliers')
        .select('id, name, vergi_no, tc_no, vergi_dairesi, adres, cari_kodu, active')
        .is('deleted_at', null)
        .order('name', { ascending: true })

      setSuppliers(suppData || [])

      // 3. Fetch Contracts for receipts
      const supplierIds = [...new Set(fetchedReceipts.map((r) => r.supplier_id).filter(Boolean))]
      if (supplierIds.length > 0) {
        const { data: contractsData } = await db
          .from('contracts')
          .select('*')
          .in('supplier_id', supplierIds)
          .is('deleted_at', null)

        const cMap = {}
        ;(contractsData || []).forEach((c) => {
          cMap[c.supplier_id] = c
        })
        setReceiptContractsMap(cMap)
      }

      // 4. Fetch Outbound Invoices
      const { data: outData } = await db
        .from('e_invoices')
        .select('*')
        .eq('direction', 'OUTBOUND')
        .order('created_at', { ascending: false })
        .limit(50)

      setOutboundInvoices(outData || [])
      if (outData && outData.length > 0 && !selectedOutboundId) {
        setSelectedOutboundId(outData[0].id)
      }

      // 5. Fetch Branches
      const { data: settingsRow } = await db
        .from('settings')
        .select('value')
        .eq('key', 'company_tree')
        .single()

      if (settingsRow?.value) {
        const bList = []
        const walk = (nodes) => {
          for (const n of nodes || []) {
            if (n.type === 'sube' || n.type === 'anadepo' || n.type === 'mutfak') {
              bList.push({ id: n.id, name: n.name, type: n.type })
            }
            if (n.children) walk(n.children)
          }
        }
        walk(Array.isArray(settingsRow.value) ? settingsRow.value : [settingsRow.value])
        setBranches(bList)
      }
    } catch (err) {
      console.error('IntegratorStudio load error:', err)
      toast('Entegratör verileri yüklenirken hata oluştu', 'error')
    } finally {
      setLoading(false)
    }
  }, [toast, selectedOutboundId])

  useEffect(() => {
    loadInitialData()
  }, [])

  // Filtered Receipts
  const filteredReceipts = useMemo(() => {
    return receipts.filter((r) => {
      if (selectedBranchFilter !== 'ALL' && r.branch_id !== selectedBranchFilter) {
        return false
      }
      if (!receiptSearchQuery) return true
      const q = receiptSearchQuery.toLowerCase()
      return (
        (r.supplier_name && r.supplier_name.toLowerCase().includes(q)) ||
        (r.receipt_no && r.receipt_no.toLowerCase().includes(q)) ||
        (r.doc_no && r.doc_no.toLowerCase().includes(q)) ||
        (r.branch_name && r.branch_name.toLowerCase().includes(q))
      )
    })
  }, [receipts, selectedBranchFilter, receiptSearchQuery])

  // Selected Outbound Invoice
  const activeOutboundInvoice = useMemo(() => {
    return outboundInvoices.find((inv) => inv.id === selectedOutboundId) || outboundInvoices[0] || null
  }, [outboundInvoices, selectedOutboundId])

  // Builder Totals Calculation
  const builderCalculatedTotals = useMemo(() => {
    return calculateInvoiceTotals(builderLines, 0, 0)
  }, [builderLines])

  // Handle Supplier Selection in Builder
  const handleSelectSupplierForBuilder = (suppId) => {
    setSelectedSupplierId(suppId)
    const supp = suppliers.find((s) => s.id === suppId)
    if (supp) {
      setBuilderSupplierInfo({
        title: supp.name || 'Tedarikçi Ünvanı',
        vkn: supp.vergi_no || supp.tc_no || '1111111111',
        taxOffice: supp.vergi_dairesi || 'Merkez',
        address: supp.adres || 'Tedarikçi Adresi',
      })
    }
  }

  // -------------------------------------------------------------
  // ACTION: Generate Invoices From Shipment / Purchase Receipt
  // Scenario Types: 'EXACT', 'SHORTAGE', 'SURPLUS', 'PRICE_OVER', 'TAX_MISMATCH'
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
          // Invoiced quantity is higher than received (-25% shortage in physical receipt)
          qty = Math.round(qty * 1.333 * 100) / 100
        } else if (scenarioType === 'SURPLUS') {
          // Invoiced quantity is less than received (+30% surplus in physical receipt)
          qty = Math.max(1, Math.round(qty * 0.7 * 100) / 100)
        } else if (scenarioType === 'PRICE_OVER') {
          // Supplier increased unit price by +25% (Contract & PO price violation!)
          unitPrice = Math.round(unitPrice * 1.25 * 100) / 100
        } else if (scenarioType === 'TAX_MISMATCH' && idx === 0) {
          // Change KDV rate on first line
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
        status_code: EINVOICE_STATUS.DELIVERED_TO_RECEIVER, // 1200 - Gelen Kutusunda bekliyor
        status_description: 'Alıcıya Ulaştı (3-Way Matching Bekliyor)',
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
        is_matched: false,
        raw_json: {
          generatedByStudio: true,
          scenarioType,
          sourceReceiptId: receipt.id,
          sourceReceiptNo: docReference,
          contractNo: activeContract?.contract_no || null,
        },
      }

      // Generate UBL XML
      invoicePayload.ubl_xml = generateUBLXML({ ...invoicePayload, lines: invoiceLines })

      // Insert into e_invoices
      const { data: savedArr, error: insErr } = await db
        .from('e_invoices')
        .insert(invoicePayload)
        .select('*')

      if (insErr) throw insErr
      const savedInvoice = Array.isArray(savedArr) ? savedArr[0] : (savedArr || invoicePayload)
      const targetInvoiceId = savedInvoice?.id || invoiceEttn

      // Insert Lines
      if (targetInvoiceId) {
        const linePayloads = invoiceLines.map((l) => ({
          ...l,
          invoice_id: targetInvoiceId,
        }))
        const { error: lineInsErr } = await db.from('e_invoice_lines').insert(linePayloads)
        if (lineInsErr) {
          console.error('e_invoice_lines insert error:', lineInsErr)
        }

        // Add log
        await db.from('e_invoice_matching_logs').insert({
          invoice_id: targetInvoiceId,
          receipt_id: receipt.id,
          supplier_id: receipt.supplier_id,
          matching_type: `STUDIO_GENERATED_${scenarioType}`,
          notes: `Entegratör Stüdyosu tarafından ${scenarioType} senaryosu ile fatura (${invoiceNumber}) kesildi.`,
          performed_by: 'INTEGRATOR_STUDIO',
        })
      }

      toast(
        `✅ ${invoiceNumber} numaralı e-Fatura (${scenarioType}) üretildi ve SuitableRMS Gelen Kutusuna aktarıldı!`,
        'success'
      )
    } catch (err) {
      console.error('Invoice generation error:', err)
      toast(`Fatura üretilemedi: ${err.message}`, 'error')
    } finally {
      setActionLoadingId(null)
    }
  }

  // -------------------------------------------------------------
  // ACTION: Freeform Invoice / Despatch Submission
  // -------------------------------------------------------------
  const handleSendFreeformDocument = async () => {
    setLoading(true)
    try {
      const ettn = generateETTN()
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
        ettn,
        invoice_number: docNumber,
        invoice_type: isDespatch ? 'SEVK_IRSALIYESI' : builderInvoiceType,
        profile_id: isDespatch ? 'TEMELIRSALIYE' : builderProfileId,
        issue_date: issueDate,
        issue_time: issueTime,
        status_code: builderDirection === 'INBOUND' ? 1200 : 1100,
        status_description:
          builderDirection === 'INBOUND'
            ? 'Alıcıya Ulaştı (Serbest Giriş)'
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
        raw_json: {
          freeformBuilder: true,
          docType: builderDocType,
        },
      }

      docPayload.ubl_xml = isDespatch
        ? generateDespatchUBLXML({ ...docPayload, lines: formattedLines })
        : generateUBLXML({ ...docPayload, lines: formattedLines })

      const { data: savedArr, error: insErr } = await db
        .from('e_invoices')
        .insert(docPayload)
        .select('*')

      if (insErr) throw insErr
      const savedDoc = Array.isArray(savedArr) ? savedArr[0] : (savedArr || docPayload)
      const targetDocId = savedDoc?.id || docEttn

      if (targetDocId) {
        const linesData = formattedLines.map((l) => ({
          ...l,
          invoice_id: targetDocId,
        }))
        const { error: lineInsErr } = await db.from('e_invoice_lines').insert(linesData)
        if (lineInsErr) {
          console.error('e_invoice_lines insert error in freeform:', lineInsErr)
        }
      }

      toast(`✅ ${docNumber} numaralı belge başarıyla üretildi ve entegratör havuzuna yazıldı!`, 'success')
      loadInitialData()
    } catch (err) {
      console.error('Freeform build error:', err)
      toast(`Belge üretilemedi: ${err.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  // -------------------------------------------------------------
  // ACTION: Update Outbound Invoice GİB Status (Simulator)
  // -------------------------------------------------------------
  const handleUpdateOutboundStatus = async (targetStatusCode, responseCode = null) => {
    if (!activeOutboundInvoice) return
    setUpdatingStatus(true)
    try {
      const meta = getStatusMeta(targetStatusCode)
      const nowIso = new Date().toISOString()

      const updateData = {
        status_code: targetStatusCode,
        status_description: meta.label,
        updated_at: nowIso,
      }

      if (responseCode) {
        updateData.response_code = responseCode
        updateData.response_date = nowIso
        updateData.response_reason = simReasonNote || `${responseCode} uygulama yanıtı simüle edildi.`
      }

      const { error: updErr } = await db
        .from('e_invoices')
        .update(updateData)
        .eq('id', activeOutboundInvoice.id)

      if (updErr) throw updErr

      await db.from('e_invoice_matching_logs').insert({
        invoice_id: activeOutboundInvoice.id,
        matching_type: 'GIB_STATUS_SIMULATION',
        notes: `Entegratör Konsolundan GİB durum kodu ${targetStatusCode} (${meta.label}) olarak güncellendi. ${responseCode ? `Yanıt: ${responseCode}` : ''}`,
        performed_by: 'INTEGRATOR_STUDIO',
      })

      toast(`✅ Belge durumu "${meta.label}" (${targetStatusCode}) olarak güncellendi.`, 'success')
      setSimReasonNote('')
      loadInitialData()
    } catch (err) {
      console.error('Status update error:', err)
      toast(`Durum güncellenemedi: ${err.message}`, 'error')
    } finally {
      setUpdatingStatus(false)
    }
  }

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
              width: 46,
              height: 46,
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
                GİB BTRANS Çevrimiçi (Sandbox)
              </span>
            </div>
            <div style={{ fontSize: '.82rem', color: '#8b949e', marginTop: 2 }}>
              SuitableRMS Restoran Grubu UBL-TR 2.1 E-Dönüşüm, İrsaliye ve Tedarikçi Fatura Simülasyon Merkezi
            </div>
          </div>
        </div>

        {/* Quick Nav Button to SuitableRMS Invoices */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
              transition: 'all .2s ease',
            }}
          >
            <i className="fa-solid fa-arrow-left" />
            SuitableRMS E-Fatura Ekranına Dön
          </Link>
        </div>
      </div>

      {/* Main Content Container */}
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '24px 24px 0' }}>
        {/* Top Summary Stat Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: 12,
              padding: '16px 20px',
              border: '1px solid var(--border)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Açık Mal Kabul Sevkiyatları
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-strong)', marginTop: 4 }}>
              {receipts.length}
            </div>
            <div style={{ fontSize: '.75rem', color: '#10b981', marginTop: 2 }}>
              <i className="fa-solid fa-truck-ramp-box" style={{ marginRight: 4 }} />
              Fatura üretimine hazır teslimat fişleri
            </div>
          </div>

          <div
            style={{
              background: 'var(--surface)',
              borderRadius: 12,
              padding: '16px 20px',
              border: '1px solid var(--border)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Giden RMS Belgeleri (GİB)
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#f5a623', marginTop: 4 }}>
              {outboundInvoices.length}
            </div>
            <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
              <i className="fa-solid fa-paper-plane" style={{ marginRight: 4 }} />
              E-Fatura, Sevk İrsaliyesi ve İadeler
            </div>
          </div>

          <div
            style={{
              background: 'var(--surface)',
              borderRadius: 12,
              padding: '16px 20px',
              border: '1px solid var(--border)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Kayıtlı Tedarikçiler
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-strong)', marginTop: 4 }}>
              {suppliers.length}
            </div>
            <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
              <i className="fa-solid fa-users" style={{ marginRight: 4 }} />
              Sözleşmeli & Cari Hesaplar
            </div>
          </div>

          <div
            style={{
              background: 'var(--surface)',
              borderRadius: 12,
              padding: '16px 20px',
              border: '1px solid var(--border)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Entegratör UBL Şeması
            </div>
            <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#38bdf8', marginTop: 4 }}>
              UBL-TR 2.1 Standardı
            </div>
            <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
              <i className="fa-solid fa-shield-halved" style={{ marginRight: 4 }} />
              GİB Schematron & XSLT Doğrulamalı
            </div>
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
            marginBottom: 24,
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
                Bu kutu işaretlendiğinde, stüdyodaki <strong>tüm fatura üretme modellerinde</strong> (Birebir, Eksik Teslimat, Fazla Teslimat, Fiyat Artışı/Sözleşme İhlali, KDV Uyuşmazlığı ve Serbest Belge) ürün adları gerçek tedarikçi kısaltmalarına dönüştürülür (Örn: <em>"Cheddar Peyniri"</em> ➔ <strong style={{ color: '#9333ea' }}>"çedar peynr"</strong>, <em>"Hamburger Köftesi"</em> ➔ <strong style={{ color: '#9333ea' }}>"Hamb. Koftesi (120gr)"</strong>, <em>"Patates (dondurulmuş)"</em> ➔ <strong style={{ color: '#9333ea' }}>"Donuk Patats 9x9"</strong>). Böylece <strong>Miktar & Fiyat Tekilliği, Fonetik Analiz ve Tedarikçi Eşleme Hafızası</strong> uçtan uca test edilebilir.
              </div>
            </div>
          </label>

          {simulateDifferentNames && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'center' }}>
              <span
                style={{
                  fontSize: '.75rem',
                  fontWeight: 700,
                  color: '#9333ea',
                  background: 'rgba(147,51,234,0.12)',
                  border: '1px solid rgba(147,51,234,0.25)',
                  padding: '6px 12px',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  whiteSpace: 'nowrap',
                }}
              >
                <i className="fa-solid fa-brain" />
                Akıllı 3-Way Test Modu Devrede
              </span>
            </div>
          )}
        </div>

        {/* Tab Navigation Menu */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            borderBottom: '2px solid var(--border)',
            marginBottom: 24,
            overflowX: 'auto',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('shipment-generator')}
            style={{
              padding: '12px 20px',
              border: 'none',
              background: 'transparent',
              borderBottom: activeTab === 'shipment-generator' ? '3px solid #f5a623' : '3px solid transparent',
              color: activeTab === 'shipment-generator' ? '#f5a623' : 'var(--text-muted)',
              fontWeight: 800,
              fontSize: '.92rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: -2,
            }}
          >
            <i className="fa-solid fa-truck-ramp-box" />
            1. Mal Kabul Sevkiyatlarından Fatura Üretici
            <span
              style={{
                fontSize: '.72rem',
                padding: '2px 7px',
                borderRadius: 10,
                background: activeTab === 'shipment-generator' ? '#f5a623' : 'var(--surface-2)',
                color: activeTab === 'shipment-generator' ? '#000' : 'var(--text-muted)',
                fontWeight: 800,
              }}
            >
              {receipts.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('freeform-builder')}
            style={{
              padding: '12px 20px',
              border: 'none',
              background: 'transparent',
              borderBottom: activeTab === 'freeform-builder' ? '3px solid #f5a623' : '3px solid transparent',
              color: activeTab === 'freeform-builder' ? '#f5a623' : 'var(--text-muted)',
              fontWeight: 800,
              fontSize: '.92rem',
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
            onClick={() => setActiveTab('rms-outbound')}
            style={{
              padding: '12px 20px',
              border: 'none',
              background: 'transparent',
              borderBottom: activeTab === 'rms-outbound' ? '3px solid #f5a623' : '3px solid transparent',
              color: activeTab === 'rms-outbound' ? '#f5a623' : 'var(--text-muted)',
              fontWeight: 800,
              fontSize: '.92rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: -2,
            }}
          >
            <i className="fa-solid fa-tower-broadcast" />
            3. RMS Giden İstekler & GİB Durum Yöneticisi
            <span
              style={{
                fontSize: '.72rem',
                padding: '2px 7px',
                borderRadius: 10,
                background: activeTab === 'rms-outbound' ? '#f5a623' : 'var(--surface-2)',
                color: activeTab === 'rms-outbound' ? '#000' : 'var(--text-muted)',
                fontWeight: 800,
              }}
            >
              {outboundInvoices.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('transfer-hub')}
            style={{
              padding: '12px 20px',
              border: 'none',
              background: 'transparent',
              borderBottom: activeTab === 'transfer-hub' ? '3px solid #f5a623' : '3px solid transparent',
              color: activeTab === 'transfer-hub' ? '#f5a623' : 'var(--text-muted)',
              fontWeight: 800,
              fontSize: '.92rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: -2,
            }}
          >
            <i className="fa-solid fa-arrow-right-arrow-left" />
            4. Şirketler Arası & Dahili Transfer Hub
          </button>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* TAB 1: Mal Kabul Sevkiyatlarından Fatura Üretici */}
        {/* ------------------------------------------------------------- */}
        {activeTab === 'shipment-generator' && (
          <div>
            {/* Filter Bar */}
            <div
              style={{
                background: 'var(--surface)',
                borderRadius: 12,
                padding: '14px 18px',
                border: '1px solid var(--border)',
                marginBottom: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 14,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 280 }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <i
                    className="fa-solid fa-magnifying-glass"
                    style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
                  />
                  <input
                    type="text"
                    placeholder="Tedarikçi adı, irsaliye no veya şube ara..."
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

              <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>
                Toplam <strong>{filteredReceipts.length}</strong> teslimat irsaliyesi listeleniyor
              </div>
            </div>

            {/* List of Receipts */}
            {loading ? (
              <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
                <i className="fa-solid fa-spinner fa-spin fa-2x" style={{ marginBottom: 12, color: '#f5a623' }} />
                <div>Sevkiyat irsaliyeleri yükleniyor...</div>
              </div>
            ) : filteredReceipts.length === 0 ? (
              <div
                style={{
                  background: 'var(--surface)',
                  borderRadius: 12,
                  padding: 40,
                  textAlign: 'center',
                  border: '1px solid var(--border)',
                  color: 'var(--text-muted)',
                }}
              >
                <i className="fa-solid fa-box-open fa-2x" style={{ marginBottom: 12 }} />
                <div style={{ fontWeight: 700, fontSize: '.95rem' }}>Eşleşen Mal Kabul İrsaliyesi Bulunamadı</div>
                <div style={{ fontSize: '.8rem', marginTop: 4 }}>
                  Filtreleri temizleyebilir veya Satınalma / Mal Kabul modülünden yeni teslimat fişi oluşturabilirsiniz.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
                        padding: 18,
                        boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 14,
                      }}
                    >
                      {/* Top Header Row */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
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

                            {activeContract ? (
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
                            ) : (
                              <span
                                style={{
                                  fontSize: '.72rem',
                                  padding: '2px 8px',
                                  borderRadius: 6,
                                  background: 'rgba(239,68,68,0.08)',
                                  color: '#ef4444',
                                  fontWeight: 600,
                                }}
                              >
                                Sözleşmesiz
                              </span>
                            )}
                          </div>

                          <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginTop: 4, display: 'flex', gap: 16 }}>
                            <span>
                              <i className="fa-solid fa-calendar-day" style={{ marginRight: 4 }} />
                              Kabul Tarihi: <strong>{receipt.delivered_on || '-'}</strong>
                            </span>
                            <span>
                              <i className="fa-solid fa-store" style={{ marginRight: 4 }} />
                              Şube: <strong>{receipt.branch_name || 'Ana Depo'}</strong>
                            </span>
                            <span>
                              <i className="fa-solid fa-boxes-stacked" style={{ marginRight: 4 }} />
                              Kalem Sayısı: <strong>{lines.length}</strong>
                            </span>
                          </div>
                        </div>

                        {/* Total Amount Badge */}
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>İrsaliye Tutar Değeri</div>
                          <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#10b981' }}>
                            {totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                          </div>
                        </div>
                      </div>

                      {/* Items Preview Chips */}
                      {lines.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {lines.slice(0, 5).map((l, i) => (
                            <span
                              key={l.id || i}
                              style={{
                                fontSize: '.72rem',
                                padding: '3px 8px',
                                borderRadius: 6,
                                background: 'var(--surface-2)',
                                color: 'var(--text-strong)',
                                border: '1px solid var(--border)',
                              }}
                            >
                              {l.item_name} ({l.received_qty} {l.unit || 'Birim'})
                            </span>
                          ))}
                          {lines.length > 5 && (
                            <span style={{ fontSize: '.72rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
                              +{lines.length - 5} diğer kalem
                            </span>
                          )}
                        </div>
                      )}

                      {/* Action Buttons Toolbar for 5 Test Scenarios */}
                      <div
                        style={{
                          borderTop: '1px solid var(--border)',
                          paddingTop: 12,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: 10,
                        }}
                      >
                        <div style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                          Entegratör Fatura Üretim Senaryoları:
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {/* 1. Tam Uyumlu Fatura */}
                          <button
                            type="button"
                            title="İrsaliye ve sözleşme ile birebir tam uyumlu fatura üretir (%100 3-Way Eşleşir)"
                            disabled={actionLoadingId === `${receipt.id}-EXACT`}
                            onClick={() => handleGenerateInvoiceFromReceipt(receipt, 'EXACT')}
                            style={{
                              padding: '6px 12px',
                              borderRadius: 8,
                              border: '1px solid #10b981',
                              background: 'rgba(16,185,129,0.12)',
                              color: '#10b981',
                              fontWeight: 800,
                              fontSize: '.75rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <i className="fa-solid fa-circle-check" />
                            {actionLoadingId === `${receipt.id}-EXACT` ? 'Kesiliyor...' : '🟢 Tam Uyumlu Fatura Kes'}
                          </button>

                          {/* 2. Eksik Miktar Faturası */}
                          <button
                            type="button"
                            title="Faturada teslim alınandan %25 fazla miktar yazılır (Mal kabulde eksik teslimat tespit edilir)"
                            disabled={actionLoadingId === `${receipt.id}-SHORTAGE`}
                            onClick={() => handleGenerateInvoiceFromReceipt(receipt, 'SHORTAGE')}
                            style={{
                              padding: '6px 12px',
                              borderRadius: 8,
                              border: '1px solid #f59e0b',
                              background: 'rgba(245,158,11,0.12)',
                              color: '#f59e0b',
                              fontWeight: 800,
                              fontSize: '.75rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <i className="fa-solid fa-box-open" />
                            {actionLoadingId === `${receipt.id}-SHORTAGE` ? 'Kesiliyor...' : '🟡 Eksik Miktar Faturası Kes'}
                          </button>

                          {/* 3. Fazla Miktar Faturası */}
                          <button
                            type="button"
                            title="Faturada teslim alınandan %30 daha az miktar yazılır (Fazla teslimat)"
                            disabled={actionLoadingId === `${receipt.id}-SURPLUS`}
                            onClick={() => handleGenerateInvoiceFromReceipt(receipt, 'SURPLUS')}
                            style={{
                              padding: '6px 12px',
                              borderRadius: 8,
                              border: '1px solid #38bdf8',
                              background: 'rgba(56,189,248,0.12)',
                              color: '#38bdf8',
                              fontWeight: 800,
                              fontSize: '.75rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <i className="fa-solid fa-dolly" />
                            {actionLoadingId === `${receipt.id}-SURPLUS` ? 'Kesiliyor...' : '🔵 Fazla Miktar Faturası Kes'}
                          </button>

                          {/* 4. Fiyat Farklı / Zamlı Fatura Kes (Sözleşme İhlali) */}
                          <button
                            type="button"
                            title="Sözleşme ve sipariş birim fiyatına +%25 zam ekler (Sözleşme fiyat ihlali tetikler ve onay kilitlenir)"
                            disabled={actionLoadingId === `${receipt.id}-PRICE_OVER`}
                            onClick={() => handleGenerateInvoiceFromReceipt(receipt, 'PRICE_OVER')}
                            style={{
                              padding: '6px 12px',
                              borderRadius: 8,
                              border: '1px solid #ef4444',
                              background: 'rgba(239,68,68,0.12)',
                              color: '#ef4444',
                              fontWeight: 800,
                              fontSize: '.75rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <i className="fa-solid fa-arrow-trend-up" />
                            {actionLoadingId === `${receipt.id}-PRICE_OVER` ? 'Kesiliyor...' : '🔴 Fiyat Farklı / Zamlı Fatura Kes'}
                          </button>

                          {/* 5. KDV / Kalem Uyuşmazlığı */}
                          <button
                            type="button"
                            title="KDV oranını değiştirir ve fazladan sahte kalem ekler"
                            disabled={actionLoadingId === `${receipt.id}-TAX_MISMATCH`}
                            onClick={() => handleGenerateInvoiceFromReceipt(receipt, 'TAX_MISMATCH')}
                            style={{
                              padding: '6px 12px',
                              borderRadius: 8,
                              border: '1px solid #a78bfa',
                              background: 'rgba(167,139,250,0.12)',
                              color: '#a78bfa',
                              fontWeight: 800,
                              fontSize: '.75rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <i className="fa-solid fa-percent" />
                            {actionLoadingId === `${receipt.id}-TAX_MISMATCH` ? 'Kesiliyor...' : '🟣 KDV & Kalem Uyuşmazlığı Kes'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* TAB 2: Serbest E-Fatura & E-İrsaliye Tasarımcısı */}
        {/* ------------------------------------------------------------- */}
        {activeTab === 'freeform-builder' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 20 }}>
            {/* Left Column: Form & Line Builder */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Document Header Settings Card */}
              <div
                style={{
                  background: 'var(--surface)',
                  borderRadius: 12,
                  padding: 20,
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ fontSize: '.95rem', fontWeight: 800, color: 'var(--text-strong)', marginBottom: 14 }}>
                  <i className="fa-solid fa-sliders" style={{ color: '#f5a623', marginRight: 8 }} />
                  Belge Türü ve İletim Yönü
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                      Belge Tipi
                    </label>
                    <select
                      value={builderDocType}
                      onChange={(e) => setBuilderDocType(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--app-bg)',
                        color: 'var(--text-strong)',
                        fontSize: '.85rem',
                        fontWeight: 700,
                      }}
                    >
                      <option value="INVOICE">e-Fatura (Satış / İade)</option>
                      <option value="DESPATCH">e-İrsaliye (Sevk İrsaliyesi)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                      Senaryo / Profil
                    </label>
                    <select
                      value={builderProfileId}
                      onChange={(e) => setBuilderProfileId(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--app-bg)',
                        color: 'var(--text-strong)',
                        fontSize: '.85rem',
                        fontWeight: 700,
                      }}
                    >
                      <option value="TICARIFATURA">TICARIFATURA (Kabul/Red)</option>
                      <option value="TEMELFATURA">TEMELFATURA</option>
                      <option value="EARSIVFATURA">EARSIVFATURA (B2C)</option>
                      <option value="TEMELIRSALIYE">TEMELIRSALIYE</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                      Fatura Türü
                    </label>
                    <select
                      value={builderInvoiceType}
                      onChange={(e) => setBuilderInvoiceType(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--app-bg)',
                        color: 'var(--text-strong)',
                        fontSize: '.85rem',
                        fontWeight: 700,
                      }}
                    >
                      <option value="SATIS">SATIS (Satış)</option>
                      <option value="IADE">IADE (İade)</option>
                      <option value="TEVKIFAT">TEVKIFAT</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                      Hedef Yön
                    </label>
                    <select
                      value={builderDirection}
                      onChange={(e) => setBuilderDirection(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--app-bg)',
                        color: 'var(--text-strong)',
                        fontSize: '.85rem',
                        fontWeight: 700,
                      }}
                    >
                      <option value="INBOUND">GELEN KUTUSU (INBOUND)</option>
                      <option value="OUTBOUND">GİDEN KUTUSU (OUTBOUND)</option>
                    </select>
                  </div>
                </div>

                {/* Sender Supplier Selector */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: '.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                    Kayıtlı Tedarikçiden Bilgileri Doldur:
                  </label>
                  <select
                    value={selectedSupplierId}
                    onChange={(e) => handleSelectSupplierForBuilder(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--app-bg)',
                      color: 'var(--text-strong)',
                      fontSize: '.85rem',
                      fontWeight: 600,
                    }}
                  >
                    <option value="">-- Özel Tedarikçi Bilgisi Gir --</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} (VKN: {s.vergi_no || s.tc_no || '-'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Line Items Table Builder */}
              <div
                style={{
                  background: 'var(--surface)',
                  borderRadius: 12,
                  padding: 20,
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div style={{ fontSize: '.95rem', fontWeight: 800, color: 'var(--text-strong)' }}>
                    <i className="fa-solid fa-list-check" style={{ color: '#f5a623', marginRight: 8 }} />
                    Fatura & İrsaliye Kalemleri ({builderLines.length})
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center' }}>
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
                        padding: '6px 12px',
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
                        marginRight: 6,
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
                            item_name: 'Yeni Kalem / Hizmet',
                            item_code: '',
                            invoiced_quantity: 1,
                            unit_code: 'C62',
                            unit_price: 100.0,
                            tax_rate: 20,
                          },
                        ])
                      }}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 8,
                        border: 'none',
                        background: '#f5a623',
                        color: '#000',
                        fontWeight: 800,
                        fontSize: '.78rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <i className="fa-solid fa-plus" style={{ marginRight: 6 }} />
                      Kalem Ekle
                    </button>
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '8px 10px', textAlign: 'left' }}>Ürün / Kalem Adı</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', width: 90 }}>SKU</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', width: 80 }}>Miktar</th>
                        <th style={{ padding: '8px 10px', textAlign: 'center', width: 80 }}>Birim</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', width: 100 }}>Birim Fiyat</th>
                        <th style={{ padding: '8px 10px', textAlign: 'center', width: 80 }}>KDV %</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', width: 90 }}>Toplam</th>
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
                                style={{
                                  width: '100%',
                                  padding: '5px 8px',
                                  borderRadius: 6,
                                  border: '1px solid var(--border)',
                                  background: 'var(--app-bg)',
                                  color: 'var(--text-strong)',
                                  fontSize: '.82rem',
                                }}
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
                                style={{
                                  width: '100%',
                                  padding: '5px 8px',
                                  borderRadius: 6,
                                  border: '1px solid var(--border)',
                                  background: 'var(--app-bg)',
                                  color: 'var(--text-strong)',
                                  fontSize: '.82rem',
                                }}
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
                                style={{
                                  width: '100%',
                                  padding: '5px 8px',
                                  borderRadius: 6,
                                  border: '1px solid var(--border)',
                                  background: 'var(--app-bg)',
                                  color: 'var(--text-strong)',
                                  fontSize: '.82rem',
                                  textAlign: 'right',
                                }}
                              />
                            </td>
                            <td style={{ padding: 6 }}>
                              <select
                                value={line.unit_code}
                                onChange={(e) => {
                                  const val = e.target.value
                                  setBuilderLines((prev) => prev.map((l, i) => (i === idx ? { ...l, unit_code: val } : l)))
                                }}
                                style={{
                                  width: '100%',
                                  padding: '5px 4px',
                                  borderRadius: 6,
                                  border: '1px solid var(--border)',
                                  background: 'var(--app-bg)',
                                  color: 'var(--text-strong)',
                                  fontSize: '.82rem',
                                }}
                              >
                                {UNIT_CODES.map((u) => (
                                  <option key={u.code} value={u.code}>
                                    {u.label}
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
                                style={{
                                  width: '100%',
                                  padding: '5px 8px',
                                  borderRadius: 6,
                                  border: '1px solid var(--border)',
                                  background: 'var(--app-bg)',
                                  color: 'var(--text-strong)',
                                  fontSize: '.82rem',
                                  textAlign: 'right',
                                }}
                              />
                            </td>
                            <td style={{ padding: 6 }}>
                              <select
                                value={line.tax_rate}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0
                                  setBuilderLines((prev) => prev.map((l, i) => (i === idx ? { ...l, tax_rate: val } : l)))
                                }}
                                style={{
                                  width: '100%',
                                  padding: '5px 4px',
                                  borderRadius: 6,
                                  border: '1px solid var(--border)',
                                  background: 'var(--app-bg)',
                                  color: 'var(--text-strong)',
                                  fontSize: '.82rem',
                                }}
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
                            <td style={{ padding: 6, textAlign: 'center' }}>
                              <button
                                type="button"
                                onClick={() => setBuilderLines((prev) => prev.filter((_, i) => i !== idx))}
                                style={{
                                  border: 'none',
                                  background: 'transparent',
                                  color: '#ef4444',
                                  cursor: 'pointer',
                                  padding: 4,
                                }}
                              >
                                <i className="fa-solid fa-trash-can" />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Right Column: Live Calculations & Send Card */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div
                style={{
                  background: 'var(--surface)',
                  borderRadius: 12,
                  padding: 20,
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ fontSize: '.95rem', fontWeight: 800, color: 'var(--text-strong)', marginBottom: 14 }}>
                  <i className="fa-solid fa-receipt" style={{ color: '#10b981', marginRight: 8 }} />
                  Belge Toplam Özeti
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                    <span>Mal / Hizmet Toplamı:</span>
                    <strong style={{ color: 'var(--text-strong)' }}>
                      {builderCalculatedTotals.lineExtensionAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                    </strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                    <span>Hesaplanan KDV Toplamı:</span>
                    <strong style={{ color: '#f5a623' }}>
                      {builderCalculatedTotals.taxTotalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                    </strong>
                  </div>

                  {builderCalculatedTotals.taxSubtotals.map((ts) => (
                    <div
                      key={ts.rate}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '.75rem',
                        color: 'var(--text-muted)',
                        paddingLeft: 12,
                      }}
                    >
                      <span>Matrah (%{ts.rate}): {ts.taxableAmount.toLocaleString('tr-TR')} ₺</span>
                      <span>KDV: {ts.taxAmount.toLocaleString('tr-TR')} ₺</span>
                    </div>
                  ))}

                  <div
                    style={{
                      borderTop: '1.5px dashed var(--border)',
                      paddingTop: 10,
                      marginTop: 4,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontSize: '.95rem', fontWeight: 800, color: 'var(--text-strong)' }}>
                      Ödenecek Toplam:
                    </span>
                    <span style={{ fontSize: '1.3rem', fontWeight: 900, color: '#10b981' }}>
                      {builderCalculatedTotals.payableAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                    </span>
                  </div>
                </div>

                {/* Notes Input */}
                <div style={{ marginTop: 16 }}>
                  <label style={{ display: 'block', fontSize: '.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                    Belge Notu / GİB Açıklaması:
                  </label>
                  <textarea
                    rows={2}
                    value={builderNotes}
                    onChange={(e) => setBuilderNotes(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--app-bg)',
                      color: 'var(--text-strong)',
                      fontSize: '.82rem',
                    }}
                  />
                </div>

                {/* Send Button */}
                <button
                  type="button"
                  disabled={loading || builderLines.length === 0}
                  onClick={handleSendFreeformDocument}
                  style={{
                    width: '100%',
                    marginTop: 18,
                    padding: '12px 20px',
                    borderRadius: 10,
                    border: 'none',
                    background: 'linear-gradient(135deg, #f5a623 0%, #d97706 100%)',
                    color: '#000000',
                    fontWeight: 900,
                    fontSize: '.95rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    boxShadow: '0 4px 14px rgba(245,166,35,0.3)',
                  }}
                >
                  <i className={`fa-solid ${loading ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`} />
                  {loading ? 'Belge İletiliyor...' : 'Entegratörden Üret & Havuza Yaz'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* TAB 3: RMS Giden İstekler & GİB Durum Yöneticisi */}
        {/* ------------------------------------------------------------- */}
        {activeTab === 'rms-outbound' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Left: Outbound Invoices List */}
            <div
              style={{
                background: 'var(--surface)',
                borderRadius: 12,
                padding: 20,
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontSize: '.95rem', fontWeight: 800, color: 'var(--text-strong)' }}>
                  <i className="fa-solid fa-arrow-up-right-from-square" style={{ color: '#f5a623', marginRight: 8 }} />
                  SuitableRMS Tarafından Kesilen Giden Faturalar
                </div>
                <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
                  {outboundInvoices.length} Belge
                </span>
              </div>

              {outboundInvoices.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                  Henüz giden fatura veya transfer faturası bulunmuyor.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 600, overflowY: 'auto' }}>
                  {outboundInvoices.map((inv) => {
                    const isSelected = inv.id === selectedOutboundId
                    const meta = getStatusMeta(inv.status_code)

                    return (
                      <div
                        key={inv.id}
                        onClick={() => setSelectedOutboundId(inv.id)}
                        style={{
                          padding: '12px 14px',
                          borderRadius: 10,
                          border: `1.5px solid ${isSelected ? '#f5a623' : 'var(--border)'}`,
                          background: isSelected ? 'rgba(245,166,35,0.06)' : 'var(--app-bg)',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          transition: 'all .15s ease',
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontWeight: 800, color: 'var(--text-strong)', fontSize: '.88rem' }}>
                              {inv.invoice_number}
                            </span>
                            <span style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>
                              {inv.issue_date}
                            </span>
                          </div>
                          <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                            Alıcı: <strong>{inv.receiver_title}</strong> (VKN: {inv.receiver_vkn_tckn})
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: '.72rem',
                              padding: '3px 8px',
                              borderRadius: 12,
                              background: meta.bg,
                              color: meta.color,
                              border: `1px solid ${meta.border || meta.color}`,
                              fontWeight: 700,
                            }}
                          >
                            <i className={`fa-solid ${meta.icon}`} />
                            {meta.label}
                          </span>
                          <div style={{ fontSize: '.85rem', fontWeight: 800, color: 'var(--text-strong)', marginTop: 4 }}>
                            {Number(inv.payable_amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Right: GİB & Entegratör Status State Simulator */}
            <div
              style={{
                background: 'var(--surface)',
                borderRadius: 12,
                padding: 20,
                border: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <div style={{ fontSize: '.95rem', fontWeight: 800, color: 'var(--text-strong)' }}>
                <i className="fa-solid fa-gamepad" style={{ color: '#38bdf8', marginRight: 8 }} />
                GİB Zarf & Uygulama Yanıtı Simülatörü
              </div>

              {activeOutboundInvoice ? (
                <>
                  <div
                    style={{
                      background: 'var(--app-bg)',
                      borderRadius: 10,
                      padding: 14,
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>Seçili Belge:</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 900, color: 'var(--text-strong)', marginTop: 2 }}>
                      {activeOutboundInvoice.invoice_number} ({activeOutboundInvoice.profile_id})
                    </div>
                    <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      Mevcut Durum: <strong>{activeOutboundInvoice.status_description}</strong> ({activeOutboundInvoice.status_code})
                    </div>
                  </div>

                  {/* Quick GİB Status Buttons */}
                  <div>
                    <label style={{ display: 'block', fontSize: '.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>
                      GİB Durum Kodunu Simüle Et:
                    </label>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <button
                        type="button"
                        disabled={updatingStatus}
                        onClick={() => handleUpdateOutboundStatus(1100)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: '1px solid #38bdf8',
                          background: 'rgba(56,189,248,0.12)',
                          color: '#38bdf8',
                          fontWeight: 700,
                          fontSize: '.78rem',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <i className="fa-solid fa-paper-plane" style={{ marginRight: 6 }} />
                        1100: Entegratöre Gönderildi
                      </button>

                      <button
                        type="button"
                        disabled={updatingStatus}
                        onClick={() => handleUpdateOutboundStatus(1120)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: '1px solid #fb923c',
                          background: 'rgba(251,146,60,0.12)',
                          color: '#fb923c',
                          fontWeight: 700,
                          fontSize: '.78rem',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <i className="fa-solid fa-building-columns" style={{ marginRight: 6 }} />
                        1120: GİB'e İletildi
                      </button>

                      <button
                        type="button"
                        disabled={updatingStatus}
                        onClick={() => handleUpdateOutboundStatus(1163)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: '1px solid #a78bfa',
                          background: 'rgba(167,139,250,0.12)',
                          color: '#a78bfa',
                          fontWeight: 700,
                          fontSize: '.78rem',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <i className="fa-solid fa-check-double" style={{ marginRight: 6 }} />
                        1163: GİB'de İşlendi (Zarf Başarılı)
                      </button>

                      <button
                        type="button"
                        disabled={updatingStatus}
                        onClick={() => handleUpdateOutboundStatus(1200)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: '1px solid #22d3ee',
                          background: 'rgba(34,211,238,0.12)',
                          color: '#22d3ee',
                          fontWeight: 700,
                          fontSize: '.78rem',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <i className="fa-solid fa-inbox" style={{ marginRight: 6 }} />
                        1200: Alıcıya Ulaştı
                      </button>

                      <button
                        type="button"
                        disabled={updatingStatus}
                        onClick={() => handleUpdateOutboundStatus(1300, 'KABUL')}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: '1px solid #10b981',
                          background: 'rgba(16,185,129,0.12)',
                          color: '#10b981',
                          fontWeight: 700,
                          fontSize: '.78rem',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <i className="fa-solid fa-circle-check" style={{ marginRight: 6 }} />
                        1300: Alıcı KABUL Yanıtı Verdi
                      </button>

                      <button
                        type="button"
                        disabled={updatingStatus}
                        onClick={() => handleUpdateOutboundStatus(1301, 'RED')}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: '1px solid #ef4444',
                          background: 'rgba(239,68,68,0.12)',
                          color: '#ef4444',
                          fontWeight: 700,
                          fontSize: '.78rem',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <i className="fa-solid fa-circle-xmark" style={{ marginRight: 6 }} />
                        1301: Alıcı RED Yanıtı Verdi
                      </button>
                    </div>
                  </div>

                  {/* Custom Response Note */}
                  <div>
                    <label style={{ display: 'block', fontSize: '.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                      Ticari Uygulama Yanıtı Açıklaması / Red Gerekçesi (İsteğe Bağlı):
                    </label>
                    <input
                      type="text"
                      placeholder="Mal kabulde tespit edilen eksik teslimat nedeniyle reddedilmiştir..."
                      value={simReasonNote}
                      onChange={(e) => setSimReasonNote(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--app-bg)',
                        color: 'var(--text-strong)',
                        fontSize: '.82rem',
                      }}
                    />
                  </div>
                </>
              ) : (
                <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>
                  Lütfen sol listeden durumunu değiştirmek istediğiniz giden faturayı seçin.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* TAB 4: Şirketler Arası & Dahili Transfer Hub */}
        {/* ------------------------------------------------------------- */}
        {activeTab === 'transfer-hub' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Card 1: Intra-Company (Same VKN) -> e-Despatch Only */}
            <div
              style={{
                background: 'var(--surface)',
                borderRadius: 12,
                padding: 24,
                border: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 16,
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: 'rgba(56,189,248,0.15)',
                      color: '#38bdf8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.1rem',
                    }}
                  >
                    <i className="fa-solid fa-truck" />
                  </div>
                  <div>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-strong)' }}>
                      Aynı Şirket İçi Transfer (Aynı VKN)
                    </div>
                    <div style={{ fontSize: '.78rem', color: '#38bdf8', fontWeight: 700 }}>
                      Yalnızca e-İrsaliye (Sevk İrsaliyesi) Üretilir
                    </div>
                  </div>
                </div>

                <p style={{ fontSize: '.83rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Merkez Ana Depo ile Beşiktaş Şubesi gibi aynı Vergi Kimlik Numarasına (VKN) sahip düğümler arası transferlerde vergi mevzuatı gereği fatura kesilmez. Yalnızca UBL-TR 2.1 standardında <strong>e-İrsaliye (Sevk İrsaliyesi)</strong> oluşturulur.
                </p>
              </div>

              <button
                type="button"
                disabled={loading}
                onClick={async () => {
                  setLoading(true)
                  try {
                    const res = await interCompanyTransferService.simulateIntraCompanyTransferDespatch()
                    if (res.success) {
                      toast(`✅ ${res.message}`, 'success')
                      loadInitialData()
                    } else {
                      toast(`Hata: ${res.error}`, 'error')
                    }
                  } finally {
                    setLoading(false)
                  }
                }}
                style={{
                  padding: '12px 18px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#38bdf8',
                  color: '#000000',
                  fontWeight: 900,
                  fontSize: '.88rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <i className="fa-solid fa-play" />
                Dahili Transfer e-İrsaliyesi Simüle Et (Aynı VKN)
              </button>
            </div>

            {/* Card 2: Inter-Company (Different VKN) -> e-Invoice + e-Despatch */}
            <div
              style={{
                background: 'var(--surface)',
                borderRadius: 12,
                padding: 24,
                border: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 16,
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: 'rgba(245,166,35,0.15)',
                      color: '#f5a623',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.1rem',
                    }}
                  >
                    <i className="fa-solid fa-file-invoice-dollar" />
                  </div>
                  <div>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-strong)' }}>
                      Şirketler Arası Transfer (Farklı VKN)
                    </div>
                    <div style={{ fontSize: '.78rem', color: '#f5a623', fontWeight: 700 }}>
                      Hem e-Fatura Hem e-İrsaliye Otomatik Üretilir
                    </div>
                  </div>
                </div>

                <p style={{ fontSize: '.83rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Lojistik A.Ş. (VKN: 1234567890) ile Kadıköy Restorancılık Ltd. (VKN: 9876543210) gibi farklı tüzel kişilikler arasındaki transferlerde maliyet bedeli üzerinden hem <strong>e-Fatura</strong> hem de <strong>e-İrsaliye</strong> üretilerek alıcı tüzel kişiliğin gelen kutusuna ayna fatura olarak işlenir.
                </p>
              </div>

              <button
                type="button"
                disabled={loading}
                onClick={async () => {
                  setLoading(true)
                  try {
                    const res = await interCompanyTransferService.simulateInterCompanyTransferInvoice()
                    if (res.success) {
                      toast(`✅ ${res.message}`, 'success')
                      loadInitialData()
                    } else {
                      toast(`Hata: ${res.error}`, 'error')
                    }
                  } finally {
                    setLoading(false)
                  }
                }}
                style={{
                  padding: '12px 18px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'linear-gradient(135deg, #f5a623 0%, #d97706 100%)',
                  color: '#000000',
                  fontWeight: 900,
                  fontSize: '.88rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <i className="fa-solid fa-wand-magic-sparkles" />
                Şirketler Arası e-Fatura & İrsaliye Simüle Et (Farklı VKN)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
