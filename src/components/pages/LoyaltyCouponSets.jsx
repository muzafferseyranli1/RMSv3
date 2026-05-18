import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import Header from '@/components/layout/Header'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useToast } from '@/hooks/useToast'
import AddButton from '@/components/ui/AddButton'
import { db } from '@/lib/db'
import {
  COUPON_CHARSET_OPTIONS,
  DEFAULT_LOYALTY_CAMPAIGNS,
  DEFAULT_LOYALTY_PROGRAM,
  DEFAULT_LOYALTY_TIERS,
  getCouponTargetCount,
  normalizeCampaign,
  normalizeCouponSeries,
  normalizeProgram,
  normalizeTier,
  loadLoyaltyWorkspace,
  saveLoyaltyWorkspace,
  syncCouponSeriesCodes,
} from '@/lib/loyalty'

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

function createEmptyCouponSet(index = 0) {
  return normalizeCouponSeries({
    id: createId('coupon-series'),
    name: `Kupon Seti ${index + 1}`,
    prefix: `KPN${index + 1}`,
    singleCoupon: false,
    couponCount: 10,
    randomLength: 6,
    charset: 'numeric',
    useAfterCheckout: false,
    active: true,
    codes: [],
  }, index)
}

function boolLabel(value) {
  return value ? 'Evet' : 'Hayir'
}

