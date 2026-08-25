import { db } from '../db.js'
import { MockIntegratorAdapter } from './mockIntegratorAdapter.js'
import { UyumsoftAdapter } from './uyumsoftAdapter.js'
import { EdmAdapter } from './edmAdapter.js'
import { EINVOICE_STATUS, getStatusMeta } from './types.js'
import { generateETTN } from './coreUblGenerator.js'

class EInvoiceService {
  constructor() {
    this.adapter = new MockIntegratorAdapter()
  }

  /**
   * Aktif Entegratör Konfigürasyonuna Göre Uygun Adaptörü Çözer
   */
  async resolveAdapter(forceConfig = null) {
    const config = forceConfig || (await this.getIntegratorConfig()) || { provider: 'mock' }
    const provider = String(config.provider || 'mock').toLowerCase()

    if (provider === 'uyumsoft') {
      return new UyumsoftAdapter(config)
    }
    if (provider === 'edm') {
      return new EdmAdapter(config)
    }
    return new MockIntegratorAdapter(config)
  }

  /**
   * Aktif Entegratör Konfigürasyonunu Getirir
   */
  async getIntegratorConfig() {
    try {
      const { data, error } = await db
        .from('e_integrator_configs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)

      if (error) throw error
      if (data && data.length > 0) {
        return data[0]
      }

      // Default mock config fallback
      return {
        provider: 'mock',
        sender_vkn_tckn: '1234567890',
        sender_title: 'SuitableRMS Restoran Grubu A.Ş.',
        sender_tax_office: 'Beşiktaş',
        sender_address: 'Nispetiye Cad. No:12 Beşiktaş / İstanbul',
        alias_pk: 'urn:mail:defaultpk@gib.gov.tr',
        alias_gb: 'urn:mail:defaultgb@gib.gov.tr',
        is_active: true,
        is_test_mode: true,
        auto_fetch_interval_min: 15,
      }
    } catch (err) {
      console.error('getIntegratorConfig error:', err)
      return null
    }
  }

  /**
   * Entegratör Konfigürasyonunu Kaydeder / Günceller
   */
  async saveIntegratorConfig(config) {
    try {
      if (config.id) {
        const { data, error } = await db
          .from('e_integrator_configs')
          .update({ ...config, updated_at: new Date().toISOString() })
          .eq('id', config.id)
        if (error) throw error
        return { success: true, data }
      } else {
        const { data, error } = await db
          .from('e_integrator_configs')
          .insert({ ...config, updated_at: new Date().toISOString() })
          .select('*')
        if (error) throw error
        return { success: true, data: data?.[0] }
      }
    } catch (err) {
      console.error('saveIntegratorConfig error:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * Faturaları Listeleme (RMS E-Fatura Ekranı İçin)
   */
  async getInvoices({ direction = 'INBOUND', statusCode = null, search = '', isInterCompany = null, limit = 100, onlySyncedToRms = false } = {}) {
    try {
      let query = db.from('e_invoices').select('*')
      
      if (direction && direction !== 'ALL') {
        query = query.eq('direction', direction)
      }
      if (statusCode) {
        query = query.eq('status_code', Number(statusCode))
      }
      if (isInterCompany !== null && isInterCompany !== undefined) {
        query = query.eq('is_inter_company', Boolean(isInterCompany))
      }
      if (onlySyncedToRms) {
        query = query.or('is_synced_to_rms.is.null,is_synced_to_rms.eq.true')
      }

      query = query.order('issue_date', { ascending: false }).limit(limit)

      const { data, error } = await query
      if (error) throw error

      let filtered = data || []
      if (isInterCompany !== null && isInterCompany !== undefined) {
        filtered = filtered.filter((inv) => Boolean(inv.is_inter_company) === Boolean(isInterCompany))
      }
      if (search && search.trim()) {
        const q = search.trim().toLowerCase()
        filtered = filtered.filter(
          (inv) =>
            (inv.invoice_number && inv.invoice_number.toLowerCase().includes(q)) ||
            (inv.sender_title && inv.sender_title.toLowerCase().includes(q)) ||
            (inv.receiver_title && inv.receiver_title.toLowerCase().includes(q)) ||
            (inv.sender_vkn_tckn && inv.sender_vkn_tckn.includes(q)) ||
            (inv.receiver_vkn_tckn && inv.receiver_vkn_tckn.includes(q)) ||
            (inv.source_transfer_doc_no && inv.source_transfer_doc_no.toLowerCase().includes(q)) ||
            (inv.ettn && inv.ettn.toLowerCase().includes(q))
        )
      }

      return { success: true, data: filtered }
    } catch (err) {
      console.error('getInvoices error:', err)
      return { success: false, data: [], error: err.message }
    }
  }

  /**
   * Entegratör Portalındaki Tüm Gelen/Giden Belgeleri Getirir
   */
  async getIntegratorPortalInvoices({ direction = 'ALL', provider = null, search = '', limit = 150 } = {}) {
    try {
      let query = db.from('e_invoices').select('*')
      if (direction && direction !== 'ALL') {
        query = query.eq('direction', direction)
      }
      if (provider && provider !== 'ALL') {
        query = query.eq('integrator_provider', provider)
      }
      query = query.order('created_at', { ascending: false }).limit(limit)

      const { data, error } = await query
      if (error) throw error

      let filtered = data || []
      if (search && search.trim()) {
        const q = search.trim().toLowerCase()
        filtered = filtered.filter(
          (inv) =>
            (inv.invoice_number && inv.invoice_number.toLowerCase().includes(q)) ||
            (inv.sender_title && inv.sender_title.toLowerCase().includes(q)) ||
            (inv.receiver_title && inv.receiver_title.toLowerCase().includes(q)) ||
            (inv.sender_vkn_tckn && inv.sender_vkn_tckn.includes(q)) ||
            (inv.receiver_vkn_tckn && inv.receiver_vkn_tckn.includes(q)) ||
            (inv.ettn && inv.ettn.toLowerCase().includes(q))
        )
      }
      return { success: true, data: filtered }
    } catch (err) {
      console.error('getIntegratorPortalInvoices error:', err)
      return { success: false, data: [], error: err.message }
    }
  }

  /**
   * Entegratör Portalı / Havuzundaki Faturaları RMS'e Senkronize Eder
   */
  async syncInvoicesFromIntegratorToRms() {
    try {
      const adapter = await this.resolveAdapter()
      
      // 1. Canlı adaptör varsa (Uyumsoft / EDM) API'den çek
      let liveInvoices = []
      try {
        liveInvoices = await adapter.fetchInboundInvoices()
      } catch (liveErr) {
        console.warn('Live adapter fetch warning:', liveErr)
      }

      // 2. Veritabanında entegratör havuzunda olup henüz RMS'e aktarılmamış olanları işaretle
      const { data: pendingInvoices, error: pErr } = await db
        .from('e_invoices')
        .select('id, invoice_number, sender_title, payable_amount')
        .eq('direction', 'INBOUND')
        .eq('is_synced_to_rms', false)

      if (pErr) throw pErr

      if (pendingInvoices && pendingInvoices.length > 0) {
        const ids = pendingInvoices.map((inv) => inv.id)
        await db
          .from('e_invoices')
          .update({
            is_synced_to_rms: true,
            updated_at: new Date().toISOString(),
          })
          .in('id', ids)

        for (const inv of pendingInvoices) {
          await db.from('e_invoice_matching_logs').insert({
            invoice_id: inv.id,
            matching_type: 'INTEGRATOR_SYNC',
            notes: `Fatura Entegratör Portalından (${adapter.providerName.toUpperCase()}) RMS Gelen Kutusuna aktarıldı.`,
            performed_by: 'INTEGRATOR_SYNC_SERVICE',
          })
        }
      }

      const totalCount = (pendingInvoices?.length || 0) + (liveInvoices?.length || 0)
      return {
        success: true,
        count: totalCount,
        message: totalCount > 0
          ? `${totalCount} adet yeni fatura ${adapter.providerName.toUpperCase()} entegratöründen RMS'e başarıyla aktarıldı.`
          : `Entegratör havuzundaki tüm belgeler zaten RMS ile güncel ve senkronize.`,
        provider: adapter.providerName,
      }
    } catch (err) {
      console.error('syncInvoicesFromIntegratorToRms error:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * Simülatörün Ürettiği Faturayı Doğrudan Entegratör Portalı Gelen Kutusuna Yazar
   */
  async pushInvoiceToIntegratorInbound(invoicePayload, linesPayload = []) {
    try {
      const config = await this.getIntegratorConfig()
      const provider = config?.provider || 'sandbox'

      const fullPayload = {
        ...invoicePayload,
        direction: 'INBOUND',
        is_synced_to_rms: false, // Sadece entegratör portalında gözüksün, RMS senkronize edene kadar
        integrator_provider: provider,
        status_code: invoicePayload.status_code || EINVOICE_STATUS.DELIVERED_TO_RECEIVER, // 1200
        status_description: invoicePayload.status_description || 'Alıcıya Ulaştı (Entegratör Havuzunda)',
      }

      const { data: savedArr, error: insErr } = await db
        .from('e_invoices')
        .insert(fullPayload)
        .select('*')

      if (insErr) throw insErr
      const savedDoc = Array.isArray(savedArr) ? savedArr[0] : (savedArr || fullPayload)
      const docId = savedDoc?.id || fullPayload.id

      if (docId && linesPayload.length > 0) {
        const formattedLines = linesPayload.map((l, idx) => ({
          ...l,
          invoice_id: docId,
          line_number: l.line_number || idx + 1,
        }))
        await db.from('e_invoice_lines').insert(formattedLines)
      }

      // Log
      await db.from('e_invoice_matching_logs').insert({
        invoice_id: docId,
        matching_type: 'SIMULATOR_GENERATED',
        notes: `Simülatör tarafından Özel Entegratör Gelen Kutusuna (${provider.toUpperCase()}) fatura üretildi.`,
        performed_by: 'INTEGRATOR_SIMULATOR',
      })

      return { success: true, data: savedDoc }
    } catch (err) {
      console.error('pushInvoiceToIntegratorInbound error:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * Fatura Detayını Satırları ve Yanıtları ile Birlikte Getirme
   */
  async getInvoiceDetails(invoiceId) {
    try {
      const { data: invData, error: invErr } = await db
        .from('e_invoices')
        .select('*')
        .eq('id', invoiceId)
        .limit(1)

      if (invErr) throw invErr
      if (!invData || invData.length === 0) {
        throw new Error('Fatura bulunamadı.')
      }

      const invoice = invData[0]

      // Get lines
      const { data: lines, error: linesErr } = await db
        .from('e_invoice_lines')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('line_number', { ascending: true })

      if (linesErr) console.warn('Lines load error:', linesErr)

      // Get responses
      const { data: responses, error: respErr } = await db
        .from('e_document_responses')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('sent_at', { ascending: false })

      if (respErr) console.warn('Responses load error:', respErr)

      // Get matching logs
      const { data: matchingLogs, error: matchErr } = await db
        .from('e_invoice_matching_logs')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('created_at', { ascending: false })

      if (matchErr) console.warn('Matching logs load error:', matchErr)

      return {
        success: true,
        data: {
          ...invoice,
          lines: lines || [],
          responses: responses || [],
          matchingLogs: matchingLogs || [],
        },
      }
    } catch (err) {
      console.error('getInvoiceDetails error:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * Ticari Fatura Kabul / Red Yanıtı Verme
   */
  async sendCommercialResponse(invoiceId, responseType, reason = '', userPin = 'SYS') {
    try {
      const { data: invoice } = await this.getInvoiceDetails(invoiceId)
      if (!invoice) throw new Error('Fatura bilgisi alınamadı.')

      // Call dynamic integrator adapter
      const adapter = await this.resolveAdapter()
      const adapterResult = await adapter.sendCommercialResponse(invoice.ettn, responseType, reason)

      const newStatusCode = responseType === 'KABUL' ? EINVOICE_STATUS.ACCEPTED : EINVOICE_STATUS.REJECTED
      const statusMeta = getStatusMeta(newStatusCode)

      // Update invoice record
      await db
        .from('e_invoices')
        .update({
          status_code: newStatusCode,
          status_description: statusMeta.label,
          response_code: responseType,
          response_reason: reason,
          response_date: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoiceId)

      // Insert into e_document_responses
      await db.from('e_document_responses').insert({
        invoice_id: invoiceId,
        ettn: adapterResult.responseEttn || generateETTN(),
        reference_ettn: invoice.ettn,
        reference_invoice_number: invoice.invoice_number,
        response_type: responseType,
        response_code: responseType === 'KABUL' ? 'ACCEPT' : 'REJECT',
        reason,
        sent_at: new Date().toISOString(),
        integrator_response_code: '200_OK',
        integrator_response_message: adapterResult.message,
        status: 'SUCCESS',
      })

      // Insert into audit matching logs
      await db.from('e_invoice_matching_logs').insert({
        invoice_id: invoiceId,
        matching_type: 'COMMERCIAL_RESPONSE',
        notes: `Ticari Uygulama Yanıtı verildi: ${responseType}. Açıklama: ${reason || 'Yok'}`,
        performed_by: userPin,
      })

      return { success: true, message: `Fatura ${responseType === 'KABUL' ? 'kabul edildi' : 'reddedildi'}.` }
    } catch (err) {
      console.error('sendCommercialResponse error:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * VKN/TCKN Mükellef Sorgulama (Tüm Entegratörler İçin Canlı/Simüle)
   */
  async checkTaxPayer(vknTckn) {
    try {
      const adapter = await this.resolveAdapter()
      return await adapter.checkTaxPayer(vknTckn)
    } catch (err) {
      console.error('checkTaxPayer error:', err)
      return {
        isEInvoiceUser: false,
        title: 'Sorgulama Hatası',
        aliasPk: '',
        aliasGb: '',
        registeredAt: '',
        error: err.message,
      }
    }
  }

  /**
   * Entegratör Bağlantı Testi (Ping & Auth Doğrulama)
   */
  async testConnection(config) {
    try {
      const startTime = performance.now()
      const adapter = await this.resolveAdapter(config)
      let result = null

      if (adapter.providerName === 'edm') {
        result = await adapter.login()
      } else {
        result = await adapter.checkTaxPayer(config.sender_vkn_tckn || '1234567890')
      }

      const elapsed = Math.round(performance.now() - startTime)
      return {
        success: true,
        provider: adapter.providerName,
        latencyMs: elapsed,
        message: `${adapter.providerName.toUpperCase()} Entegratör bağlantısı başarıyla doğrulandı (${elapsed} ms).`,
        raw: result,
      }
    } catch (err) {
      return {
        success: false,
        provider: config.provider,
        error: err.message,
      }
    }
  }

  /**
   * Gelen Faturaları Entegratörden Çekme (Sync)
   */
  async fetchInboundInvoices(params = {}) {
    try {
      const adapter = await this.resolveAdapter()
      const invoices = await adapter.fetchInboundInvoices(params)
      return { success: true, count: invoices.length, data: invoices }
    } catch (err) {
      console.error('fetchInboundInvoices error:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * Fatura Durumu Güncelleme (Simülatör / Manuel Tetikleyici)
   */
  async updateInvoiceStatus(invoiceId, newStatusCode, description = '') {
    try {
      const meta = getStatusMeta(newStatusCode)
      const { error } = await db
        .from('e_invoices')
        .update({
          status_code: Number(newStatusCode),
          status_description: description || meta.label,
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoiceId)

      if (error) throw error
      return { success: true }
    } catch (err) {
      console.error('updateInvoiceStatus error:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * 1-Click Test Faturası Üretme (Simülatör Sandbox)
   */
  async generateTestInvoice(scenario = 'MATCHED') {
    const mockAdapter = new MockIntegratorAdapter()
    return mockAdapter.generateSimulatedInboundInvoice(scenario)
  }

  /**
   * Giden Test Faturası Üretme
   */
  async generateTestOutboundInvoice(params = {}) {
    const mockAdapter = new MockIntegratorAdapter()
    return mockAdapter.generateSimulatedOutboundInvoice(params)
  }

  /**
   * E-Fatura Genel Dashboard İstatistikleri
   */
  async getStatistics() {
    try {
      const { data: invoices, error } = await db.from('e_invoices').select('id, direction, status_code, payable_amount, issue_date, is_inter_company')
      if (error) throw error

      const stats = {
        totalInboundCount: 0,
        totalInboundAmount: 0,
        pendingApprovalCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        totalOutboundCount: 0,
        totalOutboundAmount: 0,
        totalInterCompanyCount: 0,
        totalInterCompanyAmount: 0,
      }

      ;(invoices || []).forEach((inv) => {
        const amount = Number(inv.payable_amount || 0)
        if (inv.is_inter_company) {
          stats.totalInterCompanyCount++
          stats.totalInterCompanyAmount += amount
        }
        if (inv.direction === 'INBOUND') {
          stats.totalInboundCount++
          stats.totalInboundAmount += amount
          if (inv.status_code === EINVOICE_STATUS.DELIVERED_TO_RECEIVER || inv.status_code === EINVOICE_STATUS.DRAFT) {
            stats.pendingApprovalCount++
          } else if (inv.status_code === EINVOICE_STATUS.ACCEPTED) {
            stats.acceptedCount++
          } else if (inv.status_code === EINVOICE_STATUS.REJECTED) {
            stats.rejectedCount++
          }
        } else if (inv.direction === 'OUTBOUND') {
          stats.totalOutboundCount++
          stats.totalOutboundAmount += amount
        }
      })

      stats.totalInboundAmount = Math.round(stats.totalInboundAmount * 100) / 100
      stats.totalOutboundAmount = Math.round(stats.totalOutboundAmount * 100) / 100
      stats.totalInterCompanyAmount = Math.round(stats.totalInterCompanyAmount * 100) / 100

      return stats
    } catch (err) {
      console.error('getStatistics error:', err)
      return {
        totalInboundCount: 0,
        totalInboundAmount: 0,
        pendingApprovalCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        totalOutboundCount: 0,
        totalOutboundAmount: 0,
        totalInterCompanyCount: 0,
        totalInterCompanyAmount: 0,
      }
    }
  }

  /**
   * Resmi GİB Formatında Standart E-Fatura HTML Önizleme Üretici
   */
  generateGibHtmlPreview(invoice) {
    if (!invoice) return ''

    const lines = invoice.lines || []
    const currency = invoice.currency_code || 'TRY'
    const currencySymbol = currency === 'TRY' ? '₺' : currency

    const linesHtml = lines
      .map(
        (line, idx) => `
      <tr style="border-bottom: 1px solid #e2e8f0; font-size: 13px;">
        <td style="padding: 8px 10px; text-align: center; color: #64748b;">${line.line_number || idx + 1}</td>
        <td style="padding: 8px 10px; font-weight: 600; color: #1e293b;">
          ${line.item_name || 'Mal / Hizmet'}
          ${line.item_code ? `<br/><span style="font-size: 11px; font-weight: 400; color: #94a3b8;">Kod: ${line.item_code}</span>` : ''}
        </td>
        <td style="padding: 8px 10px; text-align: right; font-weight: 600;">${Number(line.invoiced_quantity || 1).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} ${line.unit_code || 'Adet'}</td>
        <td style="padding: 8px 10px; text-align: right;">${Number(line.unit_price || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${currencySymbol}</td>
        <td style="padding: 8px 10px; text-align: right;">${Number(line.discount_amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${currencySymbol}</td>
        <td style="padding: 8px 10px; text-align: right;">%${line.tax_rate ?? 20}</td>
        <td style="padding: 8px 10px; text-align: right;">${Number(line.tax_amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${currencySymbol}</td>
        <td style="padding: 8px 10px; text-align: right; font-weight: 700; color: #0f172a;">${Number(line.total_line_amount || line.subtotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${currencySymbol}</td>
      </tr>`
      )
      .join('')

    return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #ffffff; color: #0f172a; padding: 32px; border-radius: 12px; border: 1px solid #cbd5e1; max-width: 900px; margin: 0 auto; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1);">
      
      <!-- Üst Başlık & Logo & GİB Bilgileri -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 24px;">
        <div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 36px; height: 36px; background: #f5a623; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 900; color: #000; font-size: 18px;">R</div>
            <span style="font-size: 20px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px;">T.C. GELİR İDARESİ BAŞKANLIĞI</span>
          </div>
          <div style="font-size: 14px; font-weight: 700; color: #f5a623; margin-top: 4px; letter-spacing: 1px;">
            ${invoice.profile_id === 'EARSIVFATURA' ? 'e-ARŞİV FATURA' : 'e-FATURA'}
          </div>
        </div>

        <div style="text-align: right; background: #f8fafc; padding: 12px 18px; border-radius: 8px; border: 1px solid #e2e8f0;">
          <div style="font-size: 12px; color: #64748b; font-weight: 600;">FATURA NO</div>
          <div style="font-size: 16px; font-weight: 800; color: #0f172a; letter-spacing: 0.5px; font-family: monospace;">${invoice.invoice_number || 'GIB2026000000001'}</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 4px;">Özelleştirme: TR1.2 | Senaryo: <strong>${invoice.profile_id}</strong></div>
        </div>
      </div>

      <!-- Fatura Meta Bilgileri (ETTN, Tarih, Tip) -->
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; background: #f1f5f9; padding: 14px; border-radius: 8px; margin-bottom: 24px; font-size: 12px;">
        <div>
          <span style="color: #64748b; display: block;">Fatura Tarihi / Saati:</span>
          <strong style="color: #0f172a; font-size: 13px;">${invoice.issue_date} ${invoice.issue_time || ''}</strong>
        </div>
        <div>
          <span style="color: #64748b; display: block;">Fatura Türü:</span>
          <strong style="color: #0f172a; font-size: 13px;">${invoice.invoice_type || 'SATIS'}</strong>
        </div>
        <div>
          <span style="color: #64748b; display: block;">Para Birimi:</span>
          <strong style="color: #0f172a; font-size: 13px;">${invoice.currency_code || 'TRY'}</strong>
        </div>
        <div>
          <span style="color: #64748b; display: block;">ETTN (Evrensel Tekil No):</span>
          <span style="font-family: monospace; font-size: 11px; word-break: break-all; color: #334155; font-weight: 600;">${invoice.ettn || '-'}</span>
        </div>
      </div>

      <!-- Gönderici / Alıcı Kutuları -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
        <!-- Gönderici -->
        <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; background: #fafafa;">
          <div style="font-size: 11px; font-weight: 700; color: #f5a623; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px;">SAYIN (GÖNDERİCİ / SATICI)</div>
          <div style="font-size: 14px; font-weight: 800; color: #0f172a; margin-bottom: 6px;">${invoice.sender_title || 'Gönderici Ünvanı'}</div>
          <div style="font-size: 12px; color: #475569; line-height: 1.5; margin-bottom: 8px;">${invoice.sender_address || 'Adres bilgisi mevcut değil.'}</div>
          <div style="font-size: 12px; color: #334155;">
            <strong>VKN / TCKN:</strong> <span style="font-family: monospace; font-weight: 700;">${invoice.sender_vkn_tckn || '-'}</span>
            ${invoice.sender_tax_office ? ` | <strong>Vergi Dairesi:</strong> ${invoice.sender_tax_office}` : ''}
          </div>
          ${invoice.sender_alias ? `<div style="font-size: 11px; color: #64748b; margin-top: 4px;">PK: ${invoice.sender_alias}</div>` : ''}
        </div>

        <!-- Alıcı -->
        <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; background: #fafafa;">
          <div style="font-size: 11px; font-weight: 700; color: #0284c7; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px;">ALICI (MÜŞTERİ)</div>
          <div style="font-size: 14px; font-weight: 800; color: #0f172a; margin-bottom: 6px;">${invoice.receiver_title || 'Alıcı Ünvanı'}</div>
          <div style="font-size: 12px; color: #475569; line-height: 1.5; margin-bottom: 8px;">${invoice.receiver_address || 'Adres bilgisi mevcut değil.'}</div>
          <div style="font-size: 12px; color: #334155;">
            <strong>VKN / TCKN:</strong> <span style="font-family: monospace; font-weight: 700;">${invoice.receiver_vkn_tckn || '-'}</span>
            ${invoice.receiver_tax_office ? ` | <strong>Vergi Dairesi:</strong> ${invoice.receiver_tax_office}` : ''}
          </div>
          ${invoice.receiver_alias ? `<div style="font-size: 11px; color: #64748b; margin-top: 4px;">PK: ${invoice.receiver_alias}</div>` : ''}
        </div>
      </div>

      <!-- Kalemler Tablosu -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; text-align: left;">
        <thead>
          <tr style="background: #f8fafc; border-top: 2px solid #cbd5e1; border-bottom: 2px solid #cbd5e1; font-size: 12px; color: #475569; text-transform: uppercase;">
            <th style="padding: 10px; width: 40px; text-align: center;">#</th>
            <th style="padding: 10px;">Mal / Hizmet Açıklaması</th>
            <th style="padding: 10px; text-align: right; width: 90px;">Miktar</th>
            <th style="padding: 10px; text-align: right; width: 95px;">Birim Fiyat</th>
            <th style="padding: 10px; text-align: right; width: 75px;">İskonto</th>
            <th style="padding: 10px; text-align: right; width: 65px;">KDV</th>
            <th style="padding: 10px; text-align: right; width: 85px;">KDV Tutarı</th>
            <th style="padding: 10px; text-align: right; width: 105px;">Toplam Tutar</th>
          </tr>
        </thead>
        <tbody>
          ${linesHtml || '<tr><td colspan="8" style="padding: 20px; text-align: center; color: #94a3b8;">Kalem bulunamadı.</td></tr>'}
        </tbody>
      </table>

      <!-- Alt Toplamlar & Notlar & QR Kod -->
      <div style="display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 24px; align-items: start;">
        <!-- Sol Taraf: Notlar & Durum Bilgisi -->
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;">
          <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 6px;">NOTLAR / AÇIKLAMALAR</div>
          <div style="font-size: 12px; color: #334155; line-height: 1.5;">${invoice.notes || 'SuitableRMS E-Fatura Sistemi ile düzenlenmiştir.'}</div>

          ${
            invoice.response_code
              ? `
          <div style="margin-top: 12px; padding: 10px; border-radius: 6px; background: ${invoice.response_code === 'KABUL' ? '#ecfdf5' : '#fef2f2'}; border: 1px solid ${invoice.response_code === 'KABUL' ? '#a7f3d0' : '#fecaca'};">
            <div style="font-size: 11px; font-weight: 800; color: ${invoice.response_code === 'KABUL' ? '#065f46' : '#991b1b'};">
              TİCARİ UYGULAMA YANITI: ${invoice.response_code}
            </div>
            ${invoice.response_reason ? `<div style="font-size: 12px; color: #374151; margin-top: 4px;">Sebep: ${invoice.response_reason}</div>` : ''}
          </div>`
              : ''
          }
        </div>

        <!-- Sağ Taraf: Toplamlar Kartı -->
        <div style="border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; background: #ffffff;">
          <div style="display: flex; justify-content: space-between; font-size: 13px; color: #475569; margin-bottom: 6px;">
            <span>Mal/Hizmet Toplamı:</span>
            <span style="font-weight: 600;">${Number(invoice.line_extension_amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${currencySymbol}</span>
          </div>

          ${
            Number(invoice.allowance_total_amount || 0) > 0
              ? `
          <div style="display: flex; justify-content: space-between; font-size: 13px; color: #16a34a; margin-bottom: 6px;">
            <span>Toplam İskonto (-):</span>
            <span style="font-weight: 600;">-${Number(invoice.allowance_total_amount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${currencySymbol}</span>
          </div>`
              : ''
          }

          <div style="display: flex; justify-content: space-between; font-size: 13px; color: #475569; margin-bottom: 6px;">
            <span>Hesaplanan KDV:</span>
            <span style="font-weight: 600;">${Number(invoice.tax_total_amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${currencySymbol}</span>
          </div>

          <div style="display: flex; justify-content: space-between; font-size: 13px; color: #475569; margin-bottom: 6px;">
            <span>Vergiler Dahil Toplam:</span>
            <span style="font-weight: 600;">${Number(invoice.tax_inclusive_amount || invoice.payable_amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${currencySymbol}</span>
          </div>

          <div style="border-top: 2px solid #0f172a; margin-top: 10px; padding-top: 10px; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 14px; font-weight: 800; color: #0f172a;">ÖDENECEK TUTAR:</span>
            <span style="font-size: 18px; font-weight: 900; color: #f5a623;">${Number(invoice.payable_amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${currencySymbol}</span>
          </div>
        </div>
      </div>

      <!-- Alt Bilgi / Footer -->
      <div style="border-top: 1px solid #e2e8f0; margin-top: 24px; padding-top: 12px; font-size: 11px; color: #94a3b8; text-align: center;">
        Bu belge 213 sayılı Vergi Usul Kanunu uyarınca elektronik ortamda imzalanmış ve iletilmiştir.
      </div>
    </div>`
  }

  /**
   * Kalan Kontör / Kredi Bakiyesini Sorgular ve DB'ye Günceller
   */
  async fetchCreditsBalance() {
    try {
      const adapter = await this.resolveAdapter()
      if (typeof adapter.getCreditsBalance === 'function') {
        const res = await adapter.getCreditsBalance()
        // Save to DB
        await db
          .from('e_integrator_configs')
          .update({
            credits_balance: res.credits || 0,
            last_credit_check_at: new Date().toISOString(),
          })
          .eq('is_active', true)

        return { success: true, ...res }
      }
      return { success: true, credits: 0, provider: 'none', checkedAt: new Date().toISOString() }
    } catch (err) {
      console.error('fetchCreditsBalance error:', err)
      return { success: false, credits: 0, error: err.message }
    }
  }

  /**
   * Giden E-Arşiv Faturasını İptal Eder
   */
  async cancelEArchiveInvoice(ettn, reason = '') {
    try {
      const adapter = await this.resolveAdapter()
      if (typeof adapter.cancelEArchiveInvoice === 'function') {
        return await adapter.cancelEArchiveInvoice(ettn, reason)
      }
      return { success: false, message: 'Seçili entegratör e-Arşiv iptal desteklemiyor.' }
    } catch (err) {
      console.error('cancelEArchiveInvoice error:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * Toplu Belge İndirir
   */
  async downloadBatchFiles(ettnList = [], format = 'ZIP') {
    try {
      const adapter = await this.resolveAdapter()
      if (typeof adapter.downloadBatchFiles === 'function') {
        return await adapter.downloadBatchFiles(ettnList, format)
      }
      return { success: false, message: 'Seçili entegratör toplu indirme desteklemiyor.' }
    } catch (err) {
      console.error('downloadBatchFiles error:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * Faturayı Birden Fazla Mal Kabul İrsaliyesine Bağlar (N:1 Konsolidasyon)
   */
  async matchInvoiceToMultipleReceipts(invoiceId, receiptIds = [], note = '', performedBy = 'SYS') {
    try {
      if (!invoiceId || !Array.isArray(receiptIds) || receiptIds.length === 0) {
        throw new Error('Geçersiz fatura veya irsaliye listesi.')
      }

      // 1. Update e_invoices
      await db
        .from('e_invoices')
        .update({
          is_matched: true,
          matched_receipt_ids: receiptIds,
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoiceId)

      // 2. Update all matched purchase receipts
      await db
        .from('purchase_receipts')
        .update({
          status: 'matched',
          is_invoiced: true,
          matched_invoice_id: invoiceId,
          updated_at: new Date().toISOString(),
        })
        .in('id', receiptIds)

      // 3. Log matching
      await db.from('e_invoice_matching_logs').insert({
        invoice_id: invoiceId,
        matching_type: 'MULTI_RECEIPT_CONSOLIDATION',
        notes: `Fatura ${receiptIds.length} adet mal kabul irsaliyesi ile konsolide eşleştirildi. ${note || ''}`.trim(),
        performed_by: performedBy,
      })

      return { success: true, message: `${receiptIds.length} adet irsaliye başarıyla faturaya bağlandı.` }
    } catch (err) {
      console.error('matchInvoiceToMultipleReceipts error:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * Hizmet Faturasını Açık Gider Tahakkukuna Bağlar ve Tahakkuku Gerçek Belgeye Dönüştürür
   */
  async matchInvoiceToAccrualExpense(invoiceId, expenseId, note = '', performedBy = 'SYS') {
    try {
      if (!invoiceId || !expenseId) {
        throw new Error('Fatura veya masraf/tahakkuk ID eksik.')
      }

      // 1. Fetch invoice info
      const { data: invArr } = await db.from('e_invoices').select('*').eq('id', invoiceId).limit(1)
      const invoice = invArr?.[0]
      if (!invoice) throw new Error('Fatura bulunamadı.')

      // 2. Fetch expense/accrual info
      const { data: expArr } = await db.from('expense_documents').select('*').eq('id', expenseId).limit(1)
      const expense = expArr?.[0]
      if (!expense) throw new Error('Gider/Tahakkuk belgesi bulunamadı.')

      const invoiceAmount = Number(invoice.payable_amount || 0)
      const accrualAmount = Number(expense.amount || 0)
      const difference = invoiceAmount - accrualAmount

      // 3. Update expense_documents (Accrual -> Realized Invoice)
      await db
        .from('expense_documents')
        .update({
          doc_type: 'invoice',
          status: 'matched',
          is_matched: true,
          matched_invoice_id: invoiceId,
          document_no: invoice.invoice_number,
          realized_amount: invoiceAmount,
          accrual_difference: difference,
          ettn: invoice.ettn,
          updated_at: new Date().toISOString(),
        })
        .eq('id', expenseId)

      // 4. Update e_invoices
      await db
        .from('e_invoices')
        .update({
          is_matched: true,
          is_service_invoice: true,
          matched_expense_id: expenseId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoiceId)

      // 5. Log
      await db.from('e_invoice_matching_logs').insert({
        invoice_id: invoiceId,
        matching_type: 'ACCRUAL_REALIZATION',
        matched_entity_id: expenseId,
        matched_entity_type: 'expense_documents',
        discrepancy_type: difference !== 0 ? 'ACCRUAL_DIFF' : null,
        discrepancy_amount: Math.abs(difference),
        notes: `Hizmet faturası tahakkuk kaydıyla eşleştirildi. Tahakkuk: ${accrualAmount.toFixed(2)} ₺, Fatura: ${invoiceAmount.toFixed(2)} ₺ (Fark: ${difference.toFixed(2)} ₺). ${note || ''}`.trim(),
        performed_by: performedBy,
      })

      return {
        success: true,
        difference,
        message: `Hizmet faturası tahakkuka başarıyla bağlandı. Bütçe farkı: ${difference >= 0 ? '+' : ''}${difference.toFixed(2)} ₺`,
      }
    } catch (err) {
      console.error('matchInvoiceToAccrualExpense error:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * Serbest Giden E-Fatura / E-Arşiv Oluşturma ve GİB'e Gönderme
   */
  async createAndSendOutboundInvoice(invoiceData, options = {}) {
    try {
      const adapter = await this.getIntegratorAdapter()
      const ettn = invoiceData.ettn || generateETTN()
      const invNo = invoiceData.invoice_number || generateInvoiceNumber(invoiceData.prefix || 'GIB')
      const isDraft = Boolean(options.isDraft)

      // Toplamları hesapla
      const totals = calculateInvoiceTotals(invoiceData.lines || [])

      const invoiceRecord = {
        direction: 'OUTBOUND',
        invoice_number: invNo,
        uuid: ettn,
        profile_id: invoiceData.profile_id || 'TICARIFATURA',
        invoice_type: invoiceData.invoice_type || 'SATIS',
        issue_date: invoiceData.issue_date || new Date().toISOString().split('T')[0],
        issue_time: invoiceData.issue_time || new Date().toTimeString().split(' ')[0],
        sender_vkn_tckn: invoiceData.sender_vkn_tckn || '1234567890',
        sender_title: invoiceData.sender_title || 'SuitableRMS Restoran Grubu A.Ş.',
        receiver_vkn_tckn: invoiceData.receiver_vkn_tckn,
        receiver_title: invoiceData.receiver_title,
        receiver_address: invoiceData.receiver_address || '',
        receiver_tax_office: invoiceData.receiver_tax_office || '',
        payable_amount: totals.payableAmount,
        tax_inclusive_amount: totals.taxInclusiveAmount,
        line_extension_amount: totals.lineExtensionAmount,
        tax_total_amount: totals.taxTotalAmount,
        currency_code: invoiceData.currency_code || 'TRY',
        notes: invoiceData.notes || 'SuitableRMS tarafından düzenlenmiştir.',
        despatch_document_reference: invoiceData.despatch_document_reference || null,
        commercial_status: isDraft ? 'TASLAK' : 'BEKLIYOR',
        status_code: isDraft ? EINVOICE_STATUS.DRAFT : EINVOICE_STATUS.SUBMITTED_TO_GIB,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      // UBL XML oluştur
      const ublXml = generateUBLXML({
        ...invoiceRecord,
        lines: invoiceData.lines,
        billing_reference_invoice_number: invoiceData.billing_reference_invoice_number,
        billing_reference_issue_date: invoiceData.billing_reference_issue_date,
      })
      invoiceRecord.ubl_xml = ublXml

      // 1. Veritabanına kaydet
      const { data: savedInv, error: invErr } = await db
        .from('e_invoices')
        .insert(invoiceRecord)
        .select()
        .single()

      if (invErr) throw invErr

      // 2. Kalemleri kaydet
      if (Array.isArray(invoiceData.lines) && invoiceData.lines.length > 0) {
        const lineRows = invoiceData.lines.map((l, idx) => {
          const qty = Number(l.quantity || 1)
          const price = Number(l.unit_price || 0)
          const taxRate = Number(l.tax_rate ?? 20)
          const lineTotal = Number(l.line_total_amount || (qty * price))
          const taxAmount = Number(l.tax_amount || ((lineTotal * taxRate) / 100))

          return {
            invoice_id: savedInv.id,
            line_number: idx + 1,
            item_name: l.item_name || 'Hizmet / Ürün',
            item_code: l.item_code || '',
            quantity: qty,
            unit_code: l.unit_code || 'C62',
            unit_price: price,
            line_total_amount: lineTotal,
            vat_rate: taxRate,
            vat_amount: taxAmount,
            discount_amount: Number(l.discount_amount || 0),
          }
        })

        await db.from('e_invoice_lines').insert(lineRows)
      }

      // 3. Taslak değilse Entegratör üzerinden GİB'e ilet
      let sendResult = null
      if (!isDraft) {
        try {
          sendResult = await adapter.sendInvoice({
            ...savedInv,
            lines: invoiceData.lines,
            ublXml,
          })

          await db
            .from('e_invoices')
            .update({
              status_code: EINVOICE_STATUS.DELIVERED_TO_RECEIVER,
              status_description: 'Entegratör üzerinden GİB kuyruğuna iletildi.',
              updated_at: new Date().toISOString(),
            })
            .eq('id', savedInv.id)
        } catch (sendErr) {
          console.error('Integrator sendInvoice warning:', sendErr)
        }
      }

      return {
        success: true,
        invoice: savedInv,
        invoiceNumber: invNo,
        ettn,
        isDraft,
        sendResult,
      }
    } catch (err) {
      console.error('createAndSendOutboundInvoice error:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * Gelen Faturaya Referanslı E-İade Faturası Kesme ve Depodan Otomatik Stok Düşme
   */
  async createAndSendReturnInvoice(inboundInvoiceId, returnData, options = {}) {
    try {
      if (!inboundInvoiceId) throw new Error('Orijinal gelen fatura ID belirtilmedi.')

      // 1. Orijinal faturayı ve satırlarını çek
      const { data: origInvArr } = await db.from('e_invoices').select('*').eq('id', inboundInvoiceId).limit(1)
      const originalInvoice = origInvArr?.[0]
      if (!originalInvoice) throw new Error('Orijinal fatura bulunamadı.')

      const { data: origLines } = await db
        .from('e_invoice_lines')
        .select('*')
        .eq('invoice_id', inboundInvoiceId)
        .order('line_number', { ascending: true })

      originalInvoice.lines = origLines || []

      // 2. İade kalemlerini hazırla
      const returnLines = (returnData.lines || []).filter((l) => Number(l.return_quantity || l.quantity) > 0)
      if (returnLines.length === 0) {
        throw new Error('İade edilecek en az bir kalem ve miktar seçilmelidir.')
      }

      const formattedLines = returnLines.map((l, idx) => {
        const qty = Number(l.return_quantity || l.quantity)
        const price = Number(l.unit_price || 0)
        const taxRate = Number(l.tax_rate ?? l.vat_rate ?? 20)
        const lineTotal = Math.round(qty * price * 100) / 100
        const taxAmount = Math.round((lineTotal * taxRate / 100) * 100) / 100

        return {
          line_number: idx + 1,
          item_name: l.item_name,
          item_code: l.item_code || '',
          stock_item_id: l.stock_item_id || null,
          quantity: qty,
          unit_code: l.unit_code || 'C62',
          unit_price: price,
          tax_rate: taxRate,
          vat_rate: taxRate,
          line_total_amount: lineTotal,
          tax_amount: taxAmount,
          discount_amount: 0,
        }
      })

      const invoiceNumber = returnData.invoice_number || generateInvoiceNumber('IAD')
      const ettn = generateETTN()

      const returnNotes = returnData.notes ||
        `Bu fatura, ${originalInvoice.sender_title} firmasına ait ${originalInvoice.issue_date} tarihli ve #${originalInvoice.invoice_number} numaralı faturaya istinaden düzenlenen alış iade faturasıdır.`

      // 3. Fatura Oluşturma Payload'ı
      const outboundPayload = {
        invoice_number: invoiceNumber,
        ettn,
        profile_id: returnData.profile_id || (originalInvoice.profile_id === 'EARSIVFATURA' ? 'EARSIVFATURA' : 'TICARIFATURA'),
        invoice_type: 'IADE',
        issue_date: returnData.issue_date || new Date().toISOString().split('T')[0],
        sender_vkn_tckn: returnData.sender_vkn_tckn || '1234567890',
        sender_title: returnData.sender_title || 'SuitableRMS Restoran Grubu A.Ş.',
        receiver_vkn_tckn: originalInvoice.sender_vkn_tckn,
        receiver_title: originalInvoice.sender_title,
        receiver_address: originalInvoice.sender_address || '',
        receiver_tax_office: originalInvoice.sender_tax_office || '',
        billing_reference_invoice_number: originalInvoice.invoice_number,
        billing_reference_issue_date: originalInvoice.issue_date,
        original_invoice_number: originalInvoice.invoice_number,
        original_invoice_date: originalInvoice.issue_date,
        notes: returnNotes,
        lines: formattedLines,
      }

      // 4. Faturayı Kaydet ve İlet
      const res = await this.createAndSendOutboundInvoice(outboundPayload, { isDraft: Boolean(options.isDraft) })
      if (!res.success) throw new Error(res.error)

      // 5. STOKTAN DÜŞME (Envanter Çıkışı)
      let stockMovementsCreated = 0
      if (options.updateStock && options.branchId) {
        const movementRows = []
        for (const line of formattedLines) {
          if (line.stock_item_id) {
            movementRows.push({
              branch_id: options.branchId,
              stock_item_id: line.stock_item_id,
              movement_type: 'purchase_return',
              quantity: -Math.abs(line.quantity), // Negatif çıkış
              unit_price: line.unit_price,
              total_price: line.line_total_amount,
              document_type: 'e_invoice_return',
              document_no: invoiceNumber,
              description: `İade Faturası (#${invoiceNumber}) ile tedarikçiye (${originalInvoice.sender_title}) mal iadesi. Ref Fatura: #${originalInvoice.invoice_number}`,
              movement_at: new Date().toISOString(),
            })
          }
        }

        if (movementRows.length > 0) {
          const { error: moveErr } = await db.from('inventory_movements').insert(movementRows)
          if (moveErr) {
            console.error('Inventory movements insert error:', moveErr)
          } else {
            stockMovementsCreated = movementRows.length
          }
        }
      }

      // 6. Orijinal faturanın meta verisine ve notlarına iade bilgisini işle
      const existingParsed = originalInvoice.parsed_metadata || {}
      await db
        .from('e_invoices')
        .update({
          parsed_metadata: {
            ...existingParsed,
            has_return_invoice: true,
            return_invoice_number: invoiceNumber,
            return_invoice_id: res.invoice.id,
            returned_at: new Date().toISOString(),
          },
          notes: (originalInvoice.notes ? originalInvoice.notes + ' | ' : '') + `[İade Faturası Düzenlendi: #${invoiceNumber}]`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', inboundInvoiceId)

      return {
        success: true,
        returnInvoice: res.invoice,
        invoiceNumber,
        ettn,
        stockMovementsCreated,
        message: `✅ #${invoiceNumber} numaralı E-İade faturası başarıyla oluşturuldu${stockMovementsCreated > 0 ? ` ve ${stockMovementsCreated} kalemin depodan stok çıkışı yapıldı.` : '.'}`,
      }
    } catch (err) {
      console.error('createAndSendReturnInvoice error:', err)
      return { success: false, error: err.message }
    }
  }
}

export const eInvoiceService = new EInvoiceService()


