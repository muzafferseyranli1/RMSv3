import { useEffect, useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useToast } from '@/hooks/useToast'
import AddButton from '@/components/ui/AddButton'
import { db } from '@/lib/db'
import * as XLSX from 'xlsx'
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
  loadCouponsForSeries,
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

function getCharsetLabel(value) {
  return COUPON_CHARSET_OPTIONS.find(option => option.value === value)?.label || value
}

function normalizeCouponSetList(value) {
  return (Array.isArray(value) ? value : [])
    .filter(item => item && typeof item === 'object')
    .map((item, index) => normalizeCouponSeries(item, index))
}

function getCouponCodes(series) {
  return Array.isArray(series?.codes) ? series.codes : []
}

function normalizeText(value) {
  return String(value || '').toLocaleLowerCase('tr-TR').trim()
}

function matchesColumnFilter(value, filterValue) {
  const safeFilter = normalizeText(filterValue)
  if (!safeFilter) return true
  return normalizeText(value).includes(safeFilter)
}

function compareValues(left, right, direction = 'desc') {
  if (left === right) return 0
  const multiplier = direction === 'asc' ? 1 : -1

  if (typeof left === 'number' && typeof right === 'number') {
    return (left - right) * multiplier
  }

  return String(left || '').localeCompare(String(right || ''), 'tr') * multiplier
}

function CouponSetModal({ open, value, saving, schemaReady, databaseUnavailable, isNew, onClose, onSave, toast }) {
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    setDraft(value)
  }, [value])

  if (!open || !draft) return null

  function updateField(key, nextValue) {
    setDraft(current => normalizeCouponSeries({ ...current, [key]: nextValue }))
  }

  return (
    <div className="modal-bg open">
      <div className="modal-box" style={{ width: 'min(92vw, 520px)', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 800, color: '#0f172a' }}>
              {isNew ? 'Kupon serisi oluştur' : 'Kupon serisini düzenle'}
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ border: 'none', background: 'transparent', color: '#94a3b8', fontSize: '1.2rem', fontWeight: 900, cursor: 'pointer' }}>×</button>
        </div>

        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', display: 'grid', gap: 16, padding: '22px 26px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '170px 1fr', gap: 12, alignItems: 'center' }}>
            <label style={{ color: '#475569' }}>Seri adı:</label>
            <input className="f-input" value={draft.name} onChange={event => updateField('name', event.target.value)} />

            <label style={{ color: '#475569' }}>Önek:</label>
            <input className="f-input" value={draft.prefix} onChange={event => updateField('prefix', event.target.value)} />
          </div>

          <div style={{ display: 'grid', gap: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#475569' }}>
              <input type="checkbox" checked={draft.singleCoupon} onChange={event => updateField('singleCoupon', event.target.checked)} />
              Tek kupon
            </label>

            {!draft.singleCoupon ? (
              <div style={{ display: 'grid', gridTemplateColumns: '170px 120px', gap: 12, alignItems: 'center' }}>
                <label style={{ color: '#475569' }}>Kupon sayısı:</label>
                <input className="f-input" type="number" min={1} value={draft.couponCount} onChange={event => updateField('couponCount', event.target.value)} />
              </div>
            ) : null}

            {!draft.singleCoupon ? (
              <div style={{ display: 'grid', gridTemplateColumns: '170px 120px', gap: 12, alignItems: 'center' }}>
                <label style={{ color: '#475569' }}>Rastgele parça uzunluğu:</label>
                <input className="f-input" type="number" min={1} value={draft.randomLength} onChange={event => updateField('randomLength', event.target.value)} />
              </div>
            ) : null}

            {!draft.singleCoupon ? (
              <div style={{ display: 'grid', gridTemplateColumns: '170px 1fr', gap: 12, alignItems: 'center' }}>
                <label style={{ color: '#475569' }}>Karakter seti:</label>
                <div className="sel-wrap">
                  <select className="f-input" value={draft.charset} onChange={event => updateField('charset', event.target.value)}>
                    {COUPON_CHARSET_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#475569' }}>
              <input type="checkbox" checked={draft.useAfterCheckout} onChange={event => updateField('useAfterCheckout', event.target.checked)} />
              Siparişi kapattıktan sonra kuponu kullan
            </label>

            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16, marginTop: 8 }}>
              {draft._couponsNotLoaded ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: '.84rem', color: '#64748b' }}>
                    Kupon kodları henüz yüklenmedi. Kodları görmek veya güncellemek için yükleyin.
                  </div>
                  <button
                    className="btn-o"
                    type="button"
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                    onClick={async () => {
                      try {
                        const codes = await loadCouponsForSeries(draft.id)
                        setDraft(current => ({
                          ...current,
                          codes: codes.map(c => c.code),
                          coupons: codes,
                          _couponsNotLoaded: false
                        }))
                        if (toast) toast('Kupon kodları başarıyla yüklendi.', 'success')
                      } catch (err) {
                        if (toast) toast('Kupon kodları yüklenemedi: ' + err.message, 'error')
                      }
                    }}
                  >
                    <i className="fa-solid fa-arrows-rotate" /> Kodları Yükle
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontWeight: 700, color: '#475569' }}>
                      Kupon Kodları ({getCouponCodes(draft).length}):
                    </label>
                    <button
                      className="btn-o"
                      type="button"
                      style={{ fontSize: '.76rem', padding: '4px 8px' }}
                      onClick={() => {
                        setDraft(current => syncCouponSeriesCodes(current, { mode: 'regenerate' }))
                      }}
                    >
                      <i className="fa-solid fa-wand-magic-sparkles" style={{ marginRight: 4 }} /> Yeniden Üret
                    </button>
                  </div>
                  <div style={{
                    maxHeight: '120px',
                    overflowY: 'auto',
                    padding: '8px 12px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    fontSize: '.8rem',
                    fontFamily: 'monospace',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4
                  }}>
                    {getCouponCodes(draft).length === 0 ? (
                      <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Kupon kodu bulunmuyor.</span>
                    ) : (
                      getCouponCodes(draft).map((code, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: 2 }}>
                          <span>{code}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-start', gap: 8 }}>
          <button className="btn-p" type="button" onClick={() => onSave(syncCouponSeriesCodes(draft))} disabled={saving || databaseUnavailable || !schemaReady}>
            <i className="fa-solid fa-check" style={{ marginRight: 6 }} />
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
          <button className="btn-o" type="button" onClick={onClose}>
            <i className="fa-solid fa-xmark" style={{ marginRight: 6 }} />
            İptal
          </button>
        </div>
      </div>
    </div>
  )
}

