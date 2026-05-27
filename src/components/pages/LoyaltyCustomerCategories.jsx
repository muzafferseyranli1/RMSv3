import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '@/components/layout/Header'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useWorkspace } from '@/context/WorkspaceContext'
import AddButton from '@/components/ui/AddButton'
import { useToast } from '@/hooks/useToast'
import {
  loadLoyaltyCustomerCategories,
  normalizeCustomerCategory,
  saveLoyaltyCustomerCategories,
} from '@/lib/loyalty'

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

function createDraft(category = null, index = 0) {
  return normalizeCustomerCategory(category || {
    id: createId('customer-category'),
    name: '',
    code: `KATEGORI-${index + 1}`,
    description: '',
    color: '#f59e0b',
    active: true,
    sortOrder: (index + 1) * 10,
  }, index)
}

function buildDescriptionSummary(value) {
  const text = String(value || '').trim().replace(/\s+/g, ' ')
  if (!text) return 'Aciklama yok'
  return text.length > 72 ? `${text.slice(0, 69)}...` : text
}

function downloadCategoriesCsv(rows = []) {
  const header = ['Kategori Adi', 'Kod', 'Aciklama', 'Renk', 'Durum', 'Sira']
  const lines = rows.map(category => ([
    category.name || '',
    category.code || '',
    String(category.description || '').replace(/\r?\n/g, ' '),
    category.color || '',
    category.active ? 'Aktif' : 'Pasif',
    category.sortOrder ?? '',
  ]))

  const csv = [header, ...lines]
    .map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';'))
    .join('\n')

  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'musteri-kategorileri.csv'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
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

