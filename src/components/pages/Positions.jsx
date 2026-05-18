import { useCallback, useEffect, useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useToast } from '@/hooks/useToast'
import AddButton from '@/components/ui/AddButton'
import {
  CONTRACT_TYPES,
  PERSONNEL_SETTINGS_KEYS,
  createEmptyPosition,
  createUid,
  formatAmount,
  normalizePositionRecord,
  readSettingArray,
  writeSettingArray,
} from '@/lib/personnelConfig'

function PositionContractCard({ contractType, value, onChange }) {
  const enabled = !!value.enabled

  return (
    <div style={{
      border: `1px solid ${enabled ? '#fcd34d' : '#e2e8f0'}`,
      borderRadius: 14,
      padding: 14,
      background: enabled ? '#fffbeb' : '#fff',
    }}>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={event => onChange({
            ...value,
            enabled: event.target.checked,
            amount: event.target.checked ? value.amount : '',
          })}
          style={{ marginTop: 3 }}
        />
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontWeight: 800, color: '#0f172a' }}>{contractType.label}</span>
          <span style={{ display: 'block', marginTop: 4, fontSize: '.78rem', color: '#64748b', lineHeight: 1.45 }}>
            {contractType.description}
          </span>
        </span>
      </label>

      <div style={{ marginTop: 12 }}>
        <label className="f-label">Ücret</label>
        <input
          className="f-input"
          type="number"
          min="0"
          step="0.01"
          value={value.amount}
          disabled={!enabled}
          onChange={event => onChange({ ...value, amount: event.target.value })}
          placeholder="Örn. 55432"
        />
      </div>
    </div>
  )
}