function toBool(value, fallback = false) {
  if (typeof value === 'boolean') return value
  const normalized = String(value || '').trim().toLowerCase()
  if (['true', 'evet', 'yes', '1', 'aktif'].includes(normalized)) return true
  if (['false', 'hayir', 'no', '0', 'pasif'].includes(normalized)) return false
  return fallback
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function getCharsetLabel(value) {
  return COUPON_CHARSET_OPTIONS.find(option => option.value === value)?.label || value
}

const COUPON_BENEFIT_TYPE_OPTIONS = [
  { value: 'none', label: 'Sadece kupon / kontrol kaydi' },
  { value: 'order_discount_amount', label: 'Fisin tamamina sabit indirim' },
  { value: 'order_discount_percent', label: 'Fisin tamamina yuzdesel indirim' },
  { value: 'product_discount_percent', label: 'Secili urunde yuzdesel indirim' },
]

function formatAmount(value, currency = 'TL') {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return `0 ${currency}`.trim()
  return `${new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: numeric % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(numeric)} ${currency}`.trim()
}

function buildCouponBenefitSummary(series = {}) {
  const benefit = series?.benefitConfig || {}
  switch (benefit.type) {
    case 'order_discount_amount':
      return `fisin tamamindan ${formatAmount(benefit.amount || 0)} indirir`
    case 'order_discount_percent':
      return `fisin tamamina %${benefit.percent || 0} indirim uygular${Number(benefit.maxDiscountAmount || 0) > 0 ? ` (max ${formatAmount(benefit.maxDiscountAmount)})` : ''}`
    case 'product_discount_percent': {
      const productLabel = String(benefit.productName || '').trim() || 'secili urunde'
      const percent = Number(benefit.percent || 0)
      return `${productLabel} icin %${percent} indirim uygular${percent >= 100 ? ' (bedava)' : ''}; urun fiste varsa calisir`
    }
    default:
      return 'ozel indirim etkisi tanimlanmadi'
  }
}

function normalizeCouponSetList(value) {
  return (Array.isArray(value) ? value : [])
    .filter(item => item && typeof item === 'object')
    .map((item, index) => normalizeCouponSeries(item, index))
}

function getCouponCodes(series) {
  return Array.isArray(series?.codes) ? series.codes : []
}

function getCouponItems(series) {
  return Array.isArray(series?.coupons) ? series.coupons : []
}

function isProtectedCoupon(coupon = {}) {
  const status = String(coupon.redemptionStatus || '').trim().toLowerCase()
  return (
    ['used', 'reserved', 'expired', 'cancelled'].includes(status)
    || Boolean(coupon.customerId)
    || Boolean(coupon.redeemedByCustomerId)
    || Boolean(coupon.usedAt)
  )
}

function formatDateTime(value) {
  if (!value) return '-'
  try {
    return new Intl.DateTimeFormat('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function getCouponStatusMeta(coupon = {}) {
  switch (coupon.redemptionStatus) {
    case 'used':
      return { label: 'Kullanildi', color: '#166534', background: '#ecfdf5', border: '#bbf7d0' }
    case 'reserved':
      return { label: 'Ayrildi', color: '#92400e', background: '#fffbeb', border: '#fde68a' }
    case 'expired':
      return { label: 'Suresi Doldu', color: '#991b1b', background: '#fef2f2', border: '#fecaca' }
    case 'cancelled':
      return { label: 'Iptal', color: '#475569', background: '#f8fafc', border: '#cbd5e1' }
    default:
      return { label: 'Hazir', color: '#1d4ed8', background: '#eff6ff', border: '#bfdbfe' }
  }
}

function formatCompactDate(value = new Date()) {
  return value.toISOString().slice(0, 10)
}

function exportCouponSeriesWorkbook(series) {
  const normalized = syncCouponSeriesCodes(series)
  const workbook = XLSX.utils.book_new()

  const setRows = [{
    'Seri Adi': normalized.name,
    'On Ek': normalized.prefix,
    'Tek Kupon': boolLabel(normalized.singleCoupon),
    'Kupon Sayisi': getCouponTargetCount(normalized),
    'Rastgele Uzunluk': normalized.randomLength,
    'Karakter Seti': normalized.charset,
    'Gecerlilik Baslangici': normalized.validFrom || '',
    'Gecerlilik Bitisi': normalized.validUntil || '',
    'Uretimden Sonra Gun': normalized.expiresInDays || 0,
    'Tarihi Gecince Pasif': boolLabel(normalized.autoDeactivateOnExpiry),
    'Siparis Kapattiktan Sonra Kullan': boolLabel(normalized.useAfterCheckout),
    'Etki Turu': normalized.benefitConfig?.type || 'none',
    'Indirim Tutari': normalized.benefitConfig?.amount || 0,
    'Indirim Yuzdesi': normalized.benefitConfig?.percent || 0,
    'Max Indirim Tutari': normalized.benefitConfig?.maxDiscountAmount || 0,
    'Hedef Urun': normalized.benefitConfig?.productName || '',
    'Hedef Urun ID': normalized.benefitConfig?.productItemId || '',
    Aktif: boolLabel(normalized.active),
  }]

  const codeRows = getCouponItems(normalized).map(coupon => ({
    'Seri Adi': normalized.name,
    Kod: coupon.code,
    Durum: coupon.redemptionStatus,
    'Tahsisli Musteri': coupon.customerId || '',
    'Kullanan Musteri': coupon.redeemedByCustomerId || '',
    'Verilis Zamani': coupon.issuedAt || '',
    'Son Gecerlilik': coupon.expiresAt || '',
    'Kullanildigi Zaman': coupon.usedAt || '',
    Kanal: coupon.redeemedChannel || '',
    'Ref No': coupon.redeemedSourceRefId || '',
  }))

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(setRows), 'Kupon Seti')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(codeRows), 'Kupon Kodlari')
  XLSX.writeFile(workbook, `${normalized.prefix || 'kupon-seti'}-${formatCompactDate()}.xlsx`)
}

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function parseWorkbookSeries(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = event => {
      try {
        const workbook = XLSX.read(event.target?.result, { type: 'array' })
        const sheetNames = workbook.SheetNames || []
        const setSheetName = sheetNames.find(name => normalizeHeader(name).includes('kupon_set'))
          || sheetNames.find(name => normalizeHeader(name).includes('kuponseri'))
          || sheetNames[0]
        const codeSheetName = sheetNames.find(name => normalizeHeader(name).includes('kupon_kod'))

        const rawSetRows = XLSX.utils.sheet_to_json(workbook.Sheets[setSheetName], { defval: '' })
        const rawCodeRows = codeSheetName
          ? XLSX.utils.sheet_to_json(workbook.Sheets[codeSheetName], { defval: '' })
          : []

        const codesByName = new Map()
        rawCodeRows.forEach(row => {
          const normalizedRow = Object.fromEntries(
            Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]),
          )
          const setName = String(normalizedRow.seri_adi || normalizedRow.kupon_seti || normalizedRow.name || '').trim()
          const code = String(normalizedRow.kod || normalizedRow.code || '').trim()
          if (!setName || !code) return
          const current = codesByName.get(setName) || []
          current.push(code)
          codesByName.set(setName, current)
        })

        const imported = rawSetRows
          .map((row, index) => {
            const normalizedRow = Object.fromEntries(
              Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]),
            )
            const name = String(normalizedRow.seri_adi || normalizedRow.name || normalizedRow.kupon_seti || '').trim()
            if (!name) return null
            const prefix = String(normalizedRow.on_ek || normalizedRow.prefix || '').trim()
            const codes = codesByName.get(name) || []
            const importedCouponCount = toNumber(normalizedRow.kupon_sayisi ?? normalizedRow.coupon_count, 0)
            return normalizeCouponSeries({
              id: createId('coupon-series'),
              name,
              prefix,
              singleCoupon: toBool(normalizedRow.tek_kupon ?? normalizedRow.single_coupon, false),
              couponCount: importedCouponCount > 0 ? importedCouponCount : Math.max(codes.length, 1),
              randomLength: toNumber(normalizedRow.rastgele_uzunluk ?? normalizedRow.random_length, 6),
              charset: String(normalizedRow.karakter_seti || normalizedRow.charset || 'numeric').trim() || 'numeric',
              validFrom: normalizedRow.gecerlilik_baslangici || normalizedRow.valid_from || '',
              validUntil: normalizedRow.gecerlilik_bitisi || normalizedRow.valid_until || '',
              expiresInDays: toNumber(normalizedRow.uretimden_sonra_gun ?? normalizedRow.expires_in_days, 0),
              autoDeactivateOnExpiry: toBool(normalizedRow.tarihi_gecince_pasif ?? normalizedRow.auto_deactivate_on_expiry, true),
              useAfterCheckout: toBool(normalizedRow.siparis_kapattiktan_sonra_kullan ?? normalizedRow.use_after_checkout, false),
              benefitConfig: {
                type: String(normalizedRow.etki_turu || normalizedRow.benefit_type || 'none').trim() || 'none',
                amount: toNumber(normalizedRow.indirim_tutari ?? normalizedRow.discount_amount, 0),
                percent: toNumber(normalizedRow.indirim_yuzdesi ?? normalizedRow.discount_percent, 0),
                maxDiscountAmount: toNumber(normalizedRow.max_indirim_tutari ?? normalizedRow.max_discount_amount, 0),
                productName: String(normalizedRow.hedef_urun || normalizedRow.target_product || '').trim(),
                productItemId: String(normalizedRow.hedef_urun_id || normalizedRow.target_product_id || '').trim(),
              },
              active: toBool(normalizedRow.aktif ?? normalizedRow.active, true),
              codes,
            }, index)
          })
          .filter(Boolean)

        resolve(imported)
      } catch (error) {
        reject(error)
      }
    }
    reader.onerror = () => reject(new Error('Dosya okunamadi'))
    reader.readAsArrayBuffer(file)
  })
}

