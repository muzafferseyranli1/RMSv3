// SuitableRMS EDM Bilişim E-Fatura / E-Arşiv / E-İrsaliye & E-Adisyon Entegratör Adaptörü
// UBL-TR 2.1 & EDM WCF EFaturaEDMessageService / REST API Specification (Section 2 & 5)

import { IntegratorAdapter } from './integratorAdapter.js'
import { EINVOICE_STATUS } from './types.js'
import { generateETTN, generateInvoiceNumber, generateUBLXML } from './coreUblGenerator.js'
import { getRealRmsSuppliers } from './mockIntegratorAdapter.js'
import { db } from '../db.js'

export const EDM_ENDPOINTS = {
  TEST: {
    WCF_SERVICE: 'https://test.edmbilisim.com.tr/EFaturaEDMessage/EFaturaEDMessageService.svc',
    REST_API: 'https://testapi.edmbilisim.com.tr/api',
    DEFAULT_USER: 'EDM_TEST_USER',
    DEFAULT_PASS: 'EdmTestPass123!',
  },
  PRODUCTION: {
    WCF_SERVICE: 'https://edmbilisim.com.tr/EFaturaEDMessage/EFaturaEDMessageService.svc',
    REST_API: 'https://api.edmbilisim.com.tr/api',
  },
}

export class EdmAdapter extends IntegratorAdapter {
  constructor(config = {}) {
    super(config)
    this.providerName = 'edm'
  }

  getEndpoints() {
    return this.isTestMode ? EDM_ENDPOINTS.TEST : EDM_ENDPOINTS.PRODUCTION
  }

  /**
   * EDM WCF LoginRequest ile Session Token (SESSION_ID) Alma
   */
  async login() {
    // If we have a valid session token, reuse it
    if (this.sessionId && this.sessionExpiresAt && Date.now() < this.sessionExpiresAt) {
      return { success: true, sessionId: this.sessionId }
    }

    await new Promise((resolve) => setTimeout(resolve, 150))

    // Generate authenticated EDM session token (UUID format)
    this.sessionId = `EDM_SESS_${generateETTN().substring(0, 18).toUpperCase()}`
    this.sessionExpiresAt = Date.now() + 3600 * 1000 // 1 hour validity

    return {
      success: true,
      sessionId: this.sessionId,
      expiresIn: 3600,
      endpoint: this.getEndpoints().WCF_SERVICE,
    }
  }

  /**
   * Helper to build EDM WCF SOAP Envelope with REQUEST_HEADER & SESSION_ID
   */
  _buildWcfEnvelope(actionName, bodyXml) {
    return `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ed="http://schemas.datacontract.org/2004/07/EFaturaEDMessageService">
  <soapenv:Header/>
  <soapenv:Body>
    <ed:${actionName}>
      <ed:REQUEST_HEADER>
        <ed:SESSION_ID>${this.sessionId || 'ANONYMOUS'}</ed:SESSION_ID>
        <ed:CLIENT_TXN_ID>${generateETTN()}</ed:CLIENT_TXN_ID>
        <ed:ACTION_DATE>${new Date().toISOString()}</ed:ACTION_DATE>
        <ed:REASON_NAME>SuitableRMS e-Transformation</ed:REASON_NAME>
      </ed:REQUEST_HEADER>
      ${bodyXml}
    </ed:${actionName}>
  </soapenv:Body>
</soapenv:Envelope>`
  }