export default function Positions() {
  const toast = useToast()
  const [positions, setPositions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showDeleted, setShowDeleted] = useState(false)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(createEmptyPosition())
  const [editId, setEditId] = useState(null)
  const [confirm, setConfirm] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await readSettingArray(PERSONNEL_SETTINGS_KEYS.positions, normalizePositionRecord)
      setPositions(data)
    } catch (error) {
      toast('Pozisyonlar yüklenemedi: ' + error.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const visiblePositions = useMemo(() => (
    positions
      .filter(position => showDeleted || !position.deletedAt)
      .filter(position => {
        if (!search.trim()) return true
        const query = search.toLowerCase()
        return position.name.toLowerCase().includes(query) || position.shortCode.toLowerCase().includes(query)
      })
      .sort((first, second) => first.name.localeCompare(second.name, 'tr'))
  ), [positions, search, showDeleted])

  const activeCount = positions.filter(position => !position.deletedAt).length

  function openCreate() {
    setForm(createEmptyPosition())
    setEditId(null)
    setModalOpen(true)
  }

  function openEdit(position) {
    setForm(normalizePositionRecord(position))
    setEditId(position.id)
    setModalOpen(true)
  }

  function closeModal() {
    setForm(createEmptyPosition())
    setEditId(null)
    setModalOpen(false)
  }

  function setField(key, value) {
    setForm(current => ({ ...current, [key]: value }))
  }

  function setContractField(contractKey, value) {
    setForm(current => ({
      ...current,
      contractTerms: {
        ...current.contractTerms,
        [contractKey]: value,
      },
    }))
  }

  async function persist(nextPositions, successMessage, successType = 'success') {
    await writeSettingArray(PERSONNEL_SETTINGS_KEYS.positions, nextPositions)
    setPositions(nextPositions.map(position => normalizePositionRecord(position)))
    toast(successMessage, successType)
  }

  async function save() {
    if (!form.name.trim()) {
      toast('Pozisyon adı zorunludur', 'error')
      return
    }

    if (!form.shortCode.trim()) {
      toast('Kısa kod zorunludur', 'error')
      return
    }

    const enabledContractCount = CONTRACT_TYPES.filter(contractType => form.contractTerms?.[contractType.key]?.enabled).length
    if (!enabledContractCount) {
      toast('En az bir sözleşme tipi aktif olmalıdır', 'error')
      return
    }

    const normalizedCode = form.shortCode.trim().toUpperCase()
    const duplicate = positions.find(position =>
      position.id !== editId &&
      !position.deletedAt &&
      position.shortCode.toUpperCase() === normalizedCode,
    )
    if (duplicate) {
      toast(`"${normalizedCode}" kısa kodu zaten kullanılıyor`, 'error')
      return
    }

    const timestamp = new Date().toISOString()
    const payload = normalizePositionRecord({
      ...form,
      id: editId || createUid('pos_'),
      name: form.name.trim(),
      shortCode: normalizedCode,
      lateToleranceMinutes: Number(form.lateToleranceMinutes) || 0,
      contractTerms: Object.fromEntries(CONTRACT_TYPES.map(contractType => [
        contractType.key,
        {
          enabled: !!form.contractTerms?.[contractType.key]?.enabled,
          amount: form.contractTerms?.[contractType.key]?.enabled
            ? form.contractTerms?.[contractType.key]?.amount
            : '',
        },
      ])),
      notes: form.notes.trim(),
      createdAt: editId ? form.createdAt : timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    })

    const nextPositions = editId
      ? positions.map(position => position.id === editId ? payload : position)
      : [...positions, payload]

    try {
      await persist(nextPositions, editId ? 'Pozisyon güncellendi' : 'Pozisyon eklendi')
      closeModal()
    } catch (error) {
      toast('Kaydedilemedi: ' + error.message, 'error')
    }
  }

  async function archivePosition(position) {
    try {
      const nextPositions = positions.map(item => (
        item.id === position.id
          ? { ...item, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
          : item
      ))
      await persist(nextPositions, `"${position.name}" pasife alındı`, 'info')
    } catch (error) {
      toast('Pozisyon pasife alınamadı: ' + error.message, 'error')
    } finally {
      setConfirm(null)
    }
  }

  async function restorePosition(position) {
    try {
      const nextPositions = positions.map(item => (
        item.id === position.id
          ? { ...item, deletedAt: null, updatedAt: new Date().toISOString() }
          : item
      ))
      await persist(nextPositions, `"${position.name}" yeniden aktif edildi`)
    } catch (error) {
      toast('Pozisyon geri alınamadı: ' + error.message, 'error')
    }
  }

  return (
    <div className="page-enter">
      <Header
        title="Pozisyonlar"
        subtitle={`${activeCount} aktif pozisyon tanımı`}
        actions={<>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
            fontSize: '.83rem',
            fontWeight: 600,
            color: showDeleted ? '#dc2626' : '#64748b',
            background: showDeleted ? '#fee2e2' : '#f1f5f9',
            padding: '7px 14px',
            borderRadius: 10,
            userSelect: 'none',
          }}>
            <label className="tog" onClick={event => event.stopPropagation()}>
              <input type="checkbox" checked={showDeleted} onChange={event => setShowDeleted(event.target.checked)} />
              <span className="tog-sl" />
            </label>
            Pasifleri göster
          </label>
          <AddButton onClick={openCreate} label="Pozisyon Ekle" />
        </>}
      />

      <div style={{
        background: '#eff6ff',
        border: '1px solid #bfdbfe',
        borderRadius: 14,
        padding: '14px 16px',
        marginBottom: 16,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
      }}>
        <div style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          background: '#dbeafe',
          color: '#1d4ed8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <i className="fa-solid fa-briefcase" />
        </div>
        <div>
          <div style={{ fontWeight: 800, color: '#0f172a' }}>Personel kartları bu tanımları baz alır</div>
          <div style={{ marginTop: 4, fontSize: '.82rem', color: '#475569', lineHeight: 1.5 }}>
            Excel’deki örneğe uygun olarak kısa kod, sözleşme tipi bazlı ücretler ve geç giriş toleransı burada tanımlanır.
            Personel kartında seçilen pozisyonun ücreti otomatik önerilir, gerekirse kişi bazında değiştirilebilir.
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ position: 'relative' }}>
          <i className="fa-solid fa-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '.75rem' }} />
          <input
            className="f-input"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Pozisyon adı veya kısa kod ara..."
            style={{ paddingLeft: 30 }}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 42, textAlign: 'center', color: '#94a3b8' }}>
          <i className="fa-solid fa-spinner fa-spin" />
          <span style={{ marginLeft: 8 }}>Yükleniyor...</span>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Pozisyon</th>
                <th>Kısa Kod</th>
                <th>Sözleşme Tipleri</th>
                <th>Geç Giriş</th>
                <th>Durum</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {visiblePositions.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty">
                      <i className="fa-solid fa-briefcase" />
                      <p>Pozisyon bulunamadı</p>
                    </div>
                  </td>
                </tr>
              )}

              {visiblePositions.map(position => {
                const enabledContracts = CONTRACT_TYPES.filter(contractType => position.contractTerms?.[contractType.key]?.enabled)
                return (
                  <tr key={position.id} className={position.deletedAt ? 'deleted' : ''}>
                    <td>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{position.name}</div>
                      {position.notes && (
                        <div style={{ marginTop: 4, fontSize: '.74rem', color: '#64748b', lineHeight: 1.45 }}>
                          {position.notes}
                        </div>
                      )}
                    </td>
                    <td>
                      <span style={{
                        fontFamily: 'monospace',
                        fontSize: '.82rem',
                        fontWeight: 700,
                        color: '#475569',
                        background: '#f1f5f9',
                        padding: '2px 8px',
                        borderRadius: 6,
                      }}>
                        {position.shortCode}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {enabledContracts.map(contractType => (
                          <span key={contractType.key} className="badge bb">
                            {contractType.label}: {formatAmount(position.contractTerms?.[contractType.key]?.amount)}
                          </span>
                        ))}
                        {enabledContracts.length === 0 && <span style={{ color: '#cbd5e1' }}>—</span>}
                      </div>
                    </td>
                    <td>{position.lateToleranceMinutes} dk</td>
                    <td>
                      <span className={`badge ${position.deletedAt ? 'br' : 'bg'}`}>
                        <i className={`fa-solid ${position.deletedAt ? 'fa-ban' : 'fa-check'}`} style={{ fontSize: '.65rem' }} />
                        {position.deletedAt ? 'Pasif' : 'Aktif'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {position.deletedAt ? (
                          <button className="ico-btn" title="Geri Al" onClick={() => restorePosition(position)} style={{ color: '#16a34a', background: '#d1fae5' }}>
                            <i className="fa-solid fa-rotate-left" />
                          </button>
                        ) : (
                          <>
                            <button className="ico-btn edit" title="Düzenle" onClick={() => openEdit(position)}>
                              <i className="fa-solid fa-pen" />
                            </button>
                            <button className="ico-btn del" title="Pasife Al" onClick={() => setConfirm(position)}>
                              <i className="fa-solid fa-trash" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        width={720}
        title={editId ? 'Pozisyonu Düzenle' : 'Yeni Pozisyon'}
        subtitle="Pozisyonun sözleşme tipi varsayımları personel kartına taşınır."
        footer={<>
          <button className="btn-g" onClick={closeModal}>İptal</button>
          <button className="btn-p" onClick={save}>
            <i className="fa-solid fa-check" />
            Kaydet
          </button>
        </>}
      >
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 180px', gap: 14 }}>
            <div>
              <label className="f-label">Pozisyon Adı <span style={{ color: '#ef4444' }}>*</span></label>
              <input
                className="f-input"
                value={form.name}
                onChange={event => setField('name', event.target.value)}
                placeholder="Örn. Garson, Şube Müdürü, Kasiyer"
              />
            </div>
            <div>
              <label className="f-label">Kısa Kodu <span style={{ color: '#ef4444' }}>*</span></label>
              <input
                className="f-input"
                value={form.shortCode}
                onChange={event => setField('shortCode', event.target.value.toUpperCase())}
                placeholder="Örn. GR"
                style={{ textTransform: 'uppercase', fontFamily: 'monospace' }}
              />
            </div>
          </div>

          <div>
            <label className="f-label">Sözleşme Tipleri ve Ücret Varsayımları</label>
            <div style={{ display: 'grid', gap: 12 }}>
              {CONTRACT_TYPES.map(contractType => (
                <PositionContractCard
                  key={contractType.key}
                  contractType={contractType}
                  value={form.contractTerms?.[contractType.key] || { enabled: false, amount: '' }}
                  onChange={value => setContractField(contractType.key, value)}
                />
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr)', gap: 14 }}>
            <div>
              <label className="f-label">İzin Verilen Geç Giriş Süresi (dk)</label>
              <input
                className="f-input"
                type="number"
                min="0"
                step="1"
                value={form.lateToleranceMinutes}
                onChange={event => setField('lateToleranceMinutes', event.target.value)}
              />
            </div>
            <div>
              <label className="f-label">Açıklama</label>
              <textarea
                className="f-input"
                value={form.notes}
                onChange={event => setField('notes', event.target.value)}
                rows={3}
                placeholder="Pozisyonla ilgili kısa bir not ekleyebilirsiniz."
                style={{ resize: 'vertical', minHeight: 88 }}
              />
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        title={`"${confirm?.name}" pozisyonu pasife alınsın mı?`}
        desc="Pozisyon pasife alınır; daha önce tanımlanmış personel kayıtları korunur."
        onConfirm={() => archivePosition(confirm)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
