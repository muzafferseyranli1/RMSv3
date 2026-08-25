import { IntegratorAdapter } from './integratorAdapter.js'
import { EINVOICE_STATUS, EINVOICE_STATUS_META } from './types.js'
import { generateETTN, generateInvoiceNumber, calculateInvoiceTotals, generateUBLXML } from './coreUblGenerator.js'
import { db } from '../db.js'

// RMS Gerçek Veritabanından Dinamik Tedarikçi Çekme Yardımcısı
export async function getRealRmsSuppliers() {
  try {
    const { data } = await db
      .from('suppliers')
      .select('*')
      .eq('active', true)
      .is('deleted_at', null)
    if (data && data.length > 0) return data
  } catch (e) {
    console.warn('Tedarikçi tablosu çekilemedi:', e)
  }
  return []
}

// RMS Gerçek Veritabanından Tüzel Kişilik / Şirket Ağacı Düğümlerini Çekme Yardımcısı
export async function getRealRmsCompanyEntities() {
  try {
    const { data } = await db.from('company_nodes').select('*')
    if (data && data.length > 0) return data
  } catch (e) {
    console.warn('Şirket düğümleri çekilemedi:', e)
  }
  return []
}

// RMS Gerçek Veritabanından Stok Kalemlerini Çekme Yardımcısı
export async function getRealRmsStockItems() {
  try {
    const { data } = await db.from('stock_items').select('*').limit(20)
    if (data && data.length > 0) return data
  } catch (e) {
    console.warn('Stok kalemleri çekilemedi:', e)
  }
  return []
}

export const MOCK_SUPPLIERS = []

export class MockIntegratorAdapter extends IntegratorAdapter {
  constructor(config = {}) {
    super(config)
    this.providerName = 'mock'
  }

  /**
   * Giden E-Faturayı Sisteme Gönderme Simülasyonu
   */
  async sendInvoice(invoiceData) {
    const ettn = invoiceData.ettn || generateETTN()
    const invoiceNumber = invoiceData.invoice_number || generateInvoiceNumber('RMS', new Date().getFullYear(), Math.floor(Math.random() * 90000) + 10000)
    const xml = invoiceData.ubl_xml || generateUBLXML({ ...invoiceData, ettn, invoice_number: invoiceNumber })

    // Simulate async network delay (200ms)
    await new Promise((resolve) => setTimeout(resolve, 200))

    return {
      success: true,
      ettn,
      invoiceNumber,
      statusCode: EINVOICE_STATUS.DELIVERED_TO_RECEIVER, // 1200
      statusDescription: 'GİB Zarfı Onaylandı, Alıcı Posta Kutusuna Başarıyla İletildi (1200)',
      rawResponse: {
        provider: 'SuitableRMS Mock Sandbox Integrator',
        timestamp: new Date().toISOString(),
        envelopeId: generateETTN(),
        gibStatusCode: 1200,
        gibMessage: 'Zarf GİB tarafından başarıyla işlendi ve alıcıya teslim edildi.',
      },
    }
  }

  /**
   * Fatura Durumu Sorgulama
   */
  async getInvoiceStatus(ettn) {
    await new Promise((resolve) => setTimeout(resolve, 150))
    return {
      ettn,
      statusCode: EINVOICE_STATUS.ACCEPTED,
      statusDescription: 'Kabul Edildi (Onaylandı - 1300)',
      responseCode: 'KABUL',
      responseReason: 'Mükellef tarafından ticari fatura onaylanmıştır.',
    }
  }

  /**
   * Gelen E-Faturaları Çekme (Simülasyon)
   */
  async fetchInboundInvoices(params = {}) {
    const limit = params.limit || 5
    const results = []

    for (let i = 0; i < limit; i++) {
      const generated = await this.generateSimulatedInboundInvoice('MATCHED')
      if (generated) results.push(generated)
    }

    return results
  }