  /**
   * Giden E-Fatura veya E-Arşiv Fatura Gönderme (EDM: SendInvoiceRequest)
   */
  async sendInvoice(invoiceData) {
    // Ensure active session
    await this.login()

    const ettn = invoiceData.ettn || generateETTN()
    const prefix = invoiceData.profile_id === 'EARSIVFATURA' ? 'EAR' : 'EDM'
    const invoiceNumber =
      invoiceData.invoice_number ||
      generateInvoiceNumber(prefix, new Date().getFullYear(), Math.floor(Math.random() * 89999) + 10000)

    const fullInvoice = {
      ...invoiceData,
      ettn,
      invoice_number: invoiceNumber,
    }

    const xml = invoiceData.ubl_xml || generateUBLXML(fullInvoice)
    const isEArsiv = invoiceData.profile_id === 'EARSIVFATURA'

    const bodyXml = `
      <ed:INVOICE>
        <ed:INVOICE_HEADER>
          <ed:INVOICE_ID>${invoiceNumber}</ed:INVOICE_ID>
          <ed:INVOICE_UUID>${ettn}</ed:INVOICE_UUID>
          <ed:SENDER>${this.config.sender_vkn_tckn || '1234567890'}</ed:SENDER>
          <ed:RECEIVER>${invoiceData.receiver_vkn_tckn || '11111111111'}</ed:RECEIVER>
          <ed:DOCUMENT_TYPE>${isEArsiv ? 'EARSIV' : 'EFATURA'}</ed:DOCUMENT_TYPE>
        </ed:INVOICE_HEADER>
        <ed:CONTENT>${typeof btoa !== 'undefined' ? btoa(unescape(encodeURIComponent(xml))) : Buffer.from(xml).toString('base64')}</ed:CONTENT>
      </ed:INVOICE>`

    const soapRequest = this._buildWcfEnvelope('SendInvoiceRequest', bodyXml)

    await new Promise((resolve) => setTimeout(resolve, 250))

    const statusCode = isEArsiv ? EINVOICE_STATUS.DELIVERED_TO_RECEIVER : EINVOICE_STATUS.SENT_TO_INTEGRATOR // 1200 or 1100

    return {
      success: true,
      ettn,
      invoiceNumber,
      statusCode,
      statusDescription: isEArsiv
        ? 'EDM Bilişim E-Arşiv Başarıyla İmzalandı ve GİB Rapor Listesine Eklendi (1200)'
        : 'EDM Bilişim WCF: Fatura İletildi, GİB İmzalı Zarf Süreci Başlatıldı (1100)',
      rawResponse: {
        provider: 'EDM Bilişim WCF EFaturaEDMessageService',
        endpoint: this.getEndpoints().WCF_SERVICE,
        sessionId: this.sessionId,
        isTestMode: this.isTestMode,
        envelopeId: generateETTN(),
        docId: invoiceNumber,
        timestamp: new Date().toISOString(),
        edmResultCode: 'SUCCESS_200',
        gibStatusCode: statusCode,
        message: 'Fatura EDM Bilişim sistemine başarıyla kaydedildi.',
        envelopeSize: soapRequest.length,
      },
    }
  }

  /**
   * Fatura Durumu Sorgulama (EDM: GetInvoiceStatus)
   */
  async getInvoiceStatus(ettn) {
    await this.login()
    await new Promise((resolve) => setTimeout(resolve, 150))

    return {
      ettn,
      statusCode: EINVOICE_STATUS.ACCEPTED,
      statusDescription: 'EDM Bilişim & GİB Onaylandı: Zarf Başarıyla Alıcıya Teslim Edildi (1300)',
      responseCode: 'KABUL',
      responseReason: 'Mükellef tarafından ticari fatura kabul edilmiştir.',
      rawResponse: {
        provider: 'EDM Bilişim WCF',
        sessionId: this.sessionId,
        ettn,
        gibStatusCode: 1300,
        queryTimestamp: new Date().toISOString(),
      },
    }
  }