function CategoryModal({ open, draft, saving, isNew, onClose, onChange, onSave, onDelete, canWrite }) {
  if (!open || !draft) return null

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
              {isNew ? 'Yeni Musteri Kategorisi' : 'Kategori Detayi'}
            </div>
            <div style={{ marginTop: 4, fontSize: '.84rem', color: '#64748b' }}>
              Kategori adini, kodunu, durumunu ve gorunum sirasini buradan yonetin.
            </div>
          </div>
          <button className="btn-o" type="button" onClick={onClose}>Kapat</button>
        </div>

        <div style={{ padding: 20, overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <div>
              <div className="f-label">Kategori Adi</div>
              <input
                className="f-input"
                value={draft.name}
                onChange={event => onChange('name', event.target.value)}
                placeholder="Kategori adi"
                disabled={draft.id === 'feedback_source'}
              />
            </div>

            <div>
              <div className="f-label">Kod</div>
              <input
                className="f-input"
                value={draft.code}
                onChange={event => onChange('code', event.target.value)}
                placeholder="Kod"
                disabled={draft.id === 'feedback_source'}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <div className="f-label">Aciklama</div>
              <textarea
                className="f-input"
                rows={4}
                value={draft.description}
                onChange={event => onChange('description', event.target.value)}
                placeholder="Kategori kullanim amacini veya segment aciklamasini yazin"
              />
            </div>

            <div>
              <div className="f-label">Renk</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 56px', gap: 10 }}>
                <input
                  className="f-input"
                  value={draft.color}
                  onChange={event => onChange('color', event.target.value)}
                  placeholder="#f59e0b"
                />
                <input
                  className="f-input"
                  type="color"
                  value={draft.color || '#f59e0b'}
                  onChange={event => onChange('color', event.target.value)}
                  style={{ padding: 6, minHeight: 42 }}
                />
              </div>
            </div>

            <div>
              <div className="f-label">Sira</div>
              <input
                className="f-input"
                type="number"
                min={0}
                value={draft.sortOrder}
                onChange={event => onChange('sortOrder', event.target.value)}
                placeholder="10"
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'end' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.88rem', color: '#334155', fontWeight: 700 }}>
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={event => onChange('active', event.target.checked)}
                />
                Aktif
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
            {!isNew && draft.id !== 'feedback_source' && (
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
            <button className="btn-o" type="button" onClick={onClose}>Iptal</button>
            <button className="btn-p" type="button" onClick={onSave} disabled={saving || !canWrite}>
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LoyaltyCustomerCategories() {
  const toast = useToast()
  const navigate = useNavigate()
  const workspace = useWorkspace()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [schemaReady, setSchemaReady] = useState(false)
  const [databaseUnavailable, setDatabaseUnavailable] = useState(false)
  const [categories, setCategories] = useState([])
  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [draftCategory, setDraftCategory] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const result = await loadLoyaltyCustomerCategories({
          scope: workspace.scope,
          branchId: workspace.branchId,
          branchName: workspace.branchName,
        })

        if (cancelled) return

        setSchemaReady(result.schemaReady)
        setDatabaseUnavailable(Boolean(result.databaseUnavailable))
        const loadedList = (result.categories || []).map(normalizeCustomerCategory)
        const hasFeedbackSource = loadedList.some(c => c.id === 'feedback_source')
        if (!hasFeedbackSource) {
          loadedList.push(normalizeCustomerCategory({
            id: 'feedback_source',
            name: 'Geri Bildirimden Gelen',
            code: 'FEEDBACK_SOURCE',
            description: 'Geri bildirim (destek/şikayet) oluşturulurken otomatik kaydedilen müşteriler.',
            color: '#ef4444',
            active: true,
            sortOrder: 0
          }))
        }
        setCategories(loadedList)
      } catch (error) {
        if (!cancelled) toast(error?.message || 'Musteri kategorileri yuklenemedi', 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [toast, workspace.scope, workspace.branchId, workspace.branchName])

  const filteredCategories = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase()
    return categories.filter(category => {
      const matchesStatus = statusFilter === 'all'
        ? true
        : statusFilter === 'active'
          ? category.active
          : !category.active

      const matchesSearch = !normalizedSearch
        || String(category.name || '').toLowerCase().includes(normalizedSearch)
        || String(category.code || '').toLowerCase().includes(normalizedSearch)
        || String(category.description || '').toLowerCase().includes(normalizedSearch)

      return matchesStatus && matchesSearch
    })
  }, [categories, searchText, statusFilter])

  const stats = useMemo(() => ({
    total: categories.length,
    active: categories.filter(category => category.active).length,
    passive: categories.filter(category => !category.active).length,
  }), [categories])

  const canWrite = schemaReady && !databaseUnavailable

  function openCreateModal() {
    setDraftCategory(createDraft(null, categories.length))
  }

  function openEditModal(category) {
    setDraftCategory(createDraft(category))
  }

  function patchDraft(key, value) {
    setDraftCategory(current => current ? normalizeCustomerCategory({ ...current, [key]: value }) : current)
  }

  async function persistCategories(nextCategories, successMessage) {
    setSaving(true)
    try {
      const normalized = nextCategories.map((category, index) => normalizeCustomerCategory(category, index))
      const result = await saveLoyaltyCustomerCategories({
        scope: workspace.scope,
        branchId: workspace.branchId,
        branchName: workspace.branchName,
      }, normalized)

      setCategories(normalized)
      setSchemaReady(result.schemaReady)
      setDatabaseUnavailable(false)
      toast(successMessage, 'success')
      return true
    } catch (error) {
      toast(error?.message || 'Musteri kategorileri kaydedilemedi', 'error')
      return false
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveDraft() {
    if (!draftCategory) return
    if (!draftCategory.name.trim()) {
      toast('Kategori adi zorunlu', 'error')
      return
    }
    if (!draftCategory.code.trim()) {
      toast('Kod zorunlu', 'error')
      return
    }

    const nextCategories = categories.some(category => category.id === draftCategory.id)
      ? categories.map(category => category.id === draftCategory.id ? draftCategory : category)
      : [...categories, draftCategory]

    const saved = await persistCategories(nextCategories, 'Musteri kategorisi kaydedildi')
    if (saved) setDraftCategory(null)
  }

  async function handleDeleteCategory(category) {
    if (category.id === 'feedback_source') {
      toast('Sistem kategorisi silinemez', 'error')
      setConfirmDelete(null)
      return
    }
    const saved = await persistCategories(
      categories.filter(item => item.id !== category.id),
      'Musteri kategorisi silindi',
    )
    if (saved) {
      setConfirmDelete(null)
      if (draftCategory?.id === category.id) setDraftCategory(null)
    }
  }

  function handleExport() {
    if (filteredCategories.length === 0) {
      toast('Export edilecek kategori yok', 'info')
      return
    }
    downloadCategoriesCsv(filteredCategories)
    toast('Kategori listesi export edildi', 'success')
  }

  const emptyStateText = loading
    ? 'Yukleniyor...'
    : searchText || statusFilter !== 'all'
      ? 'Filtreye uyan kategori bulunamadi.'
      : 'Henuz kategori kaydi yok.'

  return (
    <div>
      <Header
        title="Musteri Kategorileri"
        subtitle="Sadakat kampanyalarinda kullanilan musteri segmentlerini listeleyin, filtreleyin ve yonetin."
        actions={(
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-o" onClick={() => navigate('/sadakat')}>
              <i className="fa-solid fa-arrow-left" style={{ marginRight: 6 }} />
              Kampanyalara Don
            </button>
            <button className="btn-o" onClick={handleExport}>
              <i className="fa-solid fa-file-export" style={{ marginRight: 6 }} />
              Export
            </button>
            <AddButton onClick={openCreateModal} label="Yeni Kategori" disabled={!canWrite} />
          </div>
        )}
      />

      <div className="card" style={{ padding: '12px 16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: '.84rem', color: '#475569' }}>
            Musteri kategorileri burada canli verilerle yonetilir.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <StatusChip active={schemaReady && !databaseUnavailable}>
              {schemaReady && !databaseUnavailable ? 'DB hazir' : 'DATABASE UNAVAILABLE'}
            </StatusChip>
            <span style={{ fontSize: '.78rem', color: '#64748b' }}>
              {databaseUnavailable
                ? 'Veri okunamazsa kayit islemi gecici olarak kapatilir.'
                : 'Kategori degisiklikleri secili kapsam icin kaydedilir.'}
            </span>
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
              placeholder="Kategori adi, kod veya aciklama ara"
            />
          </div>

          <div style={{ minWidth: 180 }}>
            <div className="f-label">Durum</div>
            <select className="f-input" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
              <option value="all">Tum Durumlar</option>
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
        {databaseUnavailable && (
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #fed7aa', background: '#fff7ed', color: '#9a3412', fontSize: '.82rem', lineHeight: 1.6 }}>
            Musteri kategorileri production is verisidir. Tablo okunamiyorsa liste sadece gorunur hata durumunda kalir; `settings` veya lokal fallback kullanilmaz.
          </div>
        )}

        {loading ? (
          <div style={{ padding: 54, textAlign: 'center', color: '#94a3b8' }}>
            <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '1.25rem', display: 'block', marginBottom: 10 }} />
            Kategoriler yukleniyor...
          </div>
        ) : filteredCategories.length === 0 ? (
          <div style={{ padding: 54, textAlign: 'center', color: '#94a3b8' }}>
            <i className="fa-solid fa-tags" style={{ fontSize: '1.8rem', display: 'block', marginBottom: 10, color: '#e2e8f0' }} />
            {emptyStateText}
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Kategori Adi</th>
                <th>Kod</th>
                <th>Aciklama</th>
                <th>Renk</th>
                <th>Durum</th>
                <th>Sira</th>
                <th>Islem</th>
              </tr>
            </thead>
            <tbody>
              {filteredCategories.map(category => (
                <tr key={category.id}>
                  <td style={{ fontWeight: 700, color: '#0f172a' }}>{category.name || '-'}</td>
                  <td style={{ color: '#475569', fontWeight: 700 }}>{category.code || '-'}</td>
                  <td style={{ color: '#64748b', maxWidth: 320 }}>{buildDescriptionSummary(category.description)}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        width: 16,
                        height: 16,
                        borderRadius: 999,
                        border: '1px solid #cbd5e1',
                        background: category.color || '#f59e0b',
                        flexShrink: 0,
                      }} />
                      <span style={{ color: '#64748b', fontSize: '.8rem' }}>{category.color || '-'}</span>
                    </div>
                  </td>
                  <td>
                    <StatusChip active={category.active}>{category.active ? 'Aktif' : 'Pasif'}</StatusChip>
                  </td>
                  <td style={{ color: '#475569', fontWeight: 700 }}>{category.sortOrder}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="btn-o" type="button" onClick={() => openEditModal(category)}>
                        Duzenle
                      </button>
                      {category.id !== 'feedback_source' && (
                        <button
                          className="btn-o"
                          type="button"
                          onClick={() => setConfirmDelete(category)}
                          style={{ color: '#b91c1c', borderColor: '#fecaca' }}
                        >
                          Sil
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CategoryModal
        open={Boolean(draftCategory)}
        draft={draftCategory}
        saving={saving}
        isNew={!categories.some(category => category.id === draftCategory?.id)}
        onClose={() => setDraftCategory(null)}
        onChange={patchDraft}
        onSave={handleSaveDraft}
        onDelete={() => draftCategory && setConfirmDelete(draftCategory)}
        canWrite={canWrite}
      />

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={confirmDelete ? `"${confirmDelete.name || 'Kategori'}" silinsin mi?` : 'Kategori silinsin mi?'}
        message="Bu islem kategori kaydini listeden kaldirir."
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && handleDeleteCategory(confirmDelete)}
      />
    </div>
  )
}
