// Base Integrator Adapter Interface (Tüm e-Fatura Özel Entegratörleri İçin Soyut Sınıf)

export class IntegratorAdapter {
  constructor(config = {}) {
    this.config = config
    this.providerName = 'base'
  }

  /**
   * Giden E-Fatura Gönderme
   * @param {Object} invoiceData
   * @returns {Promise<{success: boolean, ettn: string, invoiceNumber: string, statusCode: number, statusDescription: string, rawResponse?: any}>}
   */
  async sendInvoice(_invoiceData) {
    throw new Error('sendInvoice method must be implemented by concrete adapter')
  }

  /**
   * Fatura Durumu Sorgulama (GİB / Entegratör Durum Kodu)
   * @param {string} _ettn
   * @returns {Promise<{ettn: string, statusCode: number, statusDescription: string, responseCode?: string, responseReason?: string}>}
   */
  async getInvoiceStatus(_ettn) {
    throw new Error('getInvoiceStatus method must be implemented by concrete adapter')
  }

  /**
   * Gelen Kutusu E-Faturalarını Çekme (GİB Posta Kutusu)
   * @param {{startDate?: string, endDate?: string, limit?: number}} _params
   * @returns {Promise<Array<Object>>}
   */
  async fetchInboundInvoices(_params = {}) {
    throw new Error('fetchInboundInvoices method must be implemented by concrete adapter')
  }

  /**
   * Ticari Fatura Kabul / Red Uygulama Yanıtı Gönderme (ApplicationResponse)
   * @param {string} _ettn
   * @param {'KABUL' | 'RED'} _responseType
   * @param {string} _reason
   * @returns {Promise<{success: boolean, responseEttn: string, message: string}>}
   */
  async sendCommercialResponse(_ettn, _responseType, _reason = '') {
    throw new Error('sendCommercialResponse method must be implemented by concrete adapter')
  }

  /**
   * Fatura UBL XML İçeriğini İndirme / Getirme
   * @param {string} _ettn
   * @returns {Promise<string>}
   */
  async getInvoiceXml(_ettn) {
    throw new Error('getInvoiceXml method must be implemented by concrete adapter')
  }

  /**
   * VKN/TCKN ile E-Fatura Mükellefi ve Posta Kutusu Sorgulama
   * @param {string} _vknTckn
   * @returns {Promise<{isEInvoiceUser: boolean, title: string, aliasPk: string, aliasGb: string, registeredAt: string}>}
   */
  async checkTaxPayer(_vknTckn) {
    throw new Error('checkTaxPayer method must be implemented by concrete adapter')
  }
}
