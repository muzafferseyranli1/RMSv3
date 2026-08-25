// SuitableRMS UBL-TR 2.1 Standart E-Fatura XML Üretici & Ayrıştırıcı (Core UBL Generator)

/**
 * UUID v4 Generator
 */
export function generateETTN() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * 16 Haneli Standart GİB Fatura Numarası Üretici
 * Örn: GIB2026000000001
 */
export function generateInvoiceNumber(prefix = 'GIB', year = new Date().getFullYear(), sequence = 1) {
  const p = (prefix || 'GIB').padEnd(3, 'X').substring(0, 3).toUpperCase()
  const y = String(year || new Date().getFullYear())
  const s = String(sequence || 1).padStart(9, '0')
  return `${p}${y}${s}`
}

/**
 * Fatura Satırlarından KDV Kırılımları ve Genel Toplamları Hesaplama
 */
export function calculateInvoiceTotals(lines = [], allowances = 0, charges = 0) {
  let lineExtensionAmount = 0
  const taxSubtotalsMap = {}

  lines.forEach((line) => {
    const qty = Number(line.invoiced_quantity || line.quantity || 1)
    const unitPrice = Number(line.unit_price || 0)
    const discountAmount = Number(line.discount_amount || 0)
    const lineSubtotal = Number(line.subtotal || Math.max(0, qty * unitPrice - discountAmount))
    
    lineExtensionAmount += lineSubtotal

    const taxRate = Number(line.tax_rate ?? 20)
    const lineTaxAmount = Number(line.tax_amount || (lineSubtotal * taxRate) / 100)

    if (!taxSubtotalsMap[taxRate]) {
      taxSubtotalsMap[taxRate] = {
        taxableAmount: 0,
        taxAmount: 0,
        rate: taxRate,
      }
    }

    taxSubtotalsMap[taxRate].taxableAmount += lineSubtotal
    taxSubtotalsMap[taxRate].taxAmount += lineTaxAmount
  })

  // Round subtotal sums to 2 decimals
  lineExtensionAmount = Math.round(lineExtensionAmount * 100) / 100
  const taxSubtotals = Object.values(taxSubtotalsMap).map((ts) => ({
    taxableAmount: Math.round(ts.taxableAmount * 100) / 100,
    taxAmount: Math.round(ts.taxAmount * 100) / 100,
    rate: ts.rate,
  }))

  const taxTotalAmount = Math.round(taxSubtotals.reduce((sum, ts) => sum + ts.taxAmount, 0) * 100) / 100
  const taxExclusiveAmount = Math.round((lineExtensionAmount - Number(allowances || 0) + Number(charges || 0)) * 100) / 100
  const taxInclusiveAmount = Math.round((taxExclusiveAmount + taxTotalAmount) * 100) / 100
  const payableAmount = taxInclusiveAmount

  return {
    lineExtensionAmount,
    taxExclusiveAmount,
    taxInclusiveAmount,
    allowanceTotalAmount: Number(allowances || 0),
    chargeTotalAmount: Number(charges || 0),
    taxTotalAmount,
    taxSubtotals,
    payableAmount,
  }
}

/**
 * UBL-TR 2.1 Standart XML Üretici
 */