function CouponImportModal({ open, couponSets, saving, onClose, onImport }) {
  const [selectedSeriesId, setSelectedSeriesId] = useState('')
  const [file, setFile] = useState(null)
  
  useEffect(() => {
    if (couponSets.length > 0 && !selectedSeriesId) {
      setSelectedSeriesId(couponSets[0].id)
    }
  }, [couponSets, selectedSeriesId])

  if (!open) return null

  const handleFileChange = (e) => {
    setFile(e.target.files[0])
  }

  const handleSubmit = () => {
    if (!selectedSeriesId) return
    if (!file) return
    onImport(selectedSeriesId, file)
  }

  return (
    <div className="modal-bg open">
      <div className="modal-box" style={{ width: 'min(92vw, 480px)' }}>
        <div className="modal-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 800, color: '#0f172a' }}>Excel'den Kupon İçe Aktar</div>
          <button type="button" onClick={onClose} style={{ border: 'none', background: 'transparent', color: '#94a3b8', fontSize: '1.2rem', fontWeight: 900, cursor: 'pointer' }}>×</button>
        </div>
        <div className="modal-body" style={{ padding: '22px 26px', display: 'grid', gap: 16 }}>
          <div>
            <label className="f-label">Hedef Kupon Seti</label>
            <div className="sel-wrap">
              <select className="f-input" value={selectedSeriesId} onChange={e => setSelectedSeriesId(e.target.value)}>
                {couponSets.map(set => (
                  <option key={set.id} value={set.id}>{set.name} ({set.prefix})</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="f-label">Excel Dosyası (.xlsx)</label>
            <input type="file" accept=".xlsx" className="f-input" onChange={handleFileChange} />
          </div>
          <div style={{ fontSize: '.76rem', color: '#64748b', lineHeight: 1.5 }}>
            * Excel dosyası ilk satırında <strong>"Kupon Kodu"</strong> sütununu bulundurmalıdır. Mükerrer olan kodlar otomatik elenecektir.
          </div>
        </div>
        <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-start', gap: 8 }}>
          <button className="btn-p" type="button" onClick={handleSubmit} disabled={saving || !file}>
            <i className="fa-solid fa-file-import" style={{ marginRight: 6 }} />
            {saving ? 'İçe Aktarılıyor...' : 'Yükle ve İçe Aktar'}
          </button>
          <button className="btn-o" type="button" onClick={onClose}>İptal</button>
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

  // Rapor Sekmesi State'leri
  const [activeTab, setActiveTab] = useState('sets')
  const [reportLoading, setReportLoading] = useState(false)
  const [reportCoupons, setReportCoupons] = useState([])
  const [showDeleted, setShowDeleted] = useState(false)
  const [reportColumnFilters, setReportColumnFilters] = useState({
    seriesName: '',
    code: '',
    statusLabel: '',
    usedAtText: '',
    customerName: '',
    branchName: '',
    channel: '',
    saleNo: '',
  })
  const [reportSortConfig, setReportSortConfig] = useState({ key: 'created_at', direction: 'desc' })
  const [importOpen, setImportOpen] = useState(false)
  const [importSaving, setImportSaving] = useState(false)

  useEffect(() => {
    let mounted = true

    async function loadPage() {
      setLoading(true)
      try {
        const result = await loadLoyaltyWorkspace(workspace)
        if (!mounted) return
        setWorkspacePayload(result)
        setCouponSets(normalizeCouponSetList(result.couponSeries))
        setSchemaReady(result.schemaReady)
        setDatabaseUnavailable(Boolean(result.databaseUnavailable))
      } catch (error) {
        if (mounted) toast(error.message || 'Kupon setleri yüklenemedi', 'error')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    loadPage()
    return () => { mounted = false }
  }, [workspace.scope, workspace.branchId, workspace.branchName])

  // Rapor verisini veritabanından çekme ve bellekte birleştirme (Stitching)
  async function loadCouponReportData() {
    const seriesIds = couponSets.map(s => s.id)
    if (seriesIds.length === 0) {
      setReportCoupons([])
      return
    }

    setReportLoading(true)
    try {
      let query = db.from('loyalty_coupons').select('*')
      if (showDeleted) {
        query = query.not('deleted_at', 'is', null)
      } else {
        query = query.is('deleted_at', null)
      }
      query = query.in('series_id', seriesIds).limit(1000)

      const { data, error } = await query
      if (error) throw error

      if (!data || data.length === 0) {
        setReportCoupons([])
        return
      }

      // UUID parametre doğrulama regex'i (hatalı cast işlemlerini engellemek için)
      const uuidRegex = /^[0-9a-fA-F-]{36}$/
      
      const customerIds = [...new Set(
        data.flatMap(item => [item.customer_id, item.redeemed_by_customer_id])
          .filter(id => id && uuidRegex.test(String(id)))
      )]

      const saleIds = [...new Set(
        data.map(item => item.redeemed_source_ref_id)
          .filter(id => id && uuidRegex.test(String(id)))
      )]

      const [customersRes, salesRes] = await Promise.all([
        customerIds.length > 0
          ? db.from('musteriler').select('id, ad_soyad, telefon').in('id', customerIds)
          : Promise.resolve({ data: [] }),
        saleIds.length > 0
          ? db.from('sales').select('id, sale_no, branch_name, branch_id, source').in('id', saleIds)
          : Promise.resolve({ data: [] })
      ])

      const customerMap = new Map(customersRes.data?.map(c => [c.id, c]) || [])
      const saleMap = new Map(salesRes.data?.map(s => [s.id, s]) || [])
      const seriesMap = new Map(couponSets.map(s => [s.id, s]))

      const stitched = data.map(coupon => {
        const series = seriesMap.get(coupon.series_id)
        const customer = customerMap.get(coupon.customer_id)
        const redeemer = customerMap.get(coupon.redeemed_by_customer_id)
        const sale = saleMap.get(coupon.redeemed_source_ref_id)

        let redemptionStatus = coupon.redemption_status || 'available'
        const expiresAt = coupon.expires_at
        if (redemptionStatus !== 'used' && expiresAt) {
          const expiryDate = new Date(expiresAt)
          if (Number.isFinite(expiryDate.getTime()) && expiryDate.getTime() <= Date.now()) {
            redemptionStatus = 'expired'
          }
        }
        
        let statusLabel = 'Kullanılabilir'
        let statusColor = '#166534'
        let statusBg = '#ecfdf5'
        let statusBorder = '#bbf7d0'

        if (coupon.deleted_at) {
          statusLabel = 'Silindi'
          statusColor = '#991b1b'
          statusBg = '#fef2f2'
          statusBorder = '#fecaca'
        } else if (!coupon.active) {
          statusLabel = 'Pasif'
          statusColor = '#475569'
          statusBg = '#f8fafc'
          statusBorder = '#e2e8f0'
        } else if (redemptionStatus === 'used' || coupon.is_used) {
          statusLabel = 'Kullanıldı'
          statusColor = '#1e3a8a'
          statusBg = '#dbeafe'
          statusBorder = '#bfdbfe'
        } else if (redemptionStatus === 'expired') {
          statusLabel = 'Süresi Doldu'
          statusColor = '#b45309'
          statusBg = '#fff7ed'
          statusBorder = '#fed7aa'
        } else if (redemptionStatus === 'reserved') {
          statusLabel = 'Ayrıldı'
          statusColor = '#7c3aed'
          statusBg = '#f5f3ff'
          statusBorder = '#ddd6fe'
        }

        return {
          ...coupon,
          seriesName: series?.name || 'Bilinmeyen Seri',
          customerName: customer?.ad_soyad || (coupon.customer_id ? `Atanan (${coupon.customer_id.slice(0, 8)})` : '—'),
          redeemerName: redeemer?.ad_soyad || (coupon.redeemed_by_customer_id ? `Kullanan (${coupon.redeemed_by_customer_id.slice(0, 8)})` : '—'),
          saleNo: sale?.sale_no || coupon.redeemed_source_ref_id || '—',
          branchName: sale?.branch_name || '—',
          channel: sale?.source || coupon.redeemed_channel || '—',
          usedAtText: coupon.used_at ? new Date(coupon.used_at).toLocaleString('tr-TR') : '—',
          statusLabel,
          statusColor,
          statusBg,
          statusBorder,
        }
      })

      setReportCoupons(stitched)
    } catch (error) {
      toast(error.message || 'Kupon raporu yüklenemedi', 'error')
    } finally {
      setReportLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'report' && couponSets.length > 0) {
      loadCouponReportData()
    }
  }, [activeTab, showDeleted, couponSets])

  // Rapor Filtreleme ve Sıralama
  const filteredReportCoupons = useMemo(() => {
    return reportCoupons.filter(row => {
      return (
        matchesColumnFilter(row.seriesName, reportColumnFilters.seriesName) &&
        matchesColumnFilter(row.code, reportColumnFilters.code) &&
        matchesColumnFilter(row.statusLabel, reportColumnFilters.statusLabel) &&
        matchesColumnFilter(row.usedAtText, reportColumnFilters.usedAtText) &&
        matchesColumnFilter(row.customerName, reportColumnFilters.customerName) &&
        matchesColumnFilter(row.branchName, reportColumnFilters.branchName) &&
        matchesColumnFilter(row.channel, reportColumnFilters.channel) &&
        matchesColumnFilter(row.saleNo, reportColumnFilters.saleNo)
      )
    })
  }, [reportCoupons, reportColumnFilters])

  const sortedReportCoupons = useMemo(() => {
    const sorted = [...filteredReportCoupons]
    sorted.sort((left, right) => {
      switch (reportSortConfig.key) {
        case 'seriesName':
          return compareValues(left.seriesName, right.seriesName, reportSortConfig.direction)
        case 'code':
          return compareValues(left.code, right.code, reportSortConfig.direction)
        case 'status':
          return compareValues(left.statusLabel, right.statusLabel, reportSortConfig.direction)
        case 'usedAt':
          return compareValues(left.used_at || '', right.used_at || '', reportSortConfig.direction)
        case 'customer':
          return compareValues(left.customerName, right.customerName, reportSortConfig.direction)
        case 'branch':
          return compareValues(left.branchName, right.branchName, reportSortConfig.direction)
        case 'channel':
          return compareValues(left.channel, right.channel, reportSortConfig.direction)
        case 'saleNo':
          return compareValues(left.saleNo, right.saleNo, reportSortConfig.direction)
        default:
          return compareValues(left.created_at || '', right.created_at || '', reportSortConfig.direction)
      }
    })
    return sorted
  }, [filteredReportCoupons, reportSortConfig])

  function toggleReportSort(key) {
    setReportSortConfig(prev => {
      if (prev.key !== key) return { key, direction: 'asc' }
      if (prev.direction === 'desc') return { key, direction: 'asc' }
      return { key, direction: 'desc' }
    })
  }

  function updateReportColumnFilter(key, value) {
    setReportColumnFilters(prev => ({ ...prev, [key]: value }))
  }

  function resetReportFilters() {
    setReportColumnFilters({
      seriesName: '',
      code: '',
      statusLabel: '',
      usedAtText: '',
      customerName: '',
      branchName: '',
      channel: '',
      saleNo: '',
    })
  }

  // Toplu İşlemler
  async function handleBulkAction(actionType) {
    const targetIds = filteredReportCoupons.map(row => row.id)
    if (targetIds.length === 0) {
      toast('İşlem uygulanacak kupon bulunamadı', 'warning')
      return
    }

    setSaving(true)
    try {
      let updatePayload = {}
      let message = ''

      if (actionType === 'activate') {
        updatePayload = { active: true, deleted_at: null, updated_at: new Date().toISOString() }
        message = 'Filtrelenen kuponlar aktifleştirildi.'
      } else if (actionType === 'deactivate') {
        updatePayload = { active: false, updated_at: new Date().toISOString() }
        message = 'Filtrelenen kuponlar deaktifleştirildi.'
      } else if (actionType === 'delete') {
        updatePayload = { active: false, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }
        message = 'Filtrelenen kuponlar soft-delete (silindi) yapıldı.'
      } else if (actionType === 'restore') {
        updatePayload = { active: true, deleted_at: null, updated_at: new Date().toISOString() }
        message = 'Filtrelenen silinmiş kuponlar başarıyla geri yüklendi.'
      }

      const { error } = await db.from('loyalty_coupons').update(updatePayload).in('id', targetIds)
      if (error) throw error

      toast(message, 'success')
      await loadCouponReportData()

      const result = await loadLoyaltyWorkspace(workspace)
      setCouponSets(normalizeCouponSetList(result.couponSeries))
      setWorkspacePayload(result)
    } catch (error) {
      toast(error.message || 'Toplu işlem gerçekleştirilemedi', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Excel Excel Dışa Aktar, Şablon ve İçe Aktar
  function handleExportExcel() {
    try {
      const exportData = filteredReportCoupons.map(row => ({
        'Kupon Seti': row.seriesName,
        'Kupon Kodu': row.code,
        'Durum': row.statusLabel,
        'Kullanım Tarihi': row.usedAtText,
        'Müşteri / Sahibi': row.customerName,
        'Kullanan Müşteri': row.redeemerName,
        'Şube': row.branchName,
        'Satış Kanalı': row.channel,
        'Fiş / İşlem No': row.saleNo,
        'Not': row.note || '',
      }))

      const worksheet = XLSX.utils.json_to_sheet(exportData)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Kupon Raporu')
      XLSX.writeFile(workbook, `kupon_raporu_${new Date().toISOString().slice(0, 10)}.xlsx`)
      toast('Kupon raporu başarıyla Excel\'e aktarıldı.', 'success')
    } catch (error) {
      toast(`Dışa aktarma hatası: ${error.message}`, 'error')
    }
  }

  function handleDownloadTemplate() {
    try {
      const templateData = [
        { 'Kupon Kodu': 'KPN-ORNEK-12345' },
        { 'Kupon Kodu': 'KPN-ORNEK-67890' },
      ]
      const worksheet = XLSX.utils.json_to_sheet(templateData)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Kupon Yükleme Şablonu')
      XLSX.writeFile(workbook, 'kupon_ice_aktarim_sablonu.xlsx')
      toast('Boş Excel şablonu başarıyla indirildi.', 'success')
    } catch (error) {
      toast(`Şablon indirme hatası: ${error.message}`, 'error')
    }
  }

  async function handleImportExcel(selectedSeriesId, file) {
    setImportSaving(true)
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const json = XLSX.utils.sheet_to_json(worksheet)
        
        const codes = json.map(row => {
          const rawCode = row['Kupon Kodu'] || row['kupon kodu'] || row['KuponKodu'] || Object.values(row)[0]
          return String(rawCode || '').trim()
        }).filter(Boolean)

        if (codes.length === 0) {
          toast('Excel dosyasında geçerli bir "Kupon Kodu" sütunu bulunamadı.', 'error')
          setImportSaving(false)
          return
        }

        const { data: existingCodes, error: checkError } = await db
          .from('loyalty_coupons')
          .select('code')
          .in('code', codes)
          .is('deleted_at', null)

        if (checkError) throw checkError

        const existingSet = new Set(existingCodes.map(row => row.code.toUpperCase()))
        const uniqueNewCodes = [...new Set(codes)].filter(code => !existingSet.has(code.toUpperCase()))
        
        if (uniqueNewCodes.length === 0) {
          toast('Tüm kupon kodları veritabanında zaten mevcut. İçe aktarma iptal edildi.', 'warning')
          setImportSaving(false)
          return
        }

        const insertRows = uniqueNewCodes.map(code => ({
          id: `coupon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          series_id: selectedSeriesId,
          code: code,
          is_used: false,
          active: true,
          metadata: {},
          redemption_status: 'available',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          issued_at: new Date().toISOString(),
        }))

        const { error: insertError } = await db.from('loyalty_coupons').insert(insertRows)
        if (insertError) throw insertError

        const targetSeries = couponSets.find(s => s.id === selectedSeriesId)
        if (targetSeries) {
          const nextCount = (targetSeries.singleCoupon ? 1 : targetSeries.couponCount) + insertRows.length
          const { error: seriesUpdateError } = await db
            .from('loyalty_coupon_series')
            .update({
              coupon_count: nextCount,
              updated_at: new Date().toISOString(),
            })
            .eq('id', selectedSeriesId)
          if (seriesUpdateError) throw seriesUpdateError
        }

        toast(`${uniqueNewCodes.length} adet kupon başarıyla içe aktarıldı. ${codes.length - uniqueNewCodes.length} mükerrer kod elendi.`, 'success')
        
        const workspaceResult = await loadLoyaltyWorkspace(workspace)
        setCouponSets(normalizeCouponSetList(workspaceResult.couponSeries))
        setWorkspacePayload(workspaceResult)
        await loadCouponReportData()
        setImportOpen(false)
      } catch (err) {
        toast(`İçe aktarma hatası: ${err.message}`, 'error')
      } finally {
        setImportSaving(false)
      }
    }
    reader.readAsArrayBuffer(file)
  }

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

  async function handleLoadCodes(seriesId) {
    setLoading(true)
    try {
      const codes = await loadCouponsForSeries(seriesId)
      setCouponSets(prev => prev.map(item => {
        if (item.id === seriesId) {
          return {
            ...item,
            codes: codes.map(c => c.code),
            coupons: codes,
            _couponsNotLoaded: false
          }
        }
        return item
      }))
      toast('Kupon kodları başarıyla yüklendi.', 'success')
    } catch (error) {
      toast('Kupon kodları yüklenemedi: ' + error.message, 'error')
    } finally {
      setLoading(false)
    }
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
    await persistCouponSets(nextSets, 'Kupon seti güncellendi')
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <Header
        title="Kupon Yönetimi"
        subtitle="Kupon setlerini ve tekil kupon raporlarını buradan yönetin."
        actions={(
          <div style={{ display: 'flex', gap: 8 }}>
            {activeTab === 'report' ? (
              <>
                <button className="btn-o" onClick={() => setImportOpen(true)}>
                  <i className="fa-solid fa-file-import" style={{ marginRight: 6 }} />
                  Excel'den Yükle
                </button>
                <button className="btn-o" onClick={handleDownloadTemplate}>
                  <i className="fa-solid fa-file-arrow-down" style={{ marginRight: 6 }} />
                  Şablon İndir
                </button>
                <button className="btn-o" onClick={handleExportExcel}>
                  <i className="fa-solid fa-file-excel" style={{ marginRight: 6 }} />
                  Excel'e Aktar
                </button>
                <button className="btn-o" onClick={resetReportFilters}>
                  <i className="fa-solid fa-filter-circle-xmark" style={{ marginRight: 6 }} />
                  Filtreleri Temizle
                </button>
              </>
            ) : (
              <AddButton onClick={openCreateModal} label="Yeni Kupon Seti Ekle" disabled={databaseUnavailable || !schemaReady} />
            )}
          </div>
        )}
      />

      {databaseUnavailable && (
        <div className="card" style={{ padding: 18, border: '1px solid #fdba74', background: '#fff7ed', color: '#9a3412' }}>
          DATABASE UNAVAILABLE. Kupon setleri canlı iş verisidir; fallback kapatıldı ve kayıt sadece veritabanı tablolarına yapılır.
        </div>
      )}

      {/* İki Sekmeli Yapı */}
      <div className="card" style={{ padding: 6, display: 'inline-flex', gap: 6, flexWrap: 'wrap', flexDirection: 'row', width: 'fit-content' }}>
        <button
          type="button"
          onClick={() => setActiveTab('sets')}
          style={{
            border: 'none',
            borderRadius: 12,
            background: activeTab === 'sets' ? '#f59e0b' : '#fff',
            color: activeTab === 'sets' ? '#fff' : '#475569',
            padding: '10px 14px',
            fontSize: '.82rem',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: activeTab === 'sets' ? '0 10px 20px rgba(245,158,11,.22)' : 'none',
          }}
        >
          <i className="fa-solid fa-tags" />
          Kupon Setleri
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('report')}
          style={{
            border: 'none',
            borderRadius: 12,
            background: activeTab === 'report' ? '#f59e0b' : '#fff',
            color: activeTab === 'report' ? '#fff' : '#475569',
            padding: '10px 14px',
            fontSize: '.82rem',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: activeTab === 'report' ? '0 10px 20px rgba(245,158,11,.22)' : 'none',
          }}
        >
          <i className="fa-solid fa-chart-line" />
          Kupon Raporu / Liste
        </button>
      </div>

      {activeTab === 'sets' ? (
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 800, color: '#0f172a' }}>Kupon Seti Listesi</div>
              <div style={{ marginTop: 4, fontSize: '.8rem', color: '#64748b' }}>
                Kayıtlı kupon setlerini arayın, filtreleyin, düzenleyin veya yeni set oluşturun.
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
            <input className="f-input" value={search} onChange={event => setSearch(event.target.value)} placeholder="Kupon seti adı, ön ek veya kod ara..." />
          </div>

          <div style={{ border: '1px solid #e2e8f0', borderRadius: 18, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 0.8fr 0.8fr 0.9fr 0.8fr 1fr', gap: 12, padding: '14px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '.76rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase' }}>
              <div>Kupon Seti</div>
              <div>Ön Ek</div>
              <div>Kupon Sayısı</div>
              <div>Karakter Seti</div>
              <div>Durum</div>
              <div>İşlem</div>
            </div>

            {loading ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>Kupon setleri yükleniyor...</div>
            ) : filteredSets.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>Gösterilecek kupon seti bulunamadı.</div>
            ) : filteredSets.map(series => (
              <div key={series.id} style={{ display: 'grid', gridTemplateColumns: '2fr 0.8fr 0.8fr 0.9fr 0.8fr 1fr', gap: 12, padding: '16px', borderBottom: '1px solid #e2e8f0', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 800, color: '#0f172a' }}>{series.name}</div>
                  <div style={{ marginTop: 4, fontSize: '.8rem', color: '#64748b' }}>
                    {series._couponsNotLoaded ? (
                      <span 
                        style={{ color: '#0284c7', cursor: 'pointer', textDecoration: 'underline', fontWeight: 600 }} 
                        onClick={(e) => { e.stopPropagation(); handleLoadCodes(series.id); }}
                      >
                        [Kodları Yükle]
                      </span>
                    ) : (
                      `${getCouponCodes(series).length} / ${getCouponTargetCount(series)} kod hazır`
                    )}, {series.useAfterCheckout ? 'sipariş sonrası kullanılır' : 'anında kullanılabilir'}
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
                  <button className="btn-o" type="button" onClick={() => openEditModal(series)}>Düzenle</button>
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
              Sadakat tabloları hazır olmadan yeni kupon seti açılamaz.
            </div>
          )}
        </div>
      ) : (
        <div className="card" style={{ padding: 18 }}>
          {/* Üst Filtre & Toplu İşlem kontrolleri */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 800, color: '#0f172a' }}>Tekil Kupon Raporu</div>
              <div style={{ marginTop: 4, fontSize: '.8rem', color: '#64748b' }}>
                Kuponların kullanım durumunu, hangi müşteri, şube ve fişte kullanıldığını filtrelerle inceleyin.
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '.84rem', color: '#475569', fontWeight: 600 }}>
                <input type="checkbox" checked={showDeleted} onChange={e => setShowDeleted(e.target.checked)} />
                Silinen Kuponları Göster
              </label>
            </div>
          </div>

          {/* Toplu İşlem Butonları */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '12px 16px', background: '#f8fafc', borderRadius: 14, border: '1px solid #e2e8f0', marginBottom: 16 }}>
            <span style={{ fontSize: '.78rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
              Toplu İşlemler ({filteredReportCoupons.length} Satır):
            </span>
            <button className="btn-o" style={{ fontSize: '.78rem', padding: '6px 12px' }} onClick={() => handleBulkAction('activate')} disabled={saving || filteredReportCoupons.length === 0}>
              Tümünü Aktifleştir
            </button>
            <button className="btn-o" style={{ fontSize: '.78rem', padding: '6px 12px' }} onClick={() => handleBulkAction('deactivate')} disabled={saving || filteredReportCoupons.length === 0}>
              Tümünü Pasifleştir
            </button>
            <button className="btn-o" style={{ fontSize: '.78rem', padding: '6px 12px', color: '#b91c1c' }} onClick={() => handleBulkAction('delete')} disabled={saving || filteredReportCoupons.length === 0}>
              Tümünü Sil (Soft-Delete)
            </button>
            {showDeleted && (
              <button className="btn-o" style={{ fontSize: '.78rem', padding: '6px 12px', color: '#047857' }} onClick={() => handleBulkAction('restore')} disabled={saving || filteredReportCoupons.length === 0}>
                Tümünü Geri Yükle
              </button>
            )}
          </div>

          {/* Kolon Filtreli Rapor Tablosu */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 18, overflow: 'hidden' }}>
            <table className="tbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left' }}>
                    <button type="button" onClick={() => toggleReportSort('seriesName')} style={{ border: 'none', background: 'transparent', padding: 0, font: 'inherit', fontWeight: 800, cursor: 'pointer' }}>
                      Kupon Seti {reportSortConfig.key === 'seriesName' ? (reportSortConfig.direction === 'desc' ? '↓' : '↑') : '↕'}
                    </button>
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left' }}>
                    <button type="button" onClick={() => toggleReportSort('code')} style={{ border: 'none', background: 'transparent', padding: 0, font: 'inherit', fontWeight: 800, cursor: 'pointer' }}>
                      Kupon Kodu {reportSortConfig.key === 'code' ? (reportSortConfig.direction === 'desc' ? '↓' : '↑') : '↕'}
                    </button>
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left' }}>
                    <button type="button" onClick={() => toggleReportSort('status')} style={{ border: 'none', background: 'transparent', padding: 0, font: 'inherit', fontWeight: 800, cursor: 'pointer' }}>
                      Durum {reportSortConfig.key === 'status' ? (reportSortConfig.direction === 'desc' ? '↓' : '↑') : '↕'}
                    </button>
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left' }}>
                    <button type="button" onClick={() => toggleReportSort('usedAt')} style={{ border: 'none', background: 'transparent', padding: 0, font: 'inherit', fontWeight: 800, cursor: 'pointer' }}>
                      Kullanım Tarihi {reportSortConfig.key === 'usedAt' ? (reportSortConfig.direction === 'desc' ? '↓' : '↑') : '↕'}
                    </button>
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left' }}>
                    <button type="button" onClick={() => toggleReportSort('customer')} style={{ border: 'none', background: 'transparent', padding: 0, font: 'inherit', fontWeight: 800, cursor: 'pointer' }}>
                      Sahibi / Kullanan {reportSortConfig.key === 'customer' ? (reportSortConfig.direction === 'desc' ? '↓' : '↑') : '↕'}
                    </button>
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left' }}>
                    <button type="button" onClick={() => toggleReportSort('branch')} style={{ border: 'none', background: 'transparent', padding: 0, font: 'inherit', fontWeight: 800, cursor: 'pointer' }}>
                      Şube {reportSortConfig.key === 'branch' ? (reportSortConfig.direction === 'desc' ? '↓' : '↑') : '↕'}
                    </button>
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left' }}>
                    <button type="button" onClick={() => toggleReportSort('channel')} style={{ border: 'none', background: 'transparent', padding: 0, font: 'inherit', fontWeight: 800, cursor: 'pointer' }}>
                      Satış Kanalı {reportSortConfig.key === 'channel' ? (reportSortConfig.direction === 'desc' ? '↓' : '↑') : '↕'}
                    </button>
                  </th>
                  <th style={{ padding: '12px 16px', textAlign: 'left' }}>
                    <button type="button" onClick={() => toggleReportSort('saleNo')} style={{ border: 'none', background: 'transparent', padding: 0, font: 'inherit', fontWeight: 800, cursor: 'pointer' }}>
                      Fiş No {reportSortConfig.key === 'saleNo' ? (reportSortConfig.direction === 'desc' ? '↓' : '↑') : '↕'}
                    </button>
                  </th>
                </tr>
                {/* Kolon Filtre Inputları */}
                <tr style={{ background: '#ffffff', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '6px 10px' }}>
                    <input className="f-input" style={{ height: 32, padding: '4px 8px', fontSize: '.78rem' }} value={reportColumnFilters.seriesName} onChange={e => updateReportColumnFilter('seriesName', e.target.value)} placeholder="Ara..." />
                  </th>
                  <th style={{ padding: '6px 10px' }}>
                    <input className="f-input" style={{ height: 32, padding: '4px 8px', fontSize: '.78rem' }} value={reportColumnFilters.code} onChange={e => updateReportColumnFilter('code', e.target.value)} placeholder="Ara..." />
                  </th>
                  <th style={{ padding: '6px 10px' }}>
                    <input className="f-input" style={{ height: 32, padding: '4px 8px', fontSize: '.78rem' }} value={reportColumnFilters.statusLabel} onChange={e => updateReportColumnFilter('statusLabel', e.target.value)} placeholder="Ara..." />
                  </th>
                  <th style={{ padding: '6px 10px' }}>
                    <input className="f-input" style={{ height: 32, padding: '4px 8px', fontSize: '.78rem' }} value={reportColumnFilters.usedAtText} onChange={e => updateReportColumnFilter('usedAtText', e.target.value)} placeholder="Ara..." />
                  </th>
                  <th style={{ padding: '6px 10px' }}>
                    <input className="f-input" style={{ height: 32, padding: '4px 8px', fontSize: '.78rem' }} value={reportColumnFilters.customerName} onChange={e => updateReportColumnFilter('customerName', e.target.value)} placeholder="Ara..." />
                  </th>
                  <th style={{ padding: '6px 10px' }}>
                    <input className="f-input" style={{ height: 32, padding: '4px 8px', fontSize: '.78rem' }} value={reportColumnFilters.branchName} onChange={e => updateReportColumnFilter('branchName', e.target.value)} placeholder="Ara..." />
                  </th>
                  <th style={{ padding: '6px 10px' }}>
                    <input className="f-input" style={{ height: 32, padding: '4px 8px', fontSize: '.78rem' }} value={reportColumnFilters.channel} onChange={e => updateReportColumnFilter('channel', e.target.value)} placeholder="Ara..." />
                  </th>
                  <th style={{ padding: '6px 10px' }}>
                    <input className="f-input" style={{ height: 32, padding: '4px 8px', fontSize: '.78rem' }} value={reportColumnFilters.saleNo} onChange={e => updateReportColumnFilter('saleNo', e.target.value)} placeholder="Ara..." />
                  </th>
                </tr>
              </thead>
              <tbody>
                {reportLoading ? (
                  <tr>
                    <td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>Kupon raporu yükleniyor...</td>
                  </tr>
                ) : sortedReportCoupons.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>Filtrelere uygun kupon kaydı bulunamadı.</td>
                  </tr>
                ) : sortedReportCoupons.map(coupon => (
                  <tr key={coupon.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: '#1e293b' }}>{coupon.seriesName}</td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 700, color: '#334155' }}>{coupon.code}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        borderRadius: 999,
                        padding: '4px 10px',
                        fontSize: '.72rem',
                        fontWeight: 800,
                        background: coupon.statusBg,
                        color: coupon.statusColor,
                        border: `1px solid ${coupon.statusBorder}`,
                        whiteSpace: 'nowrap'
                      }}>
                        {coupon.statusLabel}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#475569' }}>{coupon.usedAtText}</td>
                    <td style={{ padding: '12px 16px', color: '#475569' }}>
                      <div>{coupon.customerName}</div>
                      {coupon.redeemerName !== '—' && coupon.redeemerName !== coupon.customerName && (
                        <div style={{ fontSize: '.72rem', color: '#94a3b8', marginTop: 2 }}>Kullanan: {coupon.redeemerName}</div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#475569' }}>{coupon.branchName}</td>
                    <td style={{ padding: '12px 16px', color: '#475569', textTransform: 'capitalize' }}>{coupon.channel}</td>
                    <td style={{ padding: '12px 16px', color: '#475569', fontFamily: 'monospace' }}>{coupon.saleNo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <CouponSetModal
        open={Boolean(editingSet)}
        value={editingSet}
        saving={saving}
        schemaReady={schemaReady}
        databaseUnavailable={databaseUnavailable}
        isNew={Boolean(editingSet) && !couponSets.some(item => item.id === editingSet?.id)}
        onClose={() => setEditingSet(null)}
        onSave={handleSaveModal}
        toast={toast}
      />

      <CouponImportModal
        open={importOpen}
        couponSets={couponSets}
        saving={importSaving}
        onClose={() => setImportOpen(false)}
        onImport={handleImportExcel}
      />
    </div>
  )
}