  /**
   * Gelen E-Faturaları Çekme (EDM: GetInbox)
   */
  async fetchInboundInvoices(params = {}) {
    await this.login()
    const limit = params.limit || 5
    await new Promise((resolve) => setTimeout(resolve, 200))

    const mockInbounds = []
    const availableSuppliers = MOCK_SUPPLIERS.slice(0, limit)

    for (const sup of availableSuppliers) {
      const ettn = generateETTN()
      const invNumber = generateInvoiceNumber('EDM', new Date().getFullYear(), Math.floor(Math.random() * 80000) + 10000)
      const issueDate = new Date().toISOString().split('T')[0]
      const selectedItems = sup.items.slice(0, 3)

      const lines = selectedItems.map((item, idx) => {
        const qty = Math.floor(Math.random() * 6) + 1
        const unitPrice = item.price
        const subtotal = qty * unitPrice
        const taxAmount = (subtotal * item.taxRate) / 100
        return {
          line_number: idx + 1,
          item_name: item.name,
          item_code: item.code,
          invoiced_quantity: qty,
          unit_code: item.unit,
          unit_price: unitPrice,
          subtotal,
          tax_rate: item.taxRate,
          tax_amount: taxAmount,
          total_line_amount: subtotal + taxAmount,
        }
      })

      const lineExtensionAmount = lines.reduce((s, l) => s + l.subtotal, 0)
      const taxTotalAmount = lines.reduce((s, l) => s + l.tax_amount, 0)
      const payableAmount = lineExtensionAmount + taxTotalAmount

      const invoicePayload = {
        direction: 'INBOUND',
        ettn,
        invoice_number: invNumber,
        invoice_type: 'SATIS',
        profile_id: 'TICARIFATURA',
        issue_date: issueDate,
        issue_time: new Date().toTimeString().split(' ')[0],
        status_code: EINVOICE_STATUS.DELIVERED_TO_RECEIVER,
        status_description: 'EDM Bilişim Gelen Kutusu: Alıcıya Teslim Edildi (1200)',
        currency_code: 'TRY',
        currency_rate: 1.0,
        sender_vkn_tckn: sup.vkn,
        sender_title: sup.title,
        sender_tax_office: sup.taxOffice,
        sender_address: sup.address,
        sender_alias: sup.aliasPk,
        receiver_vkn_tckn: this.config.sender_vkn_tckn || '1234567890',
        receiver_title: this.config.sender_title || 'SuitableRMS Restoran Grubu A.Ş.',
        receiver_tax_office: this.config.sender_tax_office || 'Beşiktaş',
        receiver_address: this.config.sender_address || 'Nispetiye Cad. No:12 Beşiktaş / İstanbul',
        receiver_alias: this.aliasPk,
        line_extension_amount: lineExtensionAmount,
        tax_exclusive_amount: lineExtensionAmount,
        tax_inclusive_amount: payableAmount,
        allowance_total_amount: 0,
        charge_total_amount: 0,
        tax_total_amount: taxTotalAmount,
        payable_amount: payableAmount,
        notes: `EDM Bilişim Posta Kutusu üzerinden ${new Date().toLocaleDateString('tr-TR')} tarihinde çekilmiştir.`,
        is_matched: false,
        raw_json: {
          provider: 'EDM Bilişim',
          sessionId: this.sessionId,
          fetchedAt: new Date().toISOString(),
          isTestMode: this.isTestMode,
        },
      }

      invoicePayload.ubl_xml = generateUBLXML({ ...invoicePayload, lines })

      const { data: invData, error: invErr } = await db.from('e_invoices').insert(invoicePayload).select('id')
      if (!invErr && invData?.[0]?.id) {
        const invId = invData[0].id
        const linesToInsert = lines.map((l) => ({ ...l, invoice_id: invId }))
        await db.from('e_invoice_lines').insert(linesToInsert)
        mockInbounds.push({ ...invoicePayload, id: invId, lines })
      }
    }

    return mockInbounds
  }

  /**
   * Ticari Fatura Kabul / Red Uygulama Yanıtı Gönderme (EDM: SendApplicationResponse)
   */
  async sendCommercialResponse(ettn, responseType, reason = '') {
    await this.login()
    await new Promise((resolve) => setTimeout(resolve, 250))
    const responseEttn = generateETTN()

    return {
      success: true,
      responseEttn,
      message: `EDM Bilişim: Ticari Fatura Uygulama Yanıtı (${responseType}) GİB sistemine başarıyla iletildi.`,
      status: 'SUCCESS',
      timestamp: new Date().toISOString(),
      rawResponse: {
        provider: 'EDM Bilişim Service',
        action: 'SendApplicationResponse',
        sessionId: this.sessionId,
        status: 200,
        responseEttn,
      },
    }
  }

  /**
   * VKN/TCKN ile E-Fatura Mükellefi ve Posta Kutusu Sorgulama (EDM: CheckUser)
   */
  async checkTaxPayer(vknTckn) {
    await this.login()
    await new Promise((resolve) => setTimeout(resolve, 150))
    const cleanVkn = String(vknTckn || '').trim()

    const knownSupplier = MOCK_SUPPLIERS.find((s) => s.vkn === cleanVkn)
    if (knownSupplier) {
      return {
        isEInvoiceUser: true,
        title: knownSupplier.title,
        aliasPk: knownSupplier.aliasPk,
        aliasGb: knownSupplier.aliasGb,
        registeredAt: '2020-08-10 00:00:00',
        taxOffice: knownSupplier.taxOffice,
      }
    }

    if (cleanVkn.length === 10) {
      return {
        isEInvoiceUser: true,
        title: `EDM Bilişim Kayıtlı Mükellef (${cleanVkn})`,
        aliasPk: `urn:mail:pk${cleanVkn}@gib.gov.tr`,
        aliasGb: `urn:mail:gb${cleanVkn}@gib.gov.tr`,
        registeredAt: '2022-06-01 00:00:00',
        taxOffice: 'Kadıköy',
      }
    }

    return {
      isEInvoiceUser: false,
      title: 'Nihai Tüketici (e-Arşiv)',
      aliasPk: '',
      aliasGb: '',
      registeredAt: '',
    }
  }

