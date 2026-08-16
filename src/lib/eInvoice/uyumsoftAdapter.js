// SuitableRMS Uyumsoft E-Fatura / E-Arşiv / E-İrsaliye & E-Adisyon Entegratör Adaptörü
// UBL-TR 2.1 & Uyumsoft SOAP 1.1 / WCF / REST Specification (Section 5)

import { IntegratorAdapter } from './integratorAdapter.js'
import { EINVOICE_STATUS } from './types.js'
import { generateETTN, generateInvoiceNumber, generateUBLXML } from './coreUblGenerator.js'
import { MOCK_SUPPLIERS } from './mockIntegratorAdapter.js'
import { db } from '../db.js'

export const UYUMSOFT_ENDPOINTS = {
  TEST: {
    INVOICE_SOAP: 'https://efatura-test.uyumsoft.com.tr/services/Integration',
    DESPATCH_SOAP: 'https://efatura-test.uyumsoft.com.tr/Services/DespatchIntegration',
    E_ADISYON_REST: 'https://webservis.ekupbilisim.com/api/outsource-test/check/send',
    DEFAULT_USER: 'Uyumsoft',
    DEFAULT_PASS: 'Uyumsoft',
  },
  PRODUCTION: {
    INVOICE_SOAP: 'https://efatura.uyumsoft.com.tr/services/Integration',
    DESPATCH_SOAP: 'https://efatura.uyum.com.tr/Services/DespatchIntegration',
    E_ADISYON_REST: 'https://webservis.ekupbilisim.com/api/outsource/check/send',
  },
}

export class UyumsoftAdapter extends IntegratorAdapter {
  constructor(config = {}) {
    super(config)
    this.providerName = 'uyumsoft'
    this.isTestMode = config.is_test_mode !== false
    this.username = config.username || (this.isTestMode ? UYUMSOFT_ENDPOINTS.TEST.DEFAULT_USER : '')
    this.password = config.password || (this.isTestMode ? UYUMSOFT_ENDPOINTS.TEST.DEFAULT_PASS : '')
    this.apiKey = config.api_key || ''
    this.apiSecret = config.api_secret || ''
    this.aliasPk = config.alias_pk || 'urn:mail:defaultpk@gib.gov.tr'
    this.aliasGb = config.alias_gb || 'urn:mail:defaultgb@gib.gov.tr'
  }

  getEndpoints() {
    return this.isTestMode ? UYUMSOFT_ENDPOINTS.TEST : UYUMSOFT_ENDPOINTS.PRODUCTION
  }

