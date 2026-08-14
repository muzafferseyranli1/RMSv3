// SuitableRMS E-Fatura & E-Dönüşüm Tipleri ve Sabitleri (UBL-TR 2.1)

export const EINVOICE_STATUS = {
  DRAFT: 1000,
  SENT_TO_INTEGRATOR: 1100,
  SENT_TO_GIB: 1120,
  PROCESSED_BY_GIB: 1163,
  DELIVERED_TO_RECEIVER: 1200,
  ACCEPTED: 1300,
  REJECTED: 1301,
  ERROR: 9999,
}

export const EINVOICE_STATUS_META = {
  1000: { code: 1000, key: 'DRAFT', label: 'Kuyrukta / Taslak', color: '#888888', bg: 'rgba(136,136,136,0.12)', border: '#888888', icon: 'fa-clock' },
  1100: { code: 1100, key: 'SENT_TO_INTEGRATOR', label: 'Entegratöre Gönderildi', color: '#38bdf8', bg: 'rgba(56,189,248,0.12)', border: '#38bdf8', icon: 'fa-paper-plane' },
  1120: { code: 1120, key: 'SENT_TO_GIB', label: "GİB'e İletildi", color: '#fb923c', bg: 'rgba(251,146,60,0.12)', border: '#fb923c', icon: 'fa-building-columns' },
  1163: { code: 1163, key: 'PROCESSED_BY_GIB', label: "GİB'de İşlendi (Zarf Başarılı)", color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', border: '#a78bfa', icon: 'fa-check-double' },
  1200: { code: 1200, key: 'DELIVERED_TO_RECEIVER', label: 'Alıcıya Ulaştı', color: '#22d3ee', bg: 'rgba(34,211,238,0.12)', border: '#22d3ee', icon: 'fa-inbox' },
  1300: { code: 1300, key: 'ACCEPTED', label: 'Kabul Edildi (Onaylandı)', color: '#10b981', bg: 'rgba(16,185,129,0.12)', border: '#10b981', icon: 'fa-circle-check' },
  1301: { code: 1301, key: 'REJECTED', label: 'Reddedildi', color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: '#ef4444', icon: 'fa-circle-xmark' },
  9999: { code: 9999, key: 'ERROR', label: 'Hatalı / Başarısız', color: '#dc2626', bg: 'rgba(220,38,38,0.12)', border: '#dc2626', icon: 'fa-triangle-exclamation' },
}

export const EINVOICE_PROFILES = {
  TICARIFATURA: { id: 'TICARIFATURA', label: 'Ticari Fatura', description: 'Alıcı tarafından 8 gün içinde Kabul/Red uygulama yanıtı verilebilir.' },
  TEMELFATURA: { id: 'TEMELFATURA', label: 'Temel Fatura', description: 'Otomatik olarak kabul edilir, teknik itiraz harici red verilemez.' },
  EARSIVFATURA: { id: 'EARSIVFATURA', label: 'e-Arşiv Fatura', description: 'Vergi mükellefi olmayan nihai tüketicilere veya B2C satışlara kesilir.' },
  KAMU: { id: 'KAMU', label: 'Kamu Faturası', description: 'Kamu kurum ve kuruluşlarına düzenlenen faturalar.' },
  IHRACAT: { id: 'IHRACAT', label: 'İhracat Faturası', description: 'Gümrük çıkışlı yurt dışı satış faturaları.' },
}

export const EINVOICE_TYPES = {
  SATIS: { id: 'SATIS', label: 'Satış Faturası' },
  IADE: { id: 'IADE', label: 'İade Faturası' },
  TEVKIFAT: { id: 'TEVKIFAT', label: 'Tevkifatlı Fatura' },
  ISTISNA: { id: 'ISTISNA', label: 'İstisna Faturası' },
  OZELMATRAH: { id: 'OZELMATRAH', label: 'Özel Matrah Faturası' },
  IHRACAT: { id: 'IHRACAT', label: 'İhracat' },
}

export const EINVOICE_DIRECTIONS = {
  INBOUND: { id: 'INBOUND', label: 'Gelen Fatura', icon: 'fa-arrow-down-left', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  OUTBOUND: { id: 'OUTBOUND', label: 'Giden Fatura', icon: 'fa-arrow-up-right', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
}

export const UNIT_CODES = [
  { code: 'C62', label: 'Adet', gibCode: 'Adet' },
  { code: 'KGM', label: 'Kilogram (KG)', gibCode: 'KGM' },
  { code: 'GRM', label: 'Gram (GR)', gibCode: 'GRM' },
  { code: 'LTR', label: 'Litre (LT)', gibCode: 'LTR' },
  { code: 'MLT', label: 'Mililitre (ML)', gibCode: 'MLT' },
  { code: 'PK', label: 'Paket (PK)', gibCode: 'PK' },
  { code: 'BX', label: 'Koli / Kutu (BX)', gibCode: 'BX' },
  { code: 'PR', label: 'Porsiyon (PR)', gibCode: 'PR' },
  { code: 'SET', label: 'Set / Takım (SET)', gibCode: 'SET' },
]

export const TAX_RATES = [
  { rate: 0, code: '0015', name: 'KDV %0 (İstisna)' },
  { rate: 1, code: '0015', name: 'KDV %1 (Toptan Temel Gıda)' },
  { rate: 10, code: '0015', name: 'KDV %10 (Gıda & Yeme-İçme Restoran Hizmeti)' },
  { rate: 20, code: '0015', name: 'KDV %20 (Genel Oran / Temizlik / Ambalaj)' },
]

export function getStatusMeta(statusCode) {
  return EINVOICE_STATUS_META[statusCode] || {
    code: statusCode,
    key: 'UNKNOWN',
    label: `Bilinmeyen (${statusCode})`,
    color: '#888888',
    bg: 'rgba(136,136,136,0.12)',
    border: '#888888',
    icon: 'fa-circle-question',
  }
}

export function getProfileMeta(profileId) {
  return EINVOICE_PROFILES[profileId] || { id: profileId, label: profileId, description: '' }
}

export function getTypeMeta(typeId) {
  return EINVOICE_TYPES[typeId] || { id: typeId, label: typeId }
}

export function getDirectionMeta(direction) {
  return EINVOICE_DIRECTIONS[direction] || EINVOICE_DIRECTIONS.INBOUND
}
