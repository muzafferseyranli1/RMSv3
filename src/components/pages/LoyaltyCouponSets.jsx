import { useEffect, useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useToast } from '@/hooks/useToast'
import AddButton from '@/components/ui/AddButton'
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

function CouponSetModal({ open, value, saving, schemaReady, databaseUnavailable, isNew, onClose, onSave }) {
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
    await persistCouponSets(nextSets, 'Kupon seti güncellendi')
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <Header
        title="Kupon Setleri"
        subtitle={`${couponSets.length} kupon seti burada listelenir; kuponun koşulu ve eylemi kampanya kuralında planlanır.`}
        actions={(
          <>
            <AddButton onClick={openCreateModal} label="Yeni Kupon Seti Ekle" disabled={databaseUnavailable || !schemaReady} />
          </>
        )}
      />

      {databaseUnavailable && (
        <div className="card" style={{ padding: 18, border: '1px solid #fdba74', background: '#fff7ed', color: '#9a3412' }}>
          DATABASE UNAVAILABLE. Kupon setleri canlı iş verisidir; `settings` fallback kapatıldı ve kayıt sadece veritabanı tablolarına yapılır.
        </div>
      )}

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
                  {getCouponCodes(series).length} / {getCouponTargetCount(series)} kod hazır, {series.useAfterCheckout ? 'sipariş sonrası kullanılır' : 'anında kullanılabilir'}
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

      <CouponSetModal
        open={Boolean(editingSet)}
        value={editingSet}
        saving={saving}
        schemaReady={schemaReady}
        databaseUnavailable={databaseUnavailable}
        isNew={Boolean(editingSet) && !couponSets.some(item => item.id === editingSet?.id)}
        onClose={() => setEditingSet(null)}
        onSave={handleSaveModal}
      />
    </div>
  )
}