export function generateUBLXML(invoice) {
  const totals = calculateInvoiceTotals(
    invoice.lines || [],
    invoice.allowance_total_amount,
    invoice.charge_total_amount
  )

  const ettn = invoice.ettn || generateETTN()
  const invoiceNumber = invoice.invoice_number || generateInvoiceNumber()
  const issueDate = invoice.issue_date || new Date().toISOString().split('T')[0]
  const issueTime = invoice.issue_time || new Date().toTimeString().split(' ')[0]
  const currencyCode = invoice.currency_code || 'TRY'
  const profileId = invoice.profile_id || 'TICARIFATURA'
  const invoiceType = invoice.invoice_type || 'SATIS'

  const sender = {
    vkn: invoice.sender_vkn_tckn || '1234567890',
    title: invoice.sender_title || 'SuitableRMS Restoran Grubu A.Ş.',
    taxOffice: invoice.sender_tax_office || 'Beşiktaş',
    address: invoice.sender_address || 'Nispetiye Cad. No:12 Beşiktaş / İstanbul',
    alias: invoice.sender_alias || 'urn:mail:defaultgb@gib.gov.tr',
  }

  const receiver = {
    vkn: invoice.receiver_vkn_tckn || '9876543210',
    title: invoice.receiver_title || 'Müşteri / Tedarikçi Ünvanı',
    taxOffice: invoice.receiver_tax_office || 'Kadıköy',
    address: invoice.receiver_address || 'Bağdat Cad. No:45 Kadıköy / İstanbul',
    alias: invoice.receiver_alias || 'urn:mail:defaultpk@gib.gov.tr',
  }

  const taxSubtotalsXml = totals.taxSubtotals
    .map(
      (ts) => `
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${currencyCode}">${ts.taxableAmount.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${currencyCode}">${ts.taxAmount.toFixed(2)}</cbc:TaxAmount>
      <cbc:Percent>${ts.rate}</cbc:Percent>
      <cac:TaxCategory>
        <cac:TaxScheme>
          <cbc:Name>KDV</cbc:Name>
          <cbc:TaxTypeCode>0015</cbc:TaxTypeCode>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`
    )
    .join('')

  const linesXml = (invoice.lines || [])
    .map((line, idx) => {
      const lineNum = line.line_number || idx + 1
      const qty = Number(line.invoiced_quantity || line.quantity || 1)
      const unitCode = line.unit_code || 'C62'
      const unitPrice = Number(line.unit_price || 0)
      const discount = Number(line.discount_amount || 0)
      const subtotal = Number(line.subtotal || Math.max(0, qty * unitPrice - discount))
      const taxRate = Number(line.tax_rate ?? 20)
      const taxAmount = Number(line.tax_amount || (subtotal * taxRate) / 100)

      return `
  <cac:InvoiceLine>
    <cbc:ID>${lineNum}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${unitCode}">${qty.toFixed(3)}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${currencyCode}">${subtotal.toFixed(2)}</cbc:LineExtensionAmount>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${currencyCode}">${taxAmount.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="${currencyCode}">${subtotal.toFixed(2)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="${currencyCode}">${taxAmount.toFixed(2)}</cbc:TaxAmount>
        <cbc:Percent>${taxRate}</cbc:Percent>
        <cac:TaxCategory>
          <cac:TaxScheme>
            <cbc:Name>KDV</cbc:Name>
            <cbc:TaxTypeCode>0015</cbc:TaxTypeCode>
          </cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Name>${escapeXml(line.item_name || 'Hizmet / Ürün')}</cbc:Name>
      ${line.item_code ? `<cac:SellersItemIdentification><cbc:ID>${escapeXml(line.item_code)}</cbc:ID></cac:SellersItemIdentification>` : ''}
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${currencyCode}">${unitPrice.toFixed(4)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`
    })
    .join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:ccts="urn:un:unece:uncefact:documentation:2"
  xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
  xmlns:ubltr="urn:oasis:names:specification:ubl:schema:xsd:TurkishCustomizationID"
  xmlns:qdt="urn:oasis:names:specification:ubl:schema:xsd:QualifiedDatatypes-2"
  xmlns:udt="urn:un:unece:uncefact:data:specification:UnqualifiedDataTypesSchemaModule:2"
  xmlns:xades="http://uri.etsi.org/01903/v1.3.2#"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2 UBL-Invoice-2.1.xsd">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>TR1.2</cbc:CustomizationID>
  <cbc:ProfileID>${profileId}</cbc:ProfileID>
  <cbc:ID>${invoiceNumber}</cbc:ID>
  <cbc:CopyIndicator>false</cbc:CopyIndicator>
  <cbc:UUID>${ettn}</cbc:UUID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${issueTime}</cbc:IssueTime>
  <cbc:InvoiceTypeCode>${invoiceType}</cbc:InvoiceTypeCode>
  ${invoice.notes ? `<cbc:Note>${escapeXml(invoice.notes)}</cbc:Note>` : '<cbc:Note>SuitableRMS E-Fatura Sistemi tarafından düzenlenmiştir.</cbc:Note>'}
  ${(invoice.billing_reference_invoice_number || invoice.original_invoice_number || invoice.billing_reference?.invoice_number) ? `
  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${escapeXml(invoice.billing_reference_invoice_number || invoice.original_invoice_number || invoice.billing_reference?.invoice_number)}</cbc:ID>
      <cbc:IssueDate>${escapeXml(invoice.billing_reference_issue_date || invoice.original_invoice_date || invoice.billing_reference?.issue_date || issueDate)}</cbc:IssueDate>
      <cbc:DocumentTypeCode>FATURA</cbc:DocumentTypeCode>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>` : ''}
  ${(invoice.despatch_document_reference || invoice.source_transfer_doc_no) ? `
  <cac:DespatchDocumentReference>
    <cbc:ID>${escapeXml(invoice.despatch_document_reference || invoice.source_transfer_doc_no)}</cbc:ID>
    <cbc:IssueDate>${issueDate}</cbc:IssueDate>
    <cbc:DocumentTypeCode>SEVK_IRSALIYESI</cbc:DocumentTypeCode>
  </cac:DespatchDocumentReference>` : ''}
  ${(invoice.linked_adisyon_ettn || invoice.e_adisyon_ettn || invoice.adisyon_ettn) ? `
  <cac:AdditionalDocumentReference>
    <cbc:ID>${escapeXml(invoice.linked_adisyon_ettn || invoice.e_adisyon_ettn || invoice.adisyon_ettn)}</cbc:ID>
    <cbc:IssueDate>${escapeXml(invoice.linked_adisyon_issue_date || invoice.issue_date || issueDate)}</cbc:IssueDate>
    <cbc:DocumentTypeCode>E-ADISYON</cbc:DocumentTypeCode>
    <cbc:DocumentType>Elektronik Adisyon</cbc:DocumentType>
  </cac:AdditionalDocumentReference>` : ''}
  ${Array.isArray(invoice.additional_document_references) ? invoice.additional_document_references.map(doc => `
  <cac:AdditionalDocumentReference>
    <cbc:ID>${escapeXml(doc.id || doc.uuid || doc.document_number)}</cbc:ID>
    <cbc:IssueDate>${escapeXml(doc.issue_date || issueDate)}</cbc:IssueDate>
    <cbc:DocumentTypeCode>${escapeXml(doc.document_type_code || 'OTHER')}</cbc:DocumentTypeCode>
    <cbc:DocumentType>${escapeXml(doc.document_type || 'Ek Belge')}</cbc:DocumentType>
  </cac:AdditionalDocumentReference>`).join('') : ''}
  
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${sender.vkn.length === 11 ? 'TCKN' : 'VKN'}">${sender.vkn}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${escapeXml(sender.title)}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(sender.address)}</cbc:StreetName>
        <cac:Country><cbc:Name>Türkiye</cbc:Name></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cac:TaxScheme>
          <cbc:Name>${escapeXml(sender.taxOffice)}</cbc:Name>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>

  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${receiver.vkn.length === 11 ? 'TCKN' : 'VKN'}">${receiver.vkn}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${escapeXml(receiver.title)}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(receiver.address)}</cbc:StreetName>
        <cac:Country><cbc:Name>Türkiye</cbc:Name></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cac:TaxScheme>
          <cbc:Name>${escapeXml(receiver.taxOffice)}</cbc:Name>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingCustomerParty>

  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${currencyCode}">${totals.taxTotalAmount.toFixed(2)}</cbc:TaxAmount>
    ${taxSubtotalsXml}
  </cac:TaxTotal>

  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${currencyCode}">${totals.lineExtensionAmount.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${currencyCode}">${totals.taxExclusiveAmount.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${currencyCode}">${totals.taxInclusiveAmount.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="${currencyCode}">${totals.allowanceTotalAmount.toFixed(2)}</cbc:AllowanceTotalAmount>
    <cbc:ChargeTotalAmount currencyID="${currencyCode}">${totals.chargeTotalAmount.toFixed(2)}</cbc:ChargeTotalAmount>
    <cbc:PayableAmount currencyID="${currencyCode}">${totals.payableAmount.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>

  ${linesXml}
</Invoice>`
}

/**
 * XML String Escape Helper
 */
function escapeXml(unsafe = '') {
  return String(unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Metin, Açıklama ve Not Alanlarından İrsaliye Numaralarını Ayıklar (Regex Destekli)
 * Örn: "Bu fatura IRS202600000014, GIB202600004512 nolu irsaliyeler karşılığıdır."
 */
export function extractDespatchNumbersFromText(text = '') {
  if (!text || typeof text !== 'string') return []
  const matches = new Set()

  // 1. Standart 16 haneli GİB e-İrsaliye ve e-Fatura formatı (3 Harf + 4 Yıl + 9 Rakam)
  const gibPattern = /\b([A-Z]{3}202[0-9]{10})\b/gi
  let m
  while ((m = gibPattern.exec(text)) !== null) {
    matches.add(m[1].toUpperCase())
  }

  // 2. "IRS-12345", "İRSALİYE: 987654", "No: 123456" kalıpları
  const irsPattern = /(?:irsaliye(?:\s+no)?|irs\.?\s*no?|despatch)\s*[:#\-]?\s*([A-Za-z0-9\-_/]{4,20})/gi
  while ((m = irsPattern.exec(text)) !== null) {
    const candidate = m[1].trim().toUpperCase()
    if (candidate.length >= 4 && !['NO', 'NUMARALI', 'TARIHLI', 'VE'].includes(candidate)) {
      matches.add(candidate)
    }
  }

  return Array.from(matches)
}

/**
 * Fatura Başlığı, Kalemleri ve Tedarikçi Ünvanından Hizmet/Gider Faturası Olup Olmadığını Tespit Eder
 */
export function detectServiceInvoice(invoiceData = {}, lines = []) {
  const serviceKeywords = [
    'elektrik', 'enerji', 'enerjisa', 'bedas', 'gediz', 'ayedas', 'ck bogazici',
    'su faturasi', 'iski', 'aski', 'izsu', 'dogalgaz', 'igdas', 'baskentgaz',
    'telekom', 'turkcell', 'vodafone', 'turk telekom', 'internet', 'fiber',
    'kira', 'aidat', 'yonetim', 'muhasebe', 'danismanlik', 'avukat', 'hukuk',
    'guvenlik', 'temizlik hizmeti', 'yazilim', 'lisans', 'bakim onarim', 'kargo', 'nakliye', 'tasima'
  ]

  const title = (invoiceData.sender_title || '').toLowerCase()
  const notes = (invoiceData.notes || '').toLowerCase()
  const hasTitleMatch = serviceKeywords.some(k => title.includes(k) || notes.includes(k))

  if (hasTitleMatch) return true

  // Satır bazında incele
  const lineMatchCount = (lines || []).filter(l => {
    const name = (l.item_name || '').toLowerCase()
    return serviceKeywords.some(k => name.includes(k))
  }).length

  return lineMatchCount > 0
}

/**
 * Derin UBL-TR 2.1 XML Ayrıştırıcı (Gelişmiş Meta Veri, Çoklu İrsaliye, Sipariş & Sevkiyat Adresi Ayrıştırma)
 */
export function parseUBLXML(xmlString) {
  try {
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml')

    const getText = (selector) => {
      const el = xmlDoc.querySelector(selector)
      return el ? el.textContent.trim() : ''
    }

    const ettn = getText('UUID') || getText('cbc\\:UUID')
    const invoiceNumber = getText('ID') || getText('cbc\\:ID')
    const profileId = getText('ProfileID') || getText('cbc\\:ProfileID') || 'TICARIFATURA'
    const invoiceType = getText('InvoiceTypeCode') || getText('cbc\\:InvoiceTypeCode') || 'SATIS'
    const issueDate = getText('IssueDate') || getText('cbc\\:IssueDate')
    const issueTime = getText('IssueTime') || getText('cbc\\:IssueTime')
    const currencyCode = getText('DocumentCurrencyCode') || getText('cbc\\:DocumentCurrencyCode') || 'TRY'

    // Tüm Note alanlarını topla
    const noteElements = xmlDoc.querySelectorAll('Note, cbc\\:Note')
    const noteList = Array.from(noteElements).map(n => n.textContent.trim()).filter(Boolean)
    const combinedNotes = noteList.join(' | ')

    const supplierParty = xmlDoc.querySelector('AccountingSupplierParty') || xmlDoc.querySelector('cac\\:AccountingSupplierParty')
    const customerParty = xmlDoc.querySelector('AccountingCustomerParty') || xmlDoc.querySelector('cac\\:AccountingCustomerParty')

    const senderTitle = supplierParty?.querySelector('PartyName Name, cac\\:PartyName cbc\\:Name')?.textContent?.trim() || ''
    const senderVkn = supplierParty?.querySelector('PartyIdentification ID, cac\\:PartyIdentification cbc\\:ID')?.textContent?.trim() || ''
    const senderTaxOffice = supplierParty?.querySelector('PartyTaxScheme TaxScheme Name, cac\\:PartyTaxScheme cac\\:TaxScheme cbc\\:Name')?.textContent?.trim() || ''
    const senderAddress = supplierParty?.querySelector('PostalAddress StreetName, cac\\:PostalAddress cbc\\:StreetName')?.textContent?.trim() || ''

    const receiverTitle = customerParty?.querySelector('PartyName Name, cac\\:PartyName cbc\\:Name')?.textContent?.trim() || ''
    const receiverVkn = customerParty?.querySelector('PartyIdentification ID, cac\\:PartyIdentification cbc\\:ID')?.textContent?.trim() || ''
    const receiverTaxOffice = customerParty?.querySelector('PartyTaxScheme TaxScheme Name, cac\\:PartyTaxScheme cac\\:TaxScheme cbc\\:Name')?.textContent?.trim() || ''
    const receiverAddress = customerParty?.querySelector('PostalAddress StreetName, cac\\:PostalAddress cbc\\:StreetName')?.textContent?.trim() || ''

    // 1. Çoklu İrsaliye Referansları (DespatchDocumentReference)
    const despatchRefs = []
    const despatchElements = xmlDoc.querySelectorAll('DespatchDocumentReference, cac\\:DespatchDocumentReference')
    despatchElements.forEach(el => {
      const dId = el.querySelector('ID, cbc\\:ID')?.textContent?.trim()
      const dDate = el.querySelector('IssueDate, cbc\\:IssueDate')?.textContent?.trim()
      if (dId) {
        despatchRefs.push({ id: dId, issue_date: dDate || issueDate })
      }
    })

    // Not alanlarından da ek irsaliye numaralarını topla
    const textDespatches = extractDespatchNumbersFromText(combinedNotes)
    textDespatches.forEach(dNo => {
      if (!despatchRefs.some(d => d.id.toUpperCase() === dNo.toUpperCase())) {
        despatchRefs.push({ id: dNo, issue_date: issueDate, source: 'note_extracted' })
      }
    })

    // 2. Sipariş Referansları (OrderReference)
    const orderRefs = []
    const orderElements = xmlDoc.querySelectorAll('OrderReference, cac\\:OrderReference')
    orderElements.forEach(el => {
      const oId = el.querySelector('ID, cbc\\:ID')?.textContent?.trim()
      const oDate = el.querySelector('IssueDate, cbc\\:IssueDate')?.textContent?.trim()
      if (oId) {
        orderRefs.push({ id: oId, issue_date: oDate || issueDate })
      }
    })

    // 3. Teslimat & Sevkiyat Adresi (Delivery & DeliveryAddress)
    const deliveryEl = xmlDoc.querySelector('Delivery, cac\\:Delivery')
    const deliveryAddress = deliveryEl?.querySelector('DeliveryAddress StreetName, cac\\:DeliveryAddress cbc\\:StreetName')?.textContent?.trim() ||
      deliveryEl?.querySelector('DeliveryAddress CitySubdivisionName, cac\\:DeliveryAddress cbc\\:CitySubdivisionName')?.textContent?.trim() || ''
    const deliveryPartyName = deliveryEl?.querySelector('DeliveryParty PartyName Name, cac\\:DeliveryParty cac\\:PartyName cbc\\:Name')?.textContent?.trim() || ''

    const monetaryTotal = xmlDoc.querySelector('LegalMonetaryTotal') || xmlDoc.querySelector('cac\\:LegalMonetaryTotal')
    const lineExtensionAmount = parseFloat(monetaryTotal?.querySelector('LineExtensionAmount, cbc\\:LineExtensionAmount')?.textContent || '0')
    const taxExclusiveAmount = parseFloat(monetaryTotal?.querySelector('TaxExclusiveAmount, cbc\\:TaxExclusiveAmount')?.textContent || '0')
    const taxInclusiveAmount = parseFloat(monetaryTotal?.querySelector('TaxInclusiveAmount, cbc\\:TaxInclusiveAmount')?.textContent || '0')
    const payableAmount = parseFloat(monetaryTotal?.querySelector('PayableAmount, cbc\\:PayableAmount')?.textContent || '0')

    const taxTotalEl = xmlDoc.querySelector('TaxTotal') || xmlDoc.querySelector('cac\\:TaxTotal')
    const taxTotalAmount = parseFloat(taxTotalEl?.querySelector('TaxAmount, cbc\\:TaxAmount')?.textContent || '0')

    const lineElements = xmlDoc.querySelectorAll('InvoiceLine, cac\\:InvoiceLine')
    const lines = Array.from(lineElements).map((el, idx) => {
      const lineNum = parseInt(el.querySelector('ID, cbc\\:ID')?.textContent || String(idx + 1), 10)
      const qtyEl = el.querySelector('InvoicedQuantity, cbc\\:InvoicedQuantity')
      const quantity = parseFloat(qtyEl?.textContent || '1')
      const unitCode = qtyEl?.getAttribute('unitCode') || 'C62'
      const itemName = el.querySelector('Item Name, cac\\:Item cbc\\:Name')?.textContent?.trim() || 'Ürün'
      const itemCode = el.querySelector('SellersItemIdentification ID, cac\\:SellersItemIdentification cbc\\:ID')?.textContent?.trim() || ''
      const subtotal = parseFloat(el.querySelector('LineExtensionAmount, cbc\\:LineExtensionAmount')?.textContent || '0')
      const unitPrice = parseFloat(el.querySelector('Price PriceAmount, cac\\:Price cbc\\:PriceAmount')?.textContent || '0')
      const taxRate = parseFloat(el.querySelector('TaxSubtotal Percent, cac\\:TaxSubtotal cbc\\:Percent')?.textContent || '20')
      const taxAmount = parseFloat(el.querySelector('TaxTotal TaxAmount, cac\\:TaxTotal cbc\\:TaxAmount')?.textContent || '0')

      return {
        line_number: lineNum,
        item_name: itemName,
        item_code: itemCode,
        invoiced_quantity: quantity,
        unit_code: unitCode,
        unit_price: unitPrice,
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total_line_amount: subtotal + taxAmount,
      }
    })

    // Additional Document References & Linked E-Adisyon
    const addDocEls = xmlDoc.querySelectorAll('AdditionalDocumentReference, cac\\:AdditionalDocumentReference')
    const additionalDocs = Array.from(addDocEls).map((el) => ({
      id: el.querySelector('ID, cbc\\:ID')?.textContent?.trim() || '',
      issue_date: el.querySelector('IssueDate, cbc\\:IssueDate')?.textContent?.trim() || '',
      document_type_code: el.querySelector('DocumentTypeCode, cbc\\:DocumentTypeCode')?.textContent?.trim() || '',
      document_type: el.querySelector('DocumentType, cbc\\:DocumentType')?.textContent?.trim() || '',
    }))

    const adisyonDoc = additionalDocs.find((d) => d.document_type_code === 'E-ADISYON' || d.document_type?.toLowerCase().includes('adisyon'))
    const linkedAdisyonEttn = adisyonDoc ? adisyonDoc.id : null

    // Hizmet Faturası Tespiti
    const isService = detectServiceInvoice(
      { sender_title: senderTitle, notes: combinedNotes },
      lines
    )

    const parsedMetadata = {
      despatch_references: despatchRefs,
      order_references: orderRefs,
      delivery_address: deliveryAddress,
      delivery_party_name: deliveryPartyName,
      extracted_despatch_numbers: despatchRefs.map(d => d.id),
      all_notes: noteList,
      is_service_detected: isService,
    }

    return {
      ettn,
      invoice_number: invoiceNumber,
      profile_id: profileId,
      invoice_type: invoiceType,
      issue_date: issueDate,
      issue_time: issueTime,
      currency_code: currencyCode,
      notes: combinedNotes,
      sender_title: senderTitle,
      sender_vkn_tckn: senderVkn,
      sender_tax_office: senderTaxOffice,
      sender_address: senderAddress,
      receiver_title: receiverTitle,
      receiver_vkn_tckn: receiverVkn,
      receiver_tax_office: receiverTaxOffice,
      receiver_address: receiverAddress,
      line_extension_amount: lineExtensionAmount,
      tax_exclusive_amount: taxExclusiveAmount,
      tax_inclusive_amount: taxInclusiveAmount,
      tax_total_amount: taxTotalAmount,
      payable_amount: payableAmount,
      lines,
      ubl_xml: xmlString,
      additional_document_references: additionalDocs,
      linked_adisyon_ettn: linkedAdisyonEttn,
      is_service_invoice: isService,
      parsed_metadata: parsedMetadata,
      despatch_document_reference: despatchRefs.length > 0 ? despatchRefs[0].id : null,
    }
  } catch (err) {
    console.error('UBL XML parse error:', err)
    return null
  }
}

/**
 * 16 Haneli Standart GİB e-İrsaliye Numarası Üretici (UBL-TR 2.1 DespatchAdvice)
 * Örn: IRS2026000000001
 */
export function generateDespatchNumber(prefix = 'IRS', year = new Date().getFullYear(), sequence = 1) {
  const p = (prefix || 'IRS').padEnd(3, 'X').substring(0, 3).toUpperCase()
  const y = String(year || new Date().getFullYear())
  const s = String(sequence || 1).padStart(9, '0')
  return `${p}${y}${s}`
}

/**
 * UBL-TR 2.1 Standart E-İrsaliye XML Üretici (UBL-TR DespatchAdvice)
 */
export function generateDespatchUBLXML(despatch) {
  const ettn = despatch.ettn || generateETTN()
  const despatchNumber = despatch.despatch_number || despatch.invoice_number || generateDespatchNumber()
  const issueDate = despatch.issue_date || new Date().toISOString().split('T')[0]
  const issueTime = despatch.issue_time || new Date().toTimeString().split(' ')[0]
  const notes = despatch.notes || 'SuitableRMS E-İrsaliye Sistemi tarafından düzenlenmiştir.'

  const sender = {
    vkn: despatch.sender_vkn_tckn || '1234567890',
    title: despatch.sender_title || 'SuitableRMS Restoran Grubu A.Ş.',
    taxOffice: despatch.sender_tax_office || 'Merkez',
    address: despatch.sender_address || 'Merkez Adresi',
  }

  const receiver = {
    vkn: despatch.receiver_vkn_tckn || '1234567890',
    title: despatch.receiver_title || 'Alıcı Şube / Depo',
    taxOffice: despatch.receiver_tax_office || 'Merkez',
    address: despatch.receiver_address || 'Teslimat Adresi',
  }

  const linesXml = (despatch.lines || [])
    .map((l, idx) => {
      const lineNum = l.line_number || idx + 1
      const qty = Number(l.invoiced_quantity || l.quantity || l.delivered_quantity || 1)
      const unitCode = l.unit_code || l.unit || 'C62'
      const itemName = l.item_name || 'Transfer Kalemi'
      const itemCode = l.item_code || l.sku || ''

      return `
    <cac:DespatchLine>
      <cbc:ID>${lineNum}</cbc:ID>
      <cbc:DeliveredQuantity unitCode="${unitCode}">${qty.toFixed(3)}</cbc:DeliveredQuantity>
      <cac:Item>
        <cbc:Name>${escapeXml(itemName)}</cbc:Name>
        ${itemCode ? `<cac:SellersItemIdentification><cbc:ID>${escapeXml(itemCode)}</cbc:ID></cac:SellersItemIdentification>` : ''}
      </cac:Item>
    </cac:DespatchLine>`
    })
    .join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<DespatchAdvice xmlns="urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>TR1.2</cbc:CustomizationID>
  <cbc:ProfileID>TEMELIRSALIYE</cbc:ProfileID>
  <cbc:ID>${despatchNumber}</cbc:ID>
  <cbc:CopyIndicator>false</cbc:CopyIndicator>
  <cbc:UUID>${ettn}</cbc:UUID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${issueTime}</cbc:IssueTime>
  <cbc:DespatchAdviceTypeCode>SEVK</cbc:DespatchAdviceTypeCode>
  <cbc:Note>${escapeXml(notes)}</cbc:Note>
  <cac:DespatchSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${sender.vkn.length === 11 ? 'TCKN' : 'VKN'}">${sender.vkn}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${escapeXml(sender.title)}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(sender.address)}</cbc:StreetName>
        <cac:Country><cbc:Name>Türkiye</cbc:Name></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cac:TaxScheme>
          <cbc:Name>${escapeXml(sender.taxOffice)}</cbc:Name>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:DespatchSupplierParty>
  <cac:DeliveryCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${receiver.vkn.length === 11 ? 'TCKN' : 'VKN'}">${receiver.vkn}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${escapeXml(receiver.title)}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(receiver.address)}</cbc:StreetName>
        <cac:Country><cbc:Name>Türkiye</cbc:Name></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cac:TaxScheme>
          <cbc:Name>${escapeXml(receiver.taxOffice)}</cbc:Name>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:DeliveryCustomerParty>
  <cac:Shipment>
    <cbc:ID>1</cbc:ID>
    <cac:Delivery>
      <cac:DeliveryAddress>
        <cbc:StreetName>${escapeXml(receiver.address)}</cbc:StreetName>
        <cac:Country><cbc:Name>Türkiye</cbc:Name></cac:Country>
      </cac:DeliveryAddress>
    </cac:Delivery>
  </cac:Shipment>
  ${linesXml}
</DespatchAdvice>`
}