function CouponSetModal({ open, value, saving, schemaReady, databaseUnavailable, isNew, saleItems, onClose, onSave, onImportIntoDraft, onExportDraft }) {
  const [draft, setDraft] = useState(value)
  const fileInputRef = useRef(null)

  useEffect(() => {
    setDraft(value)
  }, [value])

  if (!open || !draft) return null

  const targetCount = getCouponTargetCount(draft)
  const actualCount = getCouponCodes(draft).length
  const countMismatch = actualCount !== targetCount
  const protectedCouponCount = getCouponItems(draft).filter(isProtectedCoupon).length
  function updateField(key, nextValue) {
    setDraft(current => normalizeCouponSeries({ ...current, [key]: nextValue }))
  }

  function patchBenefit(patch) {
    setDraft(current => {
      const currentBenefit = current?.benefitConfig || {}
      const nextBenefit = typeof patch === 'function'
        ? patch(currentBenefit)
        : { ...currentBenefit, ...patch }
      return normalizeCouponSeries({ ...current, benefitConfig: nextBenefit })
    })
  }

  function syncToTarget() {
    setDraft(current => syncCouponSeriesCodes(current))
  }

  function regenerateCodes() {
    setDraft(current => syncCouponSeriesCodes(current, { mode: 'regenerate' }))
  }

  return (
    <div className="modal-bg open">
      <div className="modal-box" style={{ width: 'min(96vw, 760px)', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 800, color: '#0f172a' }}>
              {isNew ? 'Yeni Kupon Seti' : 'Kupon Seti Detayi'}
            </div>
            <div style={{ fontSize: '.8rem', color: '#64748b', marginTop: 4 }}>
              Kupon setini burada olusturun, kodlari yonetin, import/export yapin ve sonra kaydedin.
            </div>
          </div>
          <button className="btn-o" type="button" onClick={onClose}>Kapat</button>
        </div>

        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>Set Adi</div>
              <input className="f-input" value={draft.name} onChange={event => updateField('name', event.target.value)} placeholder="Hos Geldin Kuponlari" />
            </div>
            <div>
              <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>On Ek</div>
              <input className="f-input" value={draft.prefix} onChange={event => updateField('prefix', event.target.value)} placeholder="HOS" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '0.7fr 0.7fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>Kupon Sayisi</div>
              <input className="f-input" type="number" min={1} value={draft.singleCoupon ? 1 : draft.couponCount} onChange={event => updateField('couponCount', event.target.value)} disabled={draft.singleCoupon} />
            </div>
            <div>
              <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>Rastgele Uzunluk</div>
              <input className="f-input" type="number" min={1} value={draft.randomLength} onChange={event => updateField('randomLength', event.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>Karakter Seti</div>
              <div className="sel-wrap">
                <select className="f-input" value={draft.charset} onChange={event => updateField('charset', event.target.value)}>
                  {COUPON_CHARSET_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.8fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>Gecerlilik Baslangici</div>
              <input className="f-input" type="datetime-local" value={draft.validFrom ? draft.validFrom.slice(0, 16) : ''} onChange={event => updateField('validFrom', event.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>Gecerlilik Bitisi</div>
              <input className="f-input" type="datetime-local" value={draft.validUntil ? draft.validUntil.slice(0, 16) : ''} onChange={event => updateField('validUntil', event.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>Uretimden Sonra Gun</div>
              <input className="f-input" type="number" min={0} value={draft.expiresInDays || 0} onChange={event => updateField('expiresInDays', event.target.value)} />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#475569' }}>
              <input type="checkbox" checked={draft.singleCoupon} onChange={event => updateField('singleCoupon', event.target.checked)} />
              Tek kupon
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#475569' }}>
              <input type="checkbox" checked={draft.useAfterCheckout} onChange={event => updateField('useAfterCheckout', event.target.checked)} />
              Siparisi kapattiktan sonra kuponu kullan
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#475569' }}>
              <input type="checkbox" checked={draft.active} onChange={event => updateField('active', event.target.checked)} />
              Aktif
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#475569' }}>
              <input type="checkbox" checked={draft.autoDeactivateOnExpiry !== false} onChange={event => updateField('autoDeactivateOnExpiry', event.target.checked)} />
              Tarihi gecince gecersiz say
            </label>
          </div>

          <div style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 14, background: '#fff' }}>
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontWeight: 800, color: '#0f172a' }}>Kupon Ne Yapar?</div>
              <div style={{ fontSize: '.82rem', color: '#64748b', lineHeight: 1.6 }}>
                Burada kuponun fis veya urun uzerindeki etkisini tanimlarsiniz. Ornekler: fisin tamamina 400 TL indirim, fisin tamamina %20 indirim, %25 indirim ama en fazla 500 TL, ya da secili urunde %100 indirim.
              </div>
            </div>

            <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
              <div>
                <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>Etki Turu</div>
                <div className="sel-wrap">
                  <select className="f-input" value={draft.benefitConfig?.type || 'none'} onChange={event => patchBenefit({ type: event.target.value })}>
                    {COUPON_BENEFIT_TYPE_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {draft.benefitConfig?.type === 'order_discount_amount' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>Indirim Tutari</div>
                    <input className="f-input" type="number" min={0} step="0.01" value={draft.benefitConfig?.amount || 0} onChange={event => patchBenefit({ amount: event.target.value })} placeholder="400" />
                  </div>
                </div>
              ) : null}

              {draft.benefitConfig?.type === 'order_discount_percent' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>Indirim Yuzdesi</div>
                    <input className="f-input" type="number" min={0} max={100} step="0.01" value={draft.benefitConfig?.percent || 0} onChange={event => patchBenefit({ percent: event.target.value })} placeholder="20" />
                  </div>
                  <div>
                    <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>Max Indirim Tutari</div>
                    <input className="f-input" type="number" min={0} step="0.01" value={draft.benefitConfig?.maxDiscountAmount || 0} onChange={event => patchBenefit({ maxDiscountAmount: event.target.value })} placeholder="500" />
                  </div>
                </div>
              ) : null}

              {draft.benefitConfig?.type === 'product_discount_percent' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>Hedef Urun</div>
                    <input
                      list="coupon-set-sale-items"
                      className="f-input"
                      value={draft.benefitConfig?.productName || ''}
                      onChange={event => {
                        const matchedItem = (saleItems || []).find(item => item.name === event.target.value)
                        patchBenefit({
                          productName: event.target.value,
                          productItemId: matchedItem?.id || '',
                        })
                      }}
                      placeholder="Hamburger secin veya yazin"
                    />
                    <datalist id="coupon-set-sale-items">
                      {(saleItems || []).map(item => (
                        <option key={item.id} value={item.name}>{item.sku || item.id}</option>
                      ))}
                    </datalist>
                    <div style={{ marginTop: 6, fontSize: '.76rem', color: '#94a3b8' }}>
                      Urun fiste varsa kupon bu urune uygulanir.
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>Indirim Yuzdesi</div>
                    <input className="f-input" type="number" min={0} max={100} step="0.01" value={draft.benefitConfig?.percent || 100} onChange={event => patchBenefit({ percent: event.target.value })} placeholder="100" />
                  </div>
                </div>
              ) : null}

              <div style={{ borderRadius: 12, border: '1px solid #dbeafe', background: '#f8fbff', padding: 12, color: '#334155', fontSize: '.82rem', lineHeight: 1.6 }}>
                <strong>Ozet:</strong> {buildCouponBenefitSummary(draft)}
              </div>
            </div>
          </div>

          <div style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 14, background: '#f8fafc' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>Kod Uretimi ve Kayit</div>
                <div style={{ marginTop: 6, fontSize: '.82rem', color: '#64748b' }}>
                  Bu set kaydedildiginde seri bilgisi <strong>`loyalty_coupon_series`</strong> tablosuna, kodlar ise tek tek <strong>`loyalty_coupons`</strong> tablosuna yazilir.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={event => onImportIntoDraft(event, draft, setDraft)} />
                <button className="btn-o" type="button" onClick={() => fileInputRef.current?.click()}>
                  <i className="fa-solid fa-file-import" style={{ marginRight: 6 }} />
                  Bu Sete Import
                </button>
                <button className="btn-o" type="button" onClick={() => onExportDraft(draft)}>
                  <i className="fa-solid fa-file-excel" style={{ marginRight: 6 }} />
                  Bu Seti Export Et
                </button>
              </div>
            </div>

            <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
              <div style={{ borderRadius: 14, border: '1px solid #dbeafe', background: '#fff', padding: 12 }}>
                <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Hedef Kupon</div>
                <div style={{ marginTop: 6, fontSize: '1.2rem', fontWeight: 900, color: '#0f172a' }}>{targetCount}</div>
              </div>
              <div style={{ borderRadius: 14, border: '1px solid #dbeafe', background: '#fff', padding: 12 }}>
                <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Toplam Kod</div>
                <div style={{ marginTop: 6, fontSize: '1.2rem', fontWeight: 900, color: '#0f172a' }}>{actualCount}</div>
              </div>
              <div style={{ borderRadius: 14, border: '1px solid #dbeafe', background: '#fff', padding: 12 }}>
                <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Kayit Modu</div>
                <div style={{ marginTop: 6, fontSize: '.92rem', fontWeight: 800, color: schemaReady ? '#166534' : '#9a3412' }}>
                  {schemaReady ? 'Production Tables' : 'Database Unavailable'}
                </div>
              </div>
            </div>

            {countMismatch ? (
              <div style={{ marginTop: 12, borderRadius: 14, border: '1px solid #fdba74', background: '#fff7ed', padding: 12, color: '#9a3412', fontSize: '.82rem', lineHeight: 1.6 }}>
                {actualCount < targetCount
                  ? 'Kupon sayisi ile toplam kod sayisi farkli. Kaydet dediginizde sistem mevcut kodlari koruyup eksik kadar yeni kod uretecektir.'
                  : protectedCouponCount > 0
                    ? `Bu sette ${protectedCouponCount} adet gecmis veya ayrilmis kupon kaydi korunuyor. Kaydet sonrasi sistem fazla bos kodlari pasiflestirir; kullanilmis, ayrilmis veya suresi dolmus kuponlari silmez.`
                    : 'Kupon sayisi ile toplam kod sayisi farkli. Kaydet dediginizde sistem fazla bos kodlari hedef sayiya gore pasiflestirir.'}
              </div>
            ) : null}

            <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn-o" type="button" onClick={syncToTarget}>
                Kodu Hedefe Gore Tamamla
              </button>
              <button className="btn-o" type="button" onClick={regenerateCodes}>
                Kodlari Yeniden Uret
              </button>
            </div>

            <textarea
              className="f-input"
              rows={Math.min(Math.max(actualCount || 1, 6), 14)}
              readOnly
              value={getCouponCodes(draft).join('\n')}
              style={{ marginTop: 12, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: '.76rem', lineHeight: 1.55, whiteSpace: 'pre' }}
            />

            <div style={{ marginTop: 14, borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
              <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>Kupon Gecmisi</div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', background: '#fff' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 1fr 1fr 1fr 1fr', gap: 10, padding: '12px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '.72rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase' }}>
                  <div>Kod</div>
                  <div>Durum</div>
                  <div>Verilis</div>
                  <div>Son Gecerlilik</div>
                  <div>Kullanildigi Zaman</div>
                  <div>Kullanan / Ref</div>
                </div>
                {getCouponItems(draft).length === 0 ? (
                  <div style={{ padding: 16, fontSize: '.82rem', color: '#64748b', textAlign: 'center' }}>Bu sette henuz kupon kaydi yok.</div>
                ) : getCouponItems(draft).map(coupon => {
                  const status = getCouponStatusMeta(coupon)
                  return (
                    <div key={coupon.id} style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 1fr 1fr 1fr 1fr', gap: 10, padding: '12px 14px', borderTop: '1px solid #f1f5f9', alignItems: 'center' }}>
                      <div style={{ fontWeight: 800, color: '#0f172a', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>{coupon.code}</div>
                      <div>
                        <span style={{ borderRadius: 999, border: `1px solid ${status.border}`, background: status.background, color: status.color, padding: '4px 10px', fontSize: '.72rem', fontWeight: 800 }}>
                          {status.label}
                        </span>
                      </div>
                      <div style={{ fontSize: '.78rem', color: '#475569' }}>{formatDateTime(coupon.issuedAt)}</div>
                      <div style={{ fontSize: '.78rem', color: '#475569' }}>{formatDateTime(coupon.expiresAt)}</div>
                      <div style={{ fontSize: '.78rem', color: '#475569' }}>{formatDateTime(coupon.usedAt)}</div>
                      <div style={{ fontSize: '.78rem', color: '#475569', lineHeight: 1.5 }}>
                        {[coupon.redeemedByCustomerId, coupon.redeemedSourceRefId, coupon.redeemedChannel].filter(Boolean).join(' / ') || '-'}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="modal-foot" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div style={{ fontSize: '.8rem', color: '#64748b' }}>
            Kaydet sonrasi set listede hemen gorunur ve kodlar secili kayitla birlikte saklanir.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-o" type="button" onClick={onClose}>Vazgec</button>
            <button className="btn-p" type="button" onClick={() => onSave(syncCouponSeriesCodes(draft))} disabled={saving || databaseUnavailable || !schemaReady}>
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LoyaltyCouponSets() {
  const workspace = useWorkspace()
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [couponSets, setCouponSets] = useState([])
  const [workspacePayload, setWorkspacePayload] = useState(null)
  const [schemaReady, setSchemaReady] = useState(false)
  const [databaseUnavailable, setDatabaseUnavailable] = useState(false)
  const [editingSet, setEditingSet] = useState(null)
  const [saleItems, setSaleItems] = useState([])

  useEffect(() => {
    let mounted = true

    async function loadPage() {
      setLoading(true)
      try {
        const [result, saleItemsResult] = await Promise.all([
          loadLoyaltyWorkspace(workspace),
          db.from('sale_items').select('id,name,sku,deleted_at').is('deleted_at', null).order('name'),
        ])
        if (!mounted) return
        setWorkspacePayload(result)
        setCouponSets(normalizeCouponSetList(result.couponSeries))
        setSchemaReady(result.schemaReady)
        setDatabaseUnavailable(Boolean(result.databaseUnavailable))
        if (!saleItemsResult.error && Array.isArray(saleItemsResult.data)) {
          setSaleItems(saleItemsResult.data.map(item => ({
            id: String(item.id),
            name: item.name || '',
            sku: item.sku || '',
          })))
        }
      } catch (error) {
        if (mounted) toast(error.message || 'Kupon setleri yuklenemedi', 'error')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    loadPage()
    return () => { mounted = false }
  }, [workspace.scope, workspace.branchId, workspace.branchName])

  const filteredSets = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return normalizeCouponSetList(couponSets).filter(set => {
      const matchesStatus = statusFilter === 'all'
        ? true
        : statusFilter === 'active'
          ? set.active
          : !set.active
      const matchesSearch = !normalizedSearch
        || set.name.toLowerCase().includes(normalizedSearch)
        || set.prefix.toLowerCase().includes(normalizedSearch)
        || getCouponCodes(set).some(code => code.toLowerCase().includes(normalizedSearch))
      return matchesStatus && matchesSearch
    })
  }, [couponSets, search, statusFilter])

  async function persistCouponSets(nextSets, successMessage) {
    if (!workspacePayload) return
    setSaving(true)
    try {
      const safeProgram = normalizeProgram(workspacePayload.program || DEFAULT_LOYALTY_PROGRAM)
      const safeTiers = (workspacePayload.tiers || DEFAULT_LOYALTY_TIERS).map(normalizeTier)
      const safeCampaigns = (workspacePayload.campaigns || DEFAULT_LOYALTY_CAMPAIGNS).map(item => normalizeCampaign({ ...item, programId: safeProgram.id }))
      const safeCouponSets = normalizeCouponSetList(nextSets).map(series => syncCouponSeriesCodes(series))

      const result = await saveLoyaltyWorkspace({
        scope: workspace.scope,
        branchId: workspace.branchId,
        branchName: workspace.branchName,
      }, {
        program: safeProgram,
        tiers: safeTiers,
        campaigns: safeCampaigns,
        couponSeries: safeCouponSets,
      })

      const persistedCouponSets = Array.isArray(result.couponSeries)
        ? result.couponSeries.map(normalizeCouponSeries)
        : safeCouponSets

      setCouponSets(persistedCouponSets)
      setWorkspacePayload(current => ({
        ...(current || {}),
        program: safeProgram,
        tiers: safeTiers,
        campaigns: safeCampaigns,
        couponSeries: persistedCouponSets,
      }))
      setSchemaReady(result.schemaReady)
      setDatabaseUnavailable(false)
      toast(successMessage, 'success')
    } catch (error) {
      toast(error.message || 'Kupon setleri kaydedilemedi', 'error')
      throw error
    } finally {
      setSaving(false)
    }
  }

  function openCreateModal() {
    setEditingSet(createEmptyCouponSet(couponSets.length))
  }

  function openEditModal(series) {
    setEditingSet(normalizeCouponSeries(series))
  }

  async function handleSaveModal(series) {
    const normalized = syncCouponSeriesCodes(series)
    const nextSets = couponSets.some(item => item.id === normalized.id)
      ? couponSets.map(item => item.id === normalized.id ? normalized : item)
      : [...couponSets, normalized]
    await persistCouponSets(nextSets, 'Kupon seti kaydedildi')
    setEditingSet(null)
  }

  async function handleDelete(seriesId) {
    const nextSets = couponSets.filter(item => item.id !== seriesId)
    await persistCouponSets(nextSets, 'Kupon seti silindi')
  }

  async function handleToggleActive(seriesId) {
    const nextSets = couponSets.map(item => (
      item.id === seriesId ? syncCouponSeriesCodes({ ...item, active: !item.active }) : item
    ))
    await persistCouponSets(nextSets, 'Kupon seti guncellendi')
  }

  function handleExportSeries(series) {
    exportCouponSeriesWorkbook(series)
  }

  async function handleImportIntoDraft(event, currentDraft, setDraft) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const importedSets = await parseWorkbookSeries(file)
      if (importedSets.length === 0) {
        toast('Dosyada aktarilacak kupon seti bulunamadi', 'info')
        return
      }
      const firstImported = importedSets[0]
      setDraft(syncCouponSeriesCodes({
        ...firstImported,
        id: currentDraft.id,
      }))
      if (importedSets.length > 1) {
        toast(`Dosyada ${importedSets.length} set bulundu; ilk set bu kayda yuklendi`, 'info')
      } else {
        toast('Dosya bu kupon setine yuklendi', 'success')
      }
    } catch (error) {
      toast(error.message || 'Kupon seti ice aktarilamadi', 'error')
    }
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <Header
        title="Kupon Setleri"
        subtitle={`${couponSets.length} kupon seti burada listelenir; import ve export her setin kendi detayinda yonetilir.`}
        actions={(
          <>
            <AddButton onClick={openCreateModal} label="Yeni Kupon Seti Ekle" disabled={databaseUnavailable || !schemaReady} />
          </>
        )}
      />

      {databaseUnavailable && (
        <div className="card" style={{ padding: 18, border: '1px solid #fdba74', background: '#fff7ed', color: '#9a3412' }}>
          DATABASE UNAVAILABLE. Kupon setleri production is verisidir; `settings` fallback kapatildi ve kayit sadece veritabani tablolarina yapilir.
        </div>
      )}

      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 800, color: '#0f172a' }}>Kupon Seti Listesi</div>
            <div style={{ marginTop: 4, fontSize: '.8rem', color: '#64748b' }}>
              Kayitli kupon setlerini arayin, filtreleyin, duzenleyin veya yeni set olusturun.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className={statusFilter === 'all' ? 'btn-p' : 'btn-o'} onClick={() => setStatusFilter('all')}>Hepsi ({couponSets.length})</button>
            <button className={statusFilter === 'active' ? 'btn-p' : 'btn-o'} onClick={() => setStatusFilter('active')}>Aktif ({couponSets.filter(item => item.active).length})</button>
            <button className={statusFilter === 'passive' ? 'btn-p' : 'btn-o'} onClick={() => setStatusFilter('passive')}>Pasif ({couponSets.filter(item => !item.active).length})</button>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>Ara</div>
          <input className="f-input" value={search} onChange={event => setSearch(event.target.value)} placeholder="Kupon seti adi, on ek veya kod ara..." />
        </div>

        <div style={{ border: '1px solid #e2e8f0', borderRadius: 18, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 0.8fr 0.8fr 0.9fr 0.8fr 1fr', gap: 12, padding: '14px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '.76rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase' }}>
            <div>Kupon Seti</div>
            <div>On Ek</div>
            <div>Kupon Sayisi</div>
            <div>Karakter Seti</div>
            <div>Durum</div>
            <div>Islem</div>
          </div>

          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>Kupon setleri yukleniyor...</div>
          ) : filteredSets.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>Gosterilecek kupon seti bulunamadi.</div>
          ) : filteredSets.map(series => (
            <div key={series.id} style={{ display: 'grid', gridTemplateColumns: '2fr 0.8fr 0.8fr 0.9fr 0.8fr 1fr', gap: 12, padding: '16px', borderBottom: '1px solid #e2e8f0', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>{series.name}</div>
                <div style={{ marginTop: 4, fontSize: '.8rem', color: '#64748b' }}>
                  {getCouponCodes(series).length} / {getCouponTargetCount(series)} kod hazir, {series.useAfterCheckout ? 'siparis sonrasi kullanilir' : 'aninda kullanilabilir'}
                </div>
                <div style={{ marginTop: 4, fontSize: '.8rem', color: '#475569' }}>
                  {buildCouponBenefitSummary(series)}
                </div>
              </div>
              <div style={{ fontWeight: 700, color: '#334155' }}>{series.prefix}</div>
              <div style={{ fontWeight: 700, color: '#334155' }}>{series.singleCoupon ? 1 : series.couponCount}</div>
              <div style={{ fontWeight: 700, color: '#334155' }}>{getCharsetLabel(series.charset)}</div>
              <div>
                <span style={{
                  borderRadius: 999,
                  padding: '5px 10px',
                  fontSize: '.72rem',
                  fontWeight: 800,
                  background: series.active ? '#ecfdf5' : '#f8fafc',
                  color: series.active ? '#166534' : '#64748b',
                  border: `1px solid ${series.active ? '#bbf7d0' : '#e2e8f0'}`,
                }}>
                  {series.active ? 'Aktif' : 'Pasif'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button className="btn-o" type="button" onClick={() => openEditModal(series)}>Duzenle</button>
                <button className="btn-o" type="button" onClick={() => handleToggleActive(series.id)}>
                  {series.active ? 'Pasif Yap' : 'Aktif Yap'}
                </button>
                <button className="btn-o" type="button" onClick={() => handleDelete(series.id)}>Sil</button>
              </div>
            </div>
          ))}
        </div>

        {!schemaReady && !databaseUnavailable && (
          <div style={{ marginTop: 12, fontSize: '.78rem', color: '#94a3b8' }}>
            Sadakat tablolari hazir olmadan yeni kupon seti acilmaz.
          </div>
        )}
      </div>

      <CouponSetModal
        open={Boolean(editingSet)}
        value={editingSet}
        saving={saving}
        schemaReady={schemaReady}
        databaseUnavailable={databaseUnavailable}
        isNew={Boolean(editingSet) && !couponSets.some(item => item.id === editingSet?.id)}
        saleItems={saleItems}
        onClose={() => setEditingSet(null)}
        onSave={handleSaveModal}
        onImportIntoDraft={handleImportIntoDraft}
        onExportDraft={handleExportSeries}
      />
    </div>
  )
}