  /**
   * Ticari Fatura Kabul / Red Uygulama Yanıtı Gönderme
   */
  async sendCommercialResponse(ettn, responseType, reason = '') {
    await new Promise((resolve) => setTimeout(resolve, 300))
    const responseEttn = generateETTN()

    return {
      success: true,
      responseEttn,
      message: `Ticari Fatura Uygulama Yanıtı (${responseType}) GİB sistemine başarıyla iletildi.`,
      status: 'SUCCESS',
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * XML İndirme
   */
  async getInvoiceXml(ettn) {
    const { data } = await db.from('e_invoices').select('ubl_xml').eq('ettn', ettn).limit(1)
    if (data && data[0]?.ubl_xml) {
      return data[0].ubl_xml
    }
    return ''
  }

  /**
   * VKN/TCKN Mükellef Sorgulama
   */
  async checkTaxPayer(vknTckn) {
    await new Promise((resolve) => setTimeout(resolve, 150))
    const suppliers = await getRealRmsSuppliers()
    const supplier = suppliers.find((s) => (s.vergi_no && String(s.vergi_no).trim() === String(vknTckn).trim()))
    if (supplier) {
      return {
        isEInvoiceUser: true,
        title: supplier.name,
        aliasPk: 'urn:mail:defaultpk@gib.gov.tr',
        aliasGb: 'urn:mail:defaultgb@gib.gov.tr',
        registeredAt: '2019-01-01',
      }
    }

    return {
      isEInvoiceUser: true,
      title: `${vknTckn} VKN / TCKN Tanımlı Mükellef`,
      aliasPk: 'urn:mail:defaultpk@gib.gov.tr',
      aliasGb: 'urn:mail:defaultgb@gib.gov.tr',
      registeredAt: '2021-06-15',
    }
  }

  /**
   * Gerçek RMS Tedarikçileri ve Tüzel Kişiliklerinden Simülasyon Faturası Oluşturucu
   */
  async generateSimulatedInboundInvoice(scenario = 'MATCHED') {
    const realSuppliers = await getRealRmsSuppliers()
    const realCompanies = await getRealRmsCompanyEntities()
    const realStockItems = await getRealRmsStockItems()

    let supplierTitle = 'RMS Kayıtlı Tedarikçi'
    let supplierVkn = '1111111111'
    let supplierTaxOffice = 'Merkez'
    let supplierAddress = 'Tedarikçi Adresi'

    if (realSuppliers.length > 0) {
      const selected = realSuppliers[Math.floor(Math.random() * realSuppliers.length)]
      supplierTitle = selected.name || supplierTitle
      supplierVkn = selected.vergi_no || selected.tc_no || '1111111111'
      supplierTaxOffice = selected.vergi_dairesi || supplierTaxOffice
      supplierAddress = selected.address || supplierAddress
    }

    let receiverTitle = 'RMS Restoran Grubu A.Ş.'
    let receiverVkn = '1234567890'
    let receiverTaxOffice = 'Beşiktaş'
    let receiverAddress = 'Restoran Genel Merkez Adresi'

    const tuzelNode = realCompanies.find(c => c.type === 'tuzel' || c.is_legal_entity) || realCompanies[0]
    if (tuzelNode) {
      receiverTitle = tuzelNode.legal_title || tuzelNode.title || tuzelNode.name || receiverTitle
      receiverVkn = tuzelNode.tax_number || tuzelNode.vkn_tckn || receiverVkn
      receiverTaxOffice = tuzelNode.tax_office || receiverTaxOffice
      receiverAddress = tuzelNode.legal_address || receiverAddress
    }

    const ettn = generateETTN()
    const invoiceNumber = generateInvoiceNumber('GIB', new Date().getFullYear(), Math.floor(Math.random() * 900000) + 100000)
    const issueDate = new Date().toISOString().split('T')[0]
    const issueTime = new Date().toTimeString().split(' ')[0]

    let profileId = 'TICARIFATURA'
    let statusCode = EINVOICE_STATUS.DELIVERED_TO_RECEIVER
    let statusDescription = 'Alıcıya Ulaştı (Kabul/Red Bekliyor - 1200)'

    if (scenario === 'EARSIV') {
      profileId = 'EARSIVFATURA'
      statusCode = EINVOICE_STATUS.ACCEPTED
      statusDescription = 'e-Arşiv Fatura Düzenlendi (1300)'
    }

    // Generate lines based on real stock items or generic RMS items
    const lineCount = Math.floor(Math.random() * 3) + 2
    const lines = []

    for (let idx = 0; idx < lineCount; idx++) {
      let itemName = `Stok Kalemi ${idx + 1}`
      let itemCode = `STK-00${idx + 1}`
      let unitPrice = 150.0 + idx * 50
      let taxRate = 20

      if (realStockItems.length > idx) {
        const item = realStockItems[idx]
        itemName = item.name || itemName
        itemCode = item.code || item.sku || itemCode
        unitPrice = Number(item.cost_price || item.price || unitPrice)
        taxRate = Number(item.vat_rate ?? 20)
      }

      let qty = Math.floor(Math.random() * 8) + 2

      if (scenario === 'PRICE_DIFF' && idx === 0) {
        unitPrice = Math.round(unitPrice * 1.25)
      } else if (scenario === 'SHORTAGE' && idx === 0) {
        qty = qty + 10
      }

      const subtotal = Math.round(qty * unitPrice * 100) / 100
      const taxAmount = Math.round((subtotal * taxRate) / 100 * 100) / 100

      lines.push({
        line_number: idx + 1,
        item_name: itemName,
        item_code: itemCode,
        invoiced_quantity: qty,
        unit_code: 'KGM',
        unit_price: unitPrice,
        subtotal,
        discount_rate: 0,
        discount_amount: 0,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total_line_amount: subtotal + taxAmount,
      })
    }

    const totals = calculateInvoiceTotals(lines)

    const notesMap = {
      MATCHED: 'Sipariş ve irsaliye ile birebir tam eşleşen standart tedarikçi faturası.',
      PRICE_DIFF: 'DİKKAT: Sözleşme ve sipariş birim fiyatından yüksek faturalandırılmış kalem içermektedir.',
      SHORTAGE: 'DİKKAT: İrsaliye teslimat miktarından fazla miktarda kesilmiş kalem içermektedir.',
      NEW_SUPPLIER: 'DİKKAT: Sistemde daha önce kayıtlı olmayan yeni tedarikçi e-faturası.',
      REJECTABLE: 'Ticari fatura senaryosu: 8 gün içinde Kabul veya Red yanıtı verilmelidir.',
      EARSIV: 'Nihai tüketici e-Arşiv faturası simülasyonu.',
    }

    const invoicePayload = {
      direction: 'INBOUND',
      ettn,
      invoice_number: invoiceNumber,
      invoice_type: 'SATIS',
      profile_id: profileId,
      issue_date: issueDate,
      issue_time: issueTime,
      status_code: statusCode,
      status_description: statusDescription,
      currency_code: 'TRY',
      currency_rate: 1.0,
      sender_vkn_tckn: supplierVkn,
      sender_title: supplierTitle,
      sender_tax_office: supplierTaxOffice,
      sender_address: supplierAddress,
      sender_alias: 'urn:mail:defaultgb@gib.gov.tr',
      receiver_vkn_tckn: receiverVkn,
      receiver_title: receiverTitle,
      receiver_tax_office: receiverTaxOffice,
      receiver_address: receiverAddress,
      receiver_alias: 'urn:mail:defaultpk@gib.gov.tr',
      line_extension_amount: totals.lineExtensionAmount,
      tax_exclusive_amount: totals.taxExclusiveAmount,
      tax_inclusive_amount: totals.taxInclusiveAmount,
      allowance_total_amount: totals.allowanceTotalAmount,
      charge_total_amount: totals.chargeTotalAmount,
      tax_total_amount: totals.taxTotalAmount,
      payable_amount: totals.payableAmount,
      notes: notesMap[scenario] || 'SuitableRMS Simülatör Faturası',
      raw_json: { scenario, generatedAt: new Date().toISOString() },
    }

    // Generate XML
    const xml = generateUBLXML({ ...invoicePayload, lines })
    invoicePayload.ubl_xml = xml

    // Save to DB
    const { data: invData, error: invErr } = await db.from('e_invoices').insert(invoicePayload).select('id')
    if (invErr) {
      console.error('Simulated invoice insert error:', invErr)
      return null
    }

    const invoiceId = invData?.[0]?.id || invData?.id
    if (invoiceId) {
      const linesWithInvoiceId = lines.map((l) => ({ ...l, invoice_id: invoiceId }))
      await db.from('e_invoice_lines').insert(linesWithInvoiceId)
    }

    return {
      id: invoiceId,
      ...invoicePayload,
      lines,
    }
  }

  /**
   * Giden Fatura Simülasyonu Oluşturucu (Gerçek Şirket Düğümlerimizden)
   */
  async generateSimulatedOutboundInvoice(params = {}) {
    const realCompanies = await getRealRmsCompanyEntities()
    const realStockItems = await getRealRmsStockItems()

    let senderTitle = 'SuitableRMS Restoran Grubu A.Ş.'
    let senderVkn = '1234567890'
    let senderTaxOffice = 'Beşiktaş'
    let senderAddress = 'Beşiktaş / İstanbul'

    const tuzelNode = realCompanies.find(c => c.type === 'tuzel' || c.is_legal_entity) || realCompanies[0]
    if (tuzelNode) {
      senderTitle = tuzelNode.legal_title || tuzelNode.title || tuzelNode.name || senderTitle
      senderVkn = tuzelNode.tax_number || tuzelNode.vkn_tckn || senderVkn
      senderTaxOffice = tuzelNode.tax_office || senderTaxOffice
      senderAddress = tuzelNode.legal_address || senderAddress
    }

    const ettn = generateETTN()
    const invoiceNumber = generateInvoiceNumber('RMS', new Date().getFullYear(), Math.floor(Math.random() * 900000) + 100000)
    const issueDate = new Date().toISOString().split('T')[0]
    const issueTime = new Date().toTimeString().split(' ')[0]

    const receiverTitle = params.receiverTitle || 'Müşteri (Perakende / B2B)'
    const receiverVkn = params.receiverVkn || '11111111111'
    const profileId = params.profileId || 'TICARIFATURA'

    const lines = [
      {
        line_number: 1,
        item_name: realStockItems[0]?.name || 'Kurumsal Yeme-İçme Hizmeti',
        item_code: realStockItems[0]?.code || 'SRV-001',
        invoiced_quantity: 10,
        unit_code: 'PR',
        unit_price: 320.0,
        subtotal: 3200.0,
        tax_rate: 10,
        tax_amount: 320.0,
        total_line_amount: 3520.0,
      },
    ]

    const totals = calculateInvoiceTotals(lines)

    const invoicePayload = {
      direction: 'OUTBOUND',
      ettn,
      invoice_number: invoiceNumber,
      invoice_type: 'SATIS',
      profile_id: profileId,
      issue_date: issueDate,
      issue_time: issueTime,
      status_code: EINVOICE_STATUS.DELIVERED_TO_RECEIVER,
      status_description: 'Alıcı Posta Kutusuna Başarıyla İletildi (1200)',
      currency_code: 'TRY',
      currency_rate: 1.0,
      sender_vkn_tckn: senderVkn,
      sender_title: senderTitle,
      sender_tax_office: senderTaxOffice,
      sender_address: senderAddress,
      sender_alias: 'urn:mail:defaultgb@gib.gov.tr',
      receiver_vkn_tckn: receiverVkn,
      receiver_title: receiverTitle,
      receiver_tax_office: 'Merkez',
      receiver_address: 'Alıcı Adresi',
      receiver_alias: 'urn:mail:defaultpk@gib.gov.tr',
      line_extension_amount: totals.lineExtensionAmount,
      tax_exclusive_amount: totals.taxExclusiveAmount,
      tax_inclusive_amount: totals.taxInclusiveAmount,
      allowance_total_amount: totals.allowanceTotalAmount,
      charge_total_amount: totals.chargeTotalAmount,
      tax_total_amount: totals.taxTotalAmount,
      payable_amount: totals.payableAmount,
      notes: 'Kurumsal etkinlik faturalandırması.',
      raw_json: { generatedAt: new Date().toISOString() },
    }

    const xml = generateUBLXML({ ...invoicePayload, lines })
    invoicePayload.ubl_xml = xml

    const { data: invData, error: invErr } = await db.from('e_invoices').insert(invoicePayload).select('id')
    if (invErr) {
      console.error('Outbound invoice insert error:', invErr)
      return null
    }

    const invoiceId = invData?.[0]?.id || invData?.id
    if (invoiceId) {
      const linesWithInvoiceId = lines.map((l) => ({ ...l, invoice_id: invoiceId }))
      await db.from('e_invoice_lines').insert(linesWithInvoiceId)
    }

    return {
      id: invoiceId,
      ...invoicePayload,
      lines,
    }
  }

  /**
   * Kalan Kontör / Kredi Bakiyesi Sorgulama (Simülasyon)
   */
  async getCreditsBalance() {
    await new Promise((resolve) => setTimeout(resolve, 120))
    const credits = 4850 // Örnek aktif bakiye
    return {
      credits,
      provider: 'mock',
      checkedAt: new Date().toISOString(),
      message: 'Mock Entegratör: 4.850 e-Fatura / e-Arşiv kontörü mevcut.',
    }
  }

  /**
   * E-Arşiv Fatura İptal Talebi Gönderme
   */
  async cancelEArchiveInvoice(ettn, reason = '') {
    await new Promise((resolve) => setTimeout(resolve, 200))
    // Update local status if exists
    await db
      .from('e_invoices')
      .update({
        status_code: EINVOICE_STATUS.REJECTED, // 1301 / İptal
        status_description: `E-Arşiv Fatura İptal Edildi (${reason || 'Kullanıcı talebi'})`,
        response_code: 'CANCELLED',
        response_reason: reason || 'Kullanıcı talebiyle e-Arşiv iptal edildi.',
        response_date: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('ettn', ettn)

    return {
      success: true,
      ettn,
      message: 'E-Arşiv Fatura başarıyla iptal edildi ve GİB raporlama kuyruğuna alındı.',
      cancelledAt: new Date().toISOString(),
    }
  }

  /**
   * Toplu Belge İndirme
   */
  async downloadBatchFiles(ettnList = [], format = 'ZIP') {
    await new Promise((resolve) => setTimeout(resolve, 300))
    const { data } = await db.from('e_invoices').select('ettn, invoice_number, ubl_xml').in('ettn', ettnList)
    return {
      success: true,
      format,
      count: data?.length || 0,
      files: data || [],
      message: `${data?.length || 0} adet belge hazırlandı.`,
    }
  }
}

export const mockIntegratorAdapter = new MockIntegratorAdapter()

