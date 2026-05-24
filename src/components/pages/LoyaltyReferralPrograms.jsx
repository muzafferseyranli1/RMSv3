import { useEffect, useMemo, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '@/components/layout/Header'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useWorkspace } from '@/context/WorkspaceContext'
import AddButton from '@/components/ui/AddButton'
import { useToast } from '@/hooks/useToast'
import {
  loadLoyaltyWorkspace,
  saveLoyaltyWorkspace,
  normalizeReferralProgram,
} from '@/lib/loyalty'
import { db } from '@/lib/db'

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

function formatDateTimeLocal(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60000)
  return local.toISOString().slice(0, 16)
}

function StatusChip({ active, children }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 999,
      padding: '5px 10px',
      fontSize: '.74rem',
      fontWeight: 800,
      background: active ? '#ecfdf5' : '#f8fafc',
      color: active ? '#166534' : '#64748b',
      border: `1px solid ${active ? '#bbf7d0' : '#e2e8f0'}`,
    }}>
      {children}
    </span>
  )
}

function SearchableMultiSelect({
  options,
  selectedValues,
  onChange,
  placeholder = 'Seçim yapın',
  searchPlaceholder = 'Ara',
  emptyText = 'Sonuç bulunamadı.',
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const rootRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!open) return
    setSearch('')
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  const normalizedSelectedValues = Array.isArray(selectedValues) ? selectedValues.map(value => String(value)) : []
  const selectedSet = new Set(normalizedSelectedValues)
  const selectedOptions = options.filter(option => selectedSet.has(String(option.value)))
  const normalizedSearch = search.trim().toLowerCase()
  const filteredOptions = options.filter(option => {
    const haystack = [option.label, option.description, option.value]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return !normalizedSearch || haystack.includes(normalizedSearch)
  })

  function toggleValue(nextValue) {
    const normalizedValue = String(nextValue)
    const nextValues = selectedSet.has(normalizedValue)
      ? normalizedSelectedValues.filter(value => value !== normalizedValue)
      : [...normalizedSelectedValues, normalizedValue]
    onChange(nextValues)
  }

  return (
    <div ref={rootRef} style={{ display: 'grid', gap: 10, position: 'relative' }}>
      <button
        type="button"
        className="f-input"
        onClick={() => setOpen(current => !current)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', textAlign: 'left', cursor: 'pointer', background: '#fff' }}
      >
        <span style={{ color: selectedOptions.length > 0 ? '#0f172a' : '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedOptions.length > 0 ? `${selectedOptions.length} kategori seçildi` : placeholder}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 12 }}>
          {selectedOptions.length > 0 ? (
            <i
              className="fa-solid fa-xmark"
              onClick={(e) => { e.stopPropagation(); onChange([]) }}
              style={{ color: '#94a3b8', cursor: 'pointer' }}
            />
          ) : null}
          <i className={`fa-solid ${open ? 'fa-chevron-up' : 'fa-chevron-down'}`} style={{ color: '#64748b' }} />
        </span>
      </button>

      {selectedOptions.length > 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {selectedOptions.map(option => (
            <span
              key={option.value}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, border: '1px solid #ddd6fe', background: '#f5f3ff', color: '#7c3aed', fontWeight: 800, padding: '4px 10px', fontSize: '.74rem' }}
            >
              {option.label}
              <i
                className="fa-solid fa-xmark"
                onClick={() => toggleValue(option.value)}
                style={{ cursor: 'pointer', opacity: 0.7 }}
              />
            </span>
          ))}
        </div>
      ) : null}

      {open ? (
        <div style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, zIndex: 30, border: '1px solid #ddd6fe', borderRadius: 14, background: '#fff', boxShadow: '0 18px 36px rgba(15, 23, 42, 0.14)', overflow: 'hidden' }}>
          <div style={{ padding: 10, borderBottom: '1px solid #e2e8f0', display: 'grid', gap: 8 }}>
            <input
              ref={inputRef}
              className="f-input"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder={searchPlaceholder}
            />
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto', padding: 8 }}>
            {filteredOptions.length === 0 ? (
              <div style={{ padding: 14, fontSize: '.82rem', color: '#94a3b8', textAlign: 'center' }}>{emptyText}</div>
            ) : filteredOptions.map(option => {
              const checked = selectedSet.has(String(option.value))
              return (
                <label
                  key={option.value}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 10,
                    cursor: 'pointer',
                    background: checked ? '#f5f3ff' : '#fff',
                    color: checked ? '#7c3aed' : '#334155',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleValue(option.value)}
                    style={{ pointerEvents: 'none' }}
                  />
                  <div style={{ fontWeight: 700, fontSize: '.84rem' }}>{option.label}</div>
                </label>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ReferralProgramModal({ open, draft, saving, isNew, onClose, onChange, onSave, onDelete, categories, canWrite }) {
  if (!open || !draft) return null

  const config = draft.configJson || {}

  function patchConfig(key, value) {
    onChange('configJson', { ...config, [key]: value })
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(15, 23, 42, 0.45)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      zIndex: 1200,
    }}>
      <div className="modal" style={{
        width: 'min(760px, 100%)',
        maxHeight: 'calc(100vh - 40px)',
        overflow: 'hidden',
        background: '#fff',
        borderRadius: 18,
        boxShadow: '0 30px 80px rgba(15, 23, 42, 0.24)',
        display: 'grid',
        gridTemplateRows: 'auto 1fr auto',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          padding: '18px 20px 14px',
          borderBottom: '1px solid #e2e8f0',
        }}>
          <div>
            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1.02rem' }}>
              {isNew ? 'Yeni Referans Programı' : 'Referans Programı Detayı'}
            </div>
            <div style={{ marginTop: 4, fontSize: '.84rem', color: '#64748b' }}>
              Referans alma/verme kurallarını, davet başarı kriterlerini ve kod üretim modlarını yapılandırın.
            </div>
          </div>
          <button className="btn-o" type="button" onClick={onClose}>Kapat</button>
        </div>

        <div style={{ padding: 20, overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <div className="f-label">Program Adı</div>
              <input
                className="f-input"
                value={draft.name}
                onChange={event => onChange('name', event.target.value)}
                placeholder="Örn: Arkadaşını Getir Kampanyası"
              />
            </div>

            <div>
              <div className="f-label">Kod Üretim & Kullanım Modu</div>
              <select
                className="f-input"
                value={draft.mode}
                onChange={event => {
                  onChange('mode', event.target.value)
                  onChange('configJson', {}) // Reset config
                }}
              >
                <option value="unique_multiple">Çoklu Davet Kodu (Davetçi Özel limitli)</option>
                <option value="single_reusable_date">Ortak Davet Kodu (Tarih Sınırlı)</option>
                <option value="single_reusable_limit">Ortak Davet Kodu (Kullanım Sınırlı)</option>
              </select>
            </div>

            {draft.mode === 'unique_multiple' && (
              <div>
                <div className="f-label">Davetçi Başına Maks. Davet Kodu</div>
                <input
                  className="f-input"
                  type="number"
                  min={1}
                  value={config.max_unique_codes !== undefined ? config.max_unique_codes : 4}
                  onChange={event => patchConfig('max_unique_codes', parseInt(event.target.value, 10) || 4)}
                />
              </div>
            )}

            {draft.mode === 'single_reusable_date' && (
              <>
                <div>
                  <div className="f-label">Geçerlilik Başlangıcı</div>
                  <input
                    className="f-input"
                    type="datetime-local"
                    value={formatDateTimeLocal(config.valid_from)}
                    onChange={event => patchConfig('valid_from', event.target.value ? new Date(event.target.value).toISOString() : '')}
                  />
                </div>
                <div>
                  <div className="f-label">Geçerlilik Bitişi</div>
                  <input
                    className="f-input"
                    type="datetime-local"
                    value={formatDateTimeLocal(config.valid_until)}
                    onChange={event => patchConfig('valid_until', event.target.value ? new Date(event.target.value).toISOString() : '')}
                  />
                </div>
              </>
            )}

            {draft.mode === 'single_reusable_limit' && (
              <div>
                <div className="f-label">Davetçi Başına Maks. Davet Sayısı</div>
                <input
                  className="f-input"
                  type="number"
                  min={1}
                  value={config.max_redemptions_per_referrer !== undefined ? config.max_redemptions_per_referrer : 4}
                  onChange={event => patchConfig('max_redemptions_per_referrer', parseInt(event.target.value, 10) || 4)}
                />
              </div>
            )}

            <div style={{ gridColumn: '1 / -1' }}>
              <div className="f-label">Kimler Davet Edebilir? (Referans Verebilecek Kategoriler)</div>
              <SearchableMultiSelect
                options={categories.map(cat => ({
                  value: cat.id,
                  label: cat.name,
                }))}
                selectedValues={draft.allowedReferrerCategories || []}
                onChange={next => onChange('allowedReferrerCategories', next)}
                placeholder="Tüm müşteriler davet edebilir (Boş bırakın)"
                searchPlaceholder="Kategori ara..."
              />
            </div>

            <div>
              <div className="f-label">Davet Başarı Kriteri</div>
              <select
                className="f-input"
                value={draft.successCriteria}
                onChange={event => {
                  onChange('successCriteria', event.target.value)
                  if (event.target.value === 'registration') {
                    onChange('successPurchaseCount', 1)
                  }
                }}
              >
                <option value="registration">Yeni müşteri kayıt olduğunda</option>
                <option value="nth_purchase">Yeni müşteri kayıt olup N. siparişini tamamladığında</option>
              </select>
            </div>

            {draft.successCriteria === 'nth_purchase' && (
              <div>
                <div className="f-label">Gerekli Sipariş Sayısı (N)</div>
                <input
                  className="f-input"
                  type="number"
                  min={1}
                  value={draft.successPurchaseCount}
                  onChange={event => onChange('successPurchaseCount', Math.max(1, parseInt(event.target.value, 10) || 1))}
                />
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'end', paddingBottom: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.88rem', color: '#334155', fontWeight: 700 }}>
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={event => onChange('active', event.target.checked)}
                />
                Program Aktif
              </label>
            </div>
          </div>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '14px 20px',
          borderTop: '1px solid #e2e8f0',
          background: '#fff',
        }}>
          <div>
            {!isNew && (
              <button
                className="btn-o"
                type="button"
                onClick={onDelete}
                style={{ color: '#b91c1c', borderColor: '#fecaca' }}
              >
                Sil
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-o" type="button" onClick={onClose}>İptal</button>
            <button className="btn-p" type="button" onClick={onSave} disabled={saving || !canWrite}>
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LoyaltyReferralPrograms({ embedMode = false }) {
  const toast = useToast()
  const navigate = useNavigate()
  const workspace = useWorkspace()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [schemaReady, setSchemaReady] = useState(false)
  const [databaseUnavailable, setDatabaseUnavailable] = useState(false)
  const [referralPrograms, setReferralPrograms] = useState([])
  const [customerCategories, setCustomerCategories] = useState([])
  const [workspaceData, setWorkspaceData] = useState(null)
  
  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [draftProgram, setDraftProgram] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        // Load the main workspace to preserve other objects on save
        const result = await loadLoyaltyWorkspace({
          scope: workspace.scope,
          branchId: workspace.branchId,
          branchName: workspace.branchName,
          includeCoupons: false,
        })

        if (cancelled) return

        setWorkspaceData(result)
        setSchemaReady(result.schemaReady)
        setDatabaseUnavailable(Boolean(result.databaseUnavailable))
        setReferralPrograms(result.referralPrograms || [])

        // Load customer categories for allowed categories selection
        const { data: cats, error: catsErr } = await db
          .from('loyalty_customer_categories')
          .select('id,name,active')
          .is('deleted_at', null)
          .order('sort_order')
        
        if (!catsErr && Array.isArray(cats)) {
          setCustomerCategories(cats.filter(c => c.active))
        }
      } catch (error) {
        if (!cancelled) toast(error?.message || 'Referans programları yüklenemedi', 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [toast, workspace.scope, workspace.branchId, workspace.branchName])

  const filteredPrograms = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase()
    return referralPrograms.filter(prog => {
      const matchesStatus = statusFilter === 'all'
        ? true
        : statusFilter === 'active'
          ? prog.active
          : !prog.active

      const matchesSearch = !normalizedSearch
        || String(prog.name || '').toLowerCase().includes(normalizedSearch)

      return matchesStatus && matchesSearch
    })
  }, [referralPrograms, searchText, statusFilter])

  const stats = useMemo(() => ({
    total: referralPrograms.length,
    active: referralPrograms.filter(p => p.active).length,
    passive: referralPrograms.filter(p => !p.active).length,
  }), [referralPrograms])

  const canWrite = schemaReady && !databaseUnavailable

  function openCreateModal() {
    setDraftProgram(normalizeReferralProgram({
      id: createId('refprog'),
      name: '',
      mode: 'unique_multiple',
      configJson: { max_unique_codes: 4 },
      allowedReferrerCategories: [],
      successCriteria: 'registration',
      successPurchaseCount: 1,
      active: true,
    }))
  }

  function openEditModal(program) {
    setDraftProgram(normalizeReferralProgram(program))
  }

  function patchDraft(key, value) {
    setDraftProgram(current => current ? normalizeReferralProgram({ ...current, [key]: value }) : current)
  }

  async function persistPrograms(nextPrograms, successMessage) {
    setSaving(true)
    try {
      const normalized = nextPrograms.map(p => normalizeReferralProgram(p))
      
      const payload = {
        program: workspaceData?.program,
        tiers: workspaceData?.tiers || [],
        campaigns: workspaceData?.campaigns || [],
        couponSeries: workspaceData?.couponSeries || [],
        referralPrograms: normalized,
      }

      const result = await saveLoyaltyWorkspace({
        scope: workspace.scope,
        branchId: workspace.branchId,
        branchName: workspace.branchName,
      }, payload)

      setReferralPrograms(normalized)
      setWorkspaceData(curr => curr ? { ...curr, referralPrograms: normalized } : curr)
      setSchemaReady(result.schemaReady)
      setDatabaseUnavailable(false)
      toast(successMessage, 'success')
      return true
    } catch (error) {
      toast(error?.message || 'Referans programları kaydedilemedi', 'error')
      return false
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveDraft() {
    if (!draftProgram) return
    if (!draftProgram.name.trim()) {
      toast('Program adı zorunlu', 'error')
      return
    }

    const nextPrograms = referralPrograms.some(p => p.id === draftProgram.id)
      ? referralPrograms.map(p => p.id === draftProgram.id ? draftProgram : p)
      : [...referralPrograms, draftProgram]

    const saved = await persistPrograms(nextPrograms, 'Referans programı kaydedildi')
    if (saved) setDraftProgram(null)
  }

  async function handleDeleteProgram(program) {
    const saved = await persistPrograms(
      referralPrograms.filter(item => item.id !== program.id),
      'Referans programı silindi',
    )
    if (saved) {
      setConfirmDelete(null)
      if (draftProgram?.id === program.id) setDraftProgram(null)
    }
  }

  const emptyStateText = loading
    ? 'Yükleniyor...'
    : searchText || statusFilter !== 'all'
      ? 'Filtreye uyan program bulunamadı.'
      : 'Henüz referans programı kaydı yok.'

  return (
    <div>
      {!embedMode ? (
        <Header
          title="Referans Programları"
          subtitle="Müşteri referans programlarını ve davet senaryolarını yönetin."
          actions={(
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn-o" onClick={() => navigate('/sadakat')}>
                <i className="fa-solid fa-arrow-left" style={{ marginRight: 6 }} />
                Kampanyalara Dön
              </button>
              <AddButton onClick={openCreateModal} label="Yeni Referans Programı" disabled={!canWrite} />
            </div>
          )}
        />
      ) : (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <AddButton onClick={openCreateModal} label="Yeni Referans Programı" disabled={!canWrite} />
        </div>
      )}

      <div className="card" style={{ padding: '12px 16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: '.84rem', color: '#475569' }}>
            Referans programları, davet sistemi kurallarını tanımlar ve kampanya koşullarından bağımsız yönetilir.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <StatusChip active={schemaReady && !databaseUnavailable}>
              {schemaReady && !databaseUnavailable ? 'DB Hazır' : 'DATABASE UNAVAILABLE'}
            </StatusChip>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) auto auto', gap: 12, alignItems: 'end' }}>
          <div>
            <div className="f-label">Ara</div>
            <input
              className="f-input"
              value={searchText}
              onChange={event => setSearchText(event.target.value)}
              placeholder="Program adı ara..."
            />
          </div>

          <div style={{ minWidth: 180 }}>
            <div className="f-label">Durum</div>
            <select className="f-input" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
              <option value="all">Tüm Durumlar</option>
              <option value="active">Sadece Aktif</option>
              <option value="passive">Sadece Pasif</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <StatusChip active={statusFilter === 'all'}>Toplam {stats.total}</StatusChip>
            <StatusChip active={true}>Aktif {stats.active}</StatusChip>
            <StatusChip active={false}>Pasif {stats.passive}</StatusChip>
          </div>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 54, textAlign: 'center', color: '#94a3b8' }}>
            <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '1.25rem', display: 'block', marginBottom: 10 }} />
            Programlar yükleniyor...
          </div>
        ) : filteredPrograms.length === 0 ? (
          <div style={{ padding: 54, textAlign: 'center', color: '#94a3b8' }}>
            <i className="fa-solid fa-people-arrows" style={{ fontSize: '1.8rem', display: 'block', marginBottom: 10, color: '#e2e8f0' }} />
            {emptyStateText}
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Program Adı</th>
                <th>Kod Üretim Modu</th>
                <th>Başarı Kriteri</th>
                <th>Kimler Davet Edebilir?</th>
                <th>Durum</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {filteredPrograms.map(prog => {
                let modeText = 'Çoklu Kod'
                if (prog.mode === 'single_reusable_date') modeText = 'Ortak Kod (Tarih Sınırlı)'
                if (prog.mode === 'single_reusable_limit') modeText = 'Ortak Kod (Kullanım Sınırlı)'

                let criteriaText = 'Yeni Müşteri Kaydı'
                if (prog.successCriteria === 'nth_purchase') {
                  criteriaText = `Kayıt + ${prog.successPurchaseCount}. Sipariş`
                }

                const catsList = (prog.allowedReferrerCategories || [])
                  .map(id => customerCategories.find(c => String(c.id) === String(id))?.name)
                  .filter(Boolean)
                  .join(', ')

                return (
                  <tr key={prog.id}>
                    <td style={{ fontWeight: 700, color: '#0f172a' }}>{prog.name || '-'}</td>
                    <td style={{ color: '#475569' }}>{modeText}</td>
                    <td style={{ color: '#475569' }}>{criteriaText}</td>
                    <td style={{ color: '#64748b' }}>{catsList || 'Herkes'}</td>
                    <td>
                      <StatusChip active={prog.active}>{prog.active ? 'Aktif' : 'Pasif'}</StatusChip>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button className="btn-o" type="button" onClick={() => openEditModal(prog)}>
                          Düzenle
                        </button>
                        <button
                          className="btn-o"
                          type="button"
                          onClick={() => setConfirmDelete(prog)}
                          style={{ color: '#b91c1c', borderColor: '#fecaca' }}
                        >
                          Sil
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <ReferralProgramModal
        open={Boolean(draftProgram)}
        draft={draftProgram}
        saving={saving}
        isNew={!referralPrograms.some(p => p.id === draftProgram?.id)}
        onClose={() => setDraftProgram(null)}
        onChange={patchDraft}
        onSave={handleSaveDraft}
        onDelete={() => draftProgram && setConfirmDelete(draftProgram)}
        categories={customerCategories}
        canWrite={canWrite}
      />

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={confirmDelete ? `"${confirmDelete.name || 'Program'}" silinsin mi?` : 'Program silinsin mi?'}
        message="Bu işlem referans programı kaydını listeden kaldırır."
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && handleDeleteProgram(confirmDelete)}
      />
    </div>
  )
}