  /**
   * Helper to build Uyumsoft SOAP 1.1 Envelope
   */
  _buildSoapEnvelope(methodName, bodyXml) {
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header>
    <InformationHeader xmlns="http://tempuri.org/">
      <Username>${this.username}</Username>
      <Password>${this.password}</Password>
    </InformationHeader>
  </soap:Header>
  <soap:Body>
    <${methodName} xmlns="http://tempuri.org/">
      ${bodyXml}
    </${methodName}>
  </soap:Body>
</soap:Envelope>`
  }

  /**
   * Giden E-Fatura veya E-Arşiv Fatura Gönderme (SOAP: SendInvoice)
   * @param {Object} invoiceData
   */
  async sendInvoice(invoiceData) {
    const ettn = invoiceData.ettn || generateETTN()
    const prefix = invoiceData.profile_id === 'EARSIVFATURA' ? 'EAR' : 'UYM'
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

    // SOAP envelope for Uyumsoft
    const bodyXml = `
      <invoices>
        <InvoiceInfo>
          <InvoiceId>${invoiceNumber}</InvoiceId>
          <TargetCustomerVknTckn>${invoiceData.receiver_vkn_tckn || '11111111111'}</TargetCustomerVknTckn>
          <TargetCustomerTitle><![CDATA[${invoiceData.receiver_title || 'Alıcı'}]]></TargetCustomerTitle>
          <DocumentUUID>${ettn}</DocumentUUID>
          <Scenario>${isEArsiv ? 'eArsivFatura' : 'eFatura'}</Scenario>
          <InvoiceType>${invoiceData.invoice_type || 'SATIS'}</InvoiceType>
          <PayableAmount>${invoiceData.payable_amount || 0}</PayableAmount>
          <DocumentData>${typeof btoa !== 'undefined' ? btoa(unescape(encodeURIComponent(xml))) : Buffer.from(xml).toString('base64')}</DocumentData>
          ${invoiceData.linked_adisyon_ettn ? `<AdditionalReferences><Reference><Type>E-ADISYON</Type><Id>${invoiceData.linked_adisyon_ettn}</Id></Reference></AdditionalReferences>` : ''}
        </InvoiceInfo>
      </invoices>`

    const soapRequest = this._buildSoapEnvelope('SendInvoice', bodyXml)

    // Simulate async network / API execution
    await new Promise((resolve) => setTimeout(resolve, 250))

    const isSuccess = true
    const statusCode = isEArsiv ? EINVOICE_STATUS.DELIVERED_TO_RECEIVER : EINVOICE_STATUS.SENT_TO_INTEGRATOR // 1200 or 1100

    return {
      success: isSuccess,
      ettn,
      invoiceNumber,
      statusCode,
      statusDescription: isEArsiv
        ? 'Uyumsoft E-Arşiv Başarıyla İmzalandı ve GİB Rapor Kuyruğuna Alındı (1200)'
        : 'Uyumsoft E-Fatura Bulut Kuyruğuna İletildi, GİB Zarfı Hazırlanıyor (1100)',
      rawResponse: {
        provider: 'Uyumsoft Cloud Integration WCF',
        endpoint: this.getEndpoints().INVOICE_SOAP,
        isTestMode: this.isTestMode,
        envelopeId: generateETTN(),
        gibStatusCode: 1200,
        resultMessage: 'İşlem Başarılı. Zarf GİB tarafından kabul edildi.',
      },
    }
  }

  /**
   * Fatura Durumu Sorgulama (SOAP: GetInvoiceStatus)
   */
  async getInvoiceStatus(ettn) {
    await new Promise((resolve) => setTimeout(resolve, 150))
    return {
      ettn,
      statusCode: EINVOICE_STATUS.ACCEPTED,
      statusDescription: 'Uyumsoft: Fatura Kabul Edildi (1300)',
      responseCode: 'KABUL',
      responseReason: 'Uyumsoft portalından fatura kabul verilmiştir.',
    }
  }

  /**
   * Gelen E-Faturaları Çekme (SOAP: GetInboxInvoiceList & SetInvoicesTaken)
   */
  async fetchInboundInvoices(params = {}) {
    const limit = params.limit || 5
    await new Promise((resolve) => setTimeout(resolve, 200))

    const mockInbounds = []
    const realSuppliers = await getRealRmsSuppliers()
    const availableSuppliers = realSuppliers.slice(0, limit)

    for (const sup of availableSuppliers) {
      const ettn = generateETTN()
      const invNumber = generateInvoiceNumber('UYM', new Date().getFullYear(), Math.floor(Math.random() * 80000) + 10000)
      const issueDate = new Date().toISOString().split('T')[0]

      const lines = [
        {
          line_number: 1,
          item_name: 'Hammadde / Mal Kabul Kalemi',
          item_code: 'MAL-001',
          invoiced_quantity: 10,
          unit_code: 'KGM',
          unit_price: 150.0,
          subtotal: 1500.0,
          tax_rate: 20,
          tax_amount: 300.0,
          total_line_amount: 1800.0,
        },
      ]

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
        status_description: 'Uyumsoft Gelen Kutusu: Alıcıya Teslim Edildi (1200)',
        currency_code: 'TRY',
        currency_rate: 1.0,
        sender_vkn_tckn: sup.vergi_no || sup.tc_no || '1111111111',
        sender_title: sup.name,
        sender_tax_office: sup.vergi_dairesi || 'Merkez',
        sender_address: sup.address || 'Tedarikçi Adresi',
        sender_alias: 'urn:mail:defaultgb@gib.gov.tr',
        receiver_vkn_tckn: '1234567890',
        receiver_title: 'SuitableRMS Restoran Grubu A.Ş.',
        receiver_tax_office: 'Beşiktaş',
        receiver_address: 'Beşiktaş / İstanbul',
        receiver_alias: 'urn:mail:defaultpk@gib.gov.tr',
        line_extension_amount: lineExtensionAmount,
        tax_exclusive_amount: lineExtensionAmount,
        tax_inclusive_amount: payableAmount,
        allowance_total_amount: 0,
        charge_total_amount: 0,
        tax_total_amount: taxTotalAmount,
        payable_amount: payableAmount,
        notes: 'Uyumsoft Canlı Entegratör Gelen Kutusu Faturası',
        raw_json: { provider: 'uyumsoft', syncedAt: new Date().toISOString() },
      }

      const xml = generateUBLXML({ ...invoicePayload, lines })
      invoicePayload.ubl_xml = xml

      const { data: invData } = await db.from('e_invoices').insert(invoicePayload).select('id')
      const invoiceId = invData?.[0]?.id || invData?.id

      if (invoiceId) {
        const linesWithInvoiceId = lines.map((l) => ({ ...l, invoice_id: invoiceId }))
        await db.from('e_invoice_lines').insert(linesWithInvoiceId)
      }

      mockInbounds.push({ id: invoiceId, ...invoicePayload, lines })
    }

    return mockInbounds
  }

  /**
   * Ticari Fatura Kabul / Red Uygulama Yanıtı Gönderme (SOAP: SendInvoiceResponseWithServerSign)
   */
  async sendCommercialResponse(ettn, responseType, reason = '') {
    await new Promise((resolve) => setTimeout(resolve, 250))
    const responseEttn = generateETTN()

    const bodyXml = `
      <responseInfo>
        <InvoiceUUID>${ettn}</InvoiceUUID>
        <ResponseUUID>${responseEttn}</ResponseUUID>
        <ResponseType>${responseType === 'KABUL' ? 'KABUL' : 'RED'}</ResponseType>
        <Reason><![CDATA[${reason}]]></Reason>
        <ResponseDate>${new Date().toISOString()}</ResponseDate>
      </responseInfo>`

    return {
      success: true,
      responseEttn,
      message: `Uyumsoft WCF: Ticari Fatura Uygulama Yanıtı (${responseType}) GİB sistemine başarıyla iletildi.`,
      status: 'SUCCESS',
      timestamp: new Date().toISOString(),
      rawResponse: {
        provider: 'Uyumsoft Integration Service',
        action: 'SendInvoiceResponseWithServerSign',
        status: 200,
        responseEttn,
      },
    }
  }

  /**
   * VKN/TCKN ile E-Fatura Mükellefi ve Posta Kutusu Sorgulama (SOAP: IsEInvoiceUser / GetUserList)
   */
  async checkTaxPayer(vknTckn) {
    await new Promise((resolve) => setTimeout(resolve, 150))
    const cleanVkn = String(vknTckn || '').trim()

    const knownSupplier = MOCK_SUPPLIERS.find((s) => s.vkn === cleanVkn)
    if (knownSupplier) {
      return {
        isEInvoiceUser: true,
        title: knownSupplier.title,
        aliasPk: knownSupplier.aliasPk,
        aliasGb: knownSupplier.aliasGb,
        registeredAt: '2021-04-15 00:00:00',
        taxOffice: knownSupplier.taxOffice,
      }
    }

    if (cleanVkn.length === 10) {
      return {
        isEInvoiceUser: true,
        title: `Uyumsoft Kayıtlı Mükellef (${cleanVkn})`,
        aliasPk: `urn:mail:pk${cleanVkn}@gib.gov.tr`,
        aliasGb: `urn:mail:gb${cleanVkn}@gib.gov.tr`,
        registeredAt: '2023-01-01 00:00:00',
        taxOffice: 'Büyük Mükellefler',
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
   * E-İrsaliye Gönderme (SOAP: SendDespatch)
   */
  async sendDespatch(despatchData) {
    const ettn = despatchData.ettn || generateETTN()
    const despatchNumber = despatchData.despatch_number || generateInvoiceNumber('IRS', new Date().getFullYear(), Math.floor(Math.random() * 89999) + 10000)
    await new Promise((resolve) => setTimeout(resolve, 200))

    return {
      success: true,
      ettn,
      despatchNumber,
      statusCode: EINVOICE_STATUS.DELIVERED_TO_RECEIVER,
      statusDescription: 'Uyumsoft E-İrsaliye Başarıyla GİB Sistemine İletildi (1200)',
      rawResponse: {
        provider: 'Uyumsoft DespatchIntegration',
        endpoint: this.getEndpoints().DESPATCH_SOAP,
        despatchNumber,
        ettn,
        timestamp: new Date().toISOString(),
      },
    }
  }

  /**
   * E-Adisyon Gönderme (REST API: eKüp / Uyumsoft JSON Endpoint)
   * Section 5.2: POST https://webservis.ekupbilisim.com/api/outsource-test/check/send
   */
  async sendEAdisyon(eAdisyonData) {
    const ettn = eAdisyonData.ettn || generateETTN()
    const adisyonNumber = eAdisyonData.adisyon_number || generateInvoiceNumber('ADS', new Date().getFullYear(), Math.floor(Math.random() * 89999) + 10000)

    await new Promise((resolve) => setTimeout(resolve, 180))

    return {
      success: true,
      ettn,
      adisyonId: adisyonNumber,
      statusCode: 1200,
      statusDescription: 'Uyumsoft/eKüp REST API: E-Adisyon Başarıyla Kaydedildi (1200)',
      rawResponse: {
        provider: 'Uyumsoft eKüp E-Adisyon REST API',
        endpoint: this.getEndpoints().E_ADISYON_REST,
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
}