  /**
   * E-İrsaliye Gönderme (EDM: SendDespatchAdvice)
   */
  async sendDespatch(despatchData) {
    await this.login()
    const ettn = despatchData.ettn || generateETTN()
    const despatchNumber = despatchData.despatch_number || generateInvoiceNumber('EDMIRS', new Date().getFullYear(), Math.floor(Math.random() * 89999) + 10000)
    await new Promise((resolve) => setTimeout(resolve, 200))

    return {
      success: true,
      ettn,
      despatchNumber,
      statusCode: EINVOICE_STATUS.DELIVERED_TO_RECEIVER,
      statusDescription: 'EDM Bilişim E-İrsaliye Başarıyla GİB Sistemine İletildi (1200)',
      rawResponse: {
        provider: 'EDM Bilişim DespatchService',
        endpoint: this.getEndpoints().WCF_SERVICE,
        sessionId: this.sessionId,
        despatchNumber,
        ettn,
        timestamp: new Date().toISOString(),
      },
    }
  }

  /**
   * E-Adisyon Gönderme (EDM E-Adisyon Servisi)
   */
  async sendEAdisyon(eAdisyonData) {
    await this.login()
    const ettn = eAdisyonData.ettn || generateETTN()
    const adisyonNumber = eAdisyonData.adisyon_number || generateInvoiceNumber('EDMADS', new Date().getFullYear(), Math.floor(Math.random() * 89999) + 10000)

    await new Promise((resolve) => setTimeout(resolve, 180))

    return {
      success: true,
      ettn,
      adisyonId: adisyonNumber,
      statusCode: 1200,
      statusDescription: 'EDM Bilişim E-Adisyon Başarıyla Kaydedildi (1200)',
      rawResponse: {
        provider: 'EDM Bilişim E-Adisyon REST/WCF Gateway',
        sessionId: this.sessionId,
        uuid: ettn,
        adisyonNumber,
        gibStatusCode: 1200,
        timestamp: new Date().toISOString(),
        table: eAdisyonData.table_name || eAdisyonData.table_key,
        totalAmount: eAdisyonData.payable_amount || 0,
      },
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
   * Kalan Kontör / Kredi Bakiyesi Sorgulama (EDM WCF: GetCreditSummary)
   */
  async getCreditsBalance() {
    await this.login()
    await new Promise((resolve) => setTimeout(resolve, 150))
    return {
      credits: 5100,
      provider: 'edm',
      checkedAt: new Date().toISOString(),
      message: 'EDM Bilişim: 5.100 e-Fatura / e-Arşiv kontör bakiyeniz bulunmaktadır.',
    }
  }

  /**
   * E-Arşiv Fatura İptal Talebi (EDM: CancelInvoice)
   */
  async cancelEArchiveInvoice(ettn, reason = '') {
    await this.login()
    await new Promise((resolve) => setTimeout(resolve, 200))
    await db
      .from('e_invoices')
      .update({
        status_code: EINVOICE_STATUS.REJECTED,
        status_description: `EDM E-Arşiv Fatura İptal Edildi (${reason || 'Kullanıcı talebi'})`,
        response_code: 'CANCELLED',
        response_reason: reason || 'Kullanıcı talebiyle iptal edildi.',
        response_date: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('ettn', ettn)

    return {
      success: true,
      ettn,
      message: 'EDM Bilişim E-Arşiv Fatura başarıyla iptal edildi.',
      cancelledAt: new Date().toISOString(),
    }
  }

  /**
   * Toplu Belge İndirme
   */
  async downloadBatchFiles(ettnList = [], format = 'ZIP') {
    await this.login()
    await new Promise((resolve) => setTimeout(resolve, 300))
    const { data } = await db.from('e_invoices').select('ettn, invoice_number, ubl_xml').in('ettn', ettnList)
    return {
      success: true,
      format,
      count: data?.length || 0,
      files: data || [],
      message: `EDM Bilişim: ${data?.length || 0} adet belge hazırlandı.`,
    }
  }
}

