import { IntegratorAdapter } from './integratorAdapter.js'
import { EINVOICE_STATUS, EINVOICE_STATUS_META } from './types.js'
import { generateETTN, generateInvoiceNumber, calculateInvoiceTotals, generateUBLXML } from './coreUblGenerator.js'
import { db } from '../db.js'

// Restoran & Yeme-İçme Sektörüne Özel Gerçekçi Tedarikçi Listesi
export const MOCK_SUPPLIERS = [
  {
    vkn: '3248921839',
    title: 'Öztürkler Et & Entegre Tesisleri San. Tic. Ltd. Şti.',
    taxOffice: 'Marmara Kurumlar',
    address: 'Hadımköy Sanayi Bölgesi 4. Cad. No:18 Arnavutköy / İstanbul',
    aliasPk: 'urn:mail:ozturkleretpk@gib.gov.tr',
    aliasGb: 'urn:mail:ozturkleretgb@gib.gov.tr',
    category: 'Et & Şarküteri',
    items: [
      { name: 'Dana Antrikot Özel Kesim (KG)', code: 'ET-DAN-001', unit: 'KGM', price: 620.0, taxRate: 1 },
      { name: 'Dana Kıyma %20 Yağlı (KG)', code: 'ET-DAN-002', unit: 'KGM', price: 440.0, taxRate: 1 },
      { name: 'Kuzu Gerdan & Kol (KG)', code: 'ET-KUZ-003', unit: 'KGM', price: 540.0, taxRate: 1 },
      { name: 'Burger Köftesi Özel Reçete 140g (Adet)', code: 'ET-KOF-004', unit: 'C62', price: 78.0, taxRate: 1 },
      { name: 'Dana İlikli Kemik Suyu 1L (Adet)', code: 'ET-KMK-005', unit: 'C62', price: 95.0, taxRate: 1 },
    ],
  },
  {
    vkn: '7829104820',
    title: 'Sütaş Süt & Süt Ürünleri A.Ş.',
    taxOffice: 'Bursa Kurumlar',
    address: 'Karacabey Tesisleri No:44 Karacabey / Bursa',
    aliasPk: 'urn:mail:sutaspk@gib.gov.tr',
    aliasGb: 'urn:mail:sutasgb@gib.gov.tr',
    category: 'Süt & Süt Ürünleri',
    items: [
      { name: 'Taze Burger Kaşar Peyniri Dilimli 1KG', code: 'SUT-KSR-001', unit: 'KGM', price: 340.0, taxRate: 1 },
      { name: 'Tuzsuz Blok Tereyağı 1KG (%82 Yağ)', code: 'SUT-TRY-002', unit: 'KGM', price: 390.0, taxRate: 1 },
      { name: 'Yemeklik Sıvı Krema %35 Yağ 1L', code: 'SUT-KRM-003', unit: 'LTR', price: 145.0, taxRate: 1 },
      { name: 'Süzme Yoğurt 5KG Kova', code: 'SUT-YGT-004', unit: 'PK', price: 290.0, taxRate: 1 },
      { name: 'Mozzarella Peyniri Blok 2KG', code: 'SUT-MOZ-005', unit: 'PK', price: 680.0, taxRate: 1 },
    ],
  },
  {
    vkn: '5120938471',
    title: 'Marmara Meşrubat & İçecek Dağıtım San. Tic. A.Ş.',
    taxOffice: 'Kadıköy',
    address: 'Dudullu OSB İmes Sanayi Sitesi E Blok No:12 Ümraniye / İstanbul',
    aliasPk: 'urn:mail:marmaraicecekpk@gib.gov.tr',
    aliasGb: 'urn:mail:marmaraicecekgb@gib.gov.tr',
    category: 'İçecek & Meşrubat',
    items: [
      { name: 'Kutu Kola 330ml (24 lü Koli)', code: 'IC-KOL-024', unit: 'BX', price: 480.0, taxRate: 10 },
      { name: 'Doğal Kaynak Maden Suyu 200ml (24 lü Koli)', code: 'IC-MDS-024', unit: 'BX', price: 210.0, taxRate: 10 },
      { name: 'Geleneksel Cam Şişe Ayran 300ml (20 li Kasa)', code: 'IC-AYR-020', unit: 'BX', price: 300.0, taxRate: 1 },
      { name: 'Şeftali Soğuk Çay 330ml (24 lü Koli)', code: 'IC-CAY-024', unit: 'BX', price: 460.0, taxRate: 10 },
      { name: 'Doğal Kaynak Suyu 0.5L (24 lü Paket)', code: 'IC-SU-024', unit: 'PK', price: 120.0, taxRate: 10 },
    ],
  },
  {
    vkn: '9018274619',
    title: 'Başak Un & Ekmekçilik Fırın Ürünleri Gıda San. A.Ş.',
    taxOffice: 'Güneşli',
    address: 'İkitelli OSB Atatürk Cad. No:94 Başakşehir / İstanbul',
    aliasPk: 'urn:mail:basakbreadpk@gib.gov.tr',
    aliasGb: 'urn:mail:basakbreadgb@gib.gov.tr',
    category: 'Unlu Mamuller',
    items: [
      { name: 'Brioche Gurme Hamburger Ekmeği 85g (50 li Koli)', code: 'EKM-BRC-050', unit: 'BX', price: 550.0, taxRate: 1 },
      { name: 'Susamlı Klasik Burger Ekmeği 80g (60 lı Koli)', code: 'EKM-KLK-060', unit: 'BX', price: 480.0, taxRate: 1 },
      { name: 'Ekşi Mayalı Sandviç Baget Ekmeği 120g (30 lu Koli)', code: 'EKM-EKS-030', unit: 'BX', price: 420.0, taxRate: 1 },
      { name: 'Altın Galeta Unu & Pane Harcı 10KG', code: 'EKM-PNE-010', unit: 'PK', price: 360.0, taxRate: 1 },
    ],
  },
  {
    vkn: '4459102837',
    title: 'Antalya Fresh Halil Toptan Sebze Meyve Ticaret',
    taxOffice: 'Kepez',
    address: 'Büyükşehir Toptancı Hali 12. Blok No:8 Antalya',
    aliasPk: 'urn:mail:antalyahalilpk@gib.gov.tr',
    aliasGb: 'urn:mail:antalyahalilgb@gib.gov.tr',
    category: 'Taze Sebze & Meyve',
    items: [
      { name: 'Salkım Domates 1. Sınıf (KG)', code: 'SEB-DOM-001', unit: 'KGM', price: 42.0, taxRate: 1 },
      { name: 'Kıvırcık Marul Gurme (Kasa - 20 Adet)', code: 'SEB-MRL-020', unit: 'BX', price: 320.0, taxRate: 1 },
      { name: 'Yerli Kırmızı Soğan (KG)', code: 'SEB-SGN-001', unit: 'KGM', price: 24.0, taxRate: 1 },
      { name: 'Kızartmalık Agria Patates (KG)', code: 'SEB-PAT-001', unit: 'KGM', price: 28.0, taxRate: 1 },
      { name: 'Kornişon Turşuluk Salatalık (KG)', code: 'SEB-SLT-001', unit: 'KGM', price: 38.0, taxRate: 1 },
    ],
  },
  {
    vkn: '6678291041',
    title: 'Eko Ambalaj & Restoran Hijyen San. ve Tic. Ltd. Şti.',
    taxOffice: 'İkitelli',
    address: 'Turgut Özal Cad. No:31 İkitelli OSB Başakşehir / İstanbul',
    aliasPk: 'urn:mail:ekoambalajpk@gib.gov.tr',
    aliasGb: 'urn:mail:ekoambalajgb@gib.gov.tr',
    category: 'Ambalaj & Hijyen',
    items: [
      { name: 'Kraft Burger Paketleme Kutusu Logolu (500 Adet Koli)', code: 'AMB-KRF-500', unit: 'BX', price: 1150.0, taxRate: 20 },
      { name: 'Islak Mendil Özel Baskılı 6x12 (1000 Adet)', code: 'AMB-MND-1000', unit: 'BX', price: 650.0, taxRate: 20 },
      { name: 'Siyah Kağıt Pipet Biyobozunur (500 Adet)', code: 'AMB-PPT-500', unit: 'PK', price: 220.0, taxRate: 20 },
      { name: 'Endüstriyel Bulaşık Makinesi Deterjanı 20L', code: 'HIJ-DTJ-020', unit: 'PK', price: 1450.0, taxRate: 20 },
      { name: 'Yüzey Dezenfektanı Gıda Temasına Uygun 5L', code: 'HIJ-DZF-005', unit: 'PK', price: 420.0, taxRate: 20 },
    ],
  },
]

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
    const supplier = MOCK_SUPPLIERS.find((s) => s.vkn === vknTckn)
    if (supplier) {
      return {
        isEInvoiceUser: true,
        title: supplier.title,
        aliasPk: supplier.aliasPk,
        aliasGb: supplier.aliasGb,
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
   * 1-Click Sandbox Test Faturası Oluşturucu (Senaryo Bazlı)
   * @param {'MATCHED' | 'PRICE_DIFF' | 'SHORTAGE' | 'NEW_SUPPLIER' | 'REJECTABLE' | 'EARSIV'} scenario
   */
  async generateSimulatedInboundInvoice(scenario = 'MATCHED') {
    const supplierIdx = Math.floor(Math.random() * MOCK_SUPPLIERS.length)
    const supplier = scenario === 'NEW_SUPPLIER' 
      ? {
          vkn: '9988776655',
          title: 'Anadolu Organik Çiftlik Ürünleri Ltd. Şti.',
          taxOffice: 'Seyhan',
          address: 'Barajyolu Mah. No:88 Seyhan / Adana',
          aliasPk: 'urn:mail:anadoluorganikpk@gib.gov.tr',
          aliasGb: 'urn:mail:anadoluorganikgb@gib.gov.tr',
          category: 'Organik Ürünler',
          items: [
            { name: 'Köy Tipi Gezen Tavuk Yumurtası (30 lu Viyol)', code: 'YUM-ORG-030', unit: 'PK', price: 185.0, taxRate: 1 },
            { name: 'Taş Baskı Soğuk Sıkım Zeytinyağı 5L', code: 'ZTN-YAG-005', unit: 'PK', price: 1650.0, taxRate: 1 },
          ],
        }
      : MOCK_SUPPLIERS[supplierIdx]

    const ettn = generateETTN()
    const invoiceNumber = generateInvoiceNumber('GIB', new Date().getFullYear(), Math.floor(Math.random() * 900000) + 100000)
    const issueDate = new Date().toISOString().split('T')[0]
    const issueTime = new Date().toTimeString().split(' ')[0]

    let profileId = 'TICARIFATURA'
    let statusCode = EINVOICE_STATUS.DELIVERED_TO_RECEIVER // 1200
    let statusDescription = 'Alıcıya Ulaştı (Kabul/Red Bekliyor - 1200)'

    if (scenario === 'EARSIV') {
      profileId = 'EARSIVFATURA'
      statusCode = EINVOICE_STATUS.ACCEPTED // 1300
      statusDescription = 'e-Arşiv Fatura Düzenlendi (1300)'
    }

    // Pick 2-4 items
    const selectedItems = supplier.items.slice(0, Math.min(supplier.items.length, Math.floor(Math.random() * 3) + 2))
    const lines = selectedItems.map((item, idx) => {
      let qty = Math.floor(Math.random() * 8) + 2
      let unitPrice = item.price

      // Senaryolara göre varyasyonlar ekle
      if (scenario === 'PRICE_DIFF' && idx === 0) {
        unitPrice = Math.round(unitPrice * 1.25) // %25 zamlı faturalandırılmış
      } else if (scenario === 'SHORTAGE' && idx === 0) {
        qty = qty + 10 // Faturada 10 birim fazla kesilmiş (Eksik teslimat)
      }

      const subtotal = Math.round(qty * unitPrice * 100) / 100
      const taxRate = item.taxRate
      const taxAmount = Math.round((subtotal * taxRate) / 100 * 100) / 100

      return {
        line_number: idx + 1,
        item_name: item.name,
        item_code: item.code,
        invoiced_quantity: qty,
        unit_code: item.unit,
        unit_price: unitPrice,
        subtotal,
        discount_rate: 0,
        discount_amount: 0,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total_line_amount: subtotal + taxAmount,
      }
    })

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
      sender_vkn_tckn: supplier.vkn,
      sender_title: supplier.title,
      sender_tax_office: supplier.taxOffice,
      sender_address: supplier.address,
      sender_alias: supplier.aliasGb,
      receiver_vkn_tckn: '1234567890',
      receiver_title: 'SuitableRMS Restoran Grubu A.Ş.',
      receiver_tax_office: 'Beşiktaş',
      receiver_address: 'Nispetiye Cad. No:12 Beşiktaş / İstanbul',
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
   * Giden Fatura Simülasyonu Oluşturucu (Restoranımızın Kestiği Fatura)
   */
  async generateSimulatedOutboundInvoice(params = {}) {
    const ettn = generateETTN()
    const invoiceNumber = generateInvoiceNumber('RMS', new Date().getFullYear(), Math.floor(Math.random() * 900000) + 100000)
    const issueDate = new Date().toISOString().split('T')[0]
    const issueTime = new Date().toTimeString().split(' ')[0]

    const receiverTitle = params.receiverTitle || 'Büyükdere Kurumsal Catering & Organizasyon Ltd. Şti.'
    const receiverVkn = params.receiverVkn || '8839201948'
    const profileId = params.profileId || 'TICARIFATURA'

    const lines = [
      {
        line_number: 1,
        item_name: 'Kurumsal Şirket Yemeği & Catering Hizmeti (Kişi Başı)',
        item_code: 'SRV-CAT-001',
        invoiced_quantity: 45,
        unit_code: 'PR',
        unit_price: 320.0,
        subtotal: 14400.0,
        tax_rate: 10,
        tax_amount: 1440.0,
        total_line_amount: 15840.0,
      },
      {
        line_number: 2,
        item_name: 'Özel Karşılama İçecek & Tatlı Büfesi Hizmeti',
        item_code: 'SRV-BUF-002',
        invoiced_quantity: 1,
        unit_code: 'SET',
        unit_price: 4500.0,
        subtotal: 4500.0,
        tax_rate: 10,
        tax_amount: 450.0,
        total_line_amount: 4950.0,
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
      status_code: EINVOICE_STATUS.DELIVERED_TO_RECEIVER, // 1200
      status_description: 'Alıcı Posta Kutusuna Başarıyla İletildi (1200)',
      currency_code: 'TRY',
      currency_rate: 1.0,
      sender_vkn_tckn: '1234567890',
      sender_title: 'SuitableRMS Restoran Grubu A.Ş.',
      sender_tax_office: 'Beşiktaş',
      sender_address: 'Nispetiye Cad. No:12 Beşiktaş / İstanbul',
      sender_alias: 'urn:mail:defaultgb@gib.gov.tr',
      receiver_vkn_tckn: receiverVkn,
      receiver_title: receiverTitle,
      receiver_tax_office: 'Büyükdere',
      receiver_address: 'Büyükdere Cad. No:102 Maslak / İstanbul',
      receiver_alias: 'urn:mail:kurumsalcateringpk@gib.gov.tr',
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
}

export const mockIntegratorAdapter = new MockIntegratorAdapter()
