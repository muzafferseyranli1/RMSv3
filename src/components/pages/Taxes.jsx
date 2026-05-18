import { useEffect, useState } from 'react'
import { db } from '@/lib/db'
import { useToast } from '@/hooks/useToast'
import Header from '@/components/layout/Header'
import Modal from '@/components/ui/Modal'
import AddButton from '@/components/ui/AddButton'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

const EMPTY = { name: '', rate: '' }

export default function Taxes() {
  const toast = useToast()
  const [taxes, setTaxes] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [confirm, setConfirm] = useState(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await db.from('taxes').select('*').order('rate')
    if (error) toast('Yuklenemedi: ' + error.message, 'error')
    else setTaxes(data || [])
    setLoading(false)
  }

  function openAdd() {
    setForm(EMPTY)
    setEditId(null)
    setModal(true)
  }

  function openEdit(tax) {
    setForm({ name: tax.name, rate: tax.rate })
    setEditId(tax.id)
    setModal(true)
  }

  function closeModal() {
    setModal(false)
    setForm(EMPTY)
    setEditId(null)
  }

  async function save() {
    if (!form.name.trim()) {
      toast('Vergi adi zorunludur', 'error')
      return
    }
    if (form.rate === '' || Number.isNaN(parseFloat(form.rate))) {
      toast('Oran zorunludur', 'error')
      return
    }

    const payload = { name: form.name.trim(), rate: parseFloat(form.rate) }

    if (editId) {
      const { error } = await db.from('taxes').update(payload).eq('id', editId)
      if (error) {
        toast('Hata: ' + error.message, 'error')
        return
      }
      toast(`"${payload.name}" guncellendi`, 'success')
    } else {
      const { error } = await db.from('taxes').insert(payload)
      if (error) {
        toast('Hata: ' + error.message, 'error')
        return
      }
      toast(`"${payload.name}" eklendi`, 'success')
    }

    closeModal()
    load()
  }

  async function remove(tax) {
    const { error } = await db.from('taxes').delete().eq('id', tax.id)
    if (error) toast('Silinemedi: ' + error.message, 'error')
    else {
      toast(`"${tax.name}" silindi`, 'info')
      load()
    }
    setConfirm(null)
  }

  const activeTaxes = taxes.filter(tax => !tax.deleted_at)
  const set = (key, nextValue) => setForm(current => ({ ...current, [key]: nextValue }))

  return (
    <div className="page-enter">
      <Header
        title="Vergi Tanimlari"
        subtitle={`${activeTaxes.length} vergi orani`}
        actions={(
          <AddButton onClick={openAdd} label="Vergi Ekle" />
        )}
      />

      <div
        style={{
          background: '#fffaf0',
          border: '1px solid #fde68a',
          borderRadius: 12,
          padding: '14px 18px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            background: '#f59e0b',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <i className="fa-solid fa-percent" style={{ color: '#fff', fontSize: '.85rem' }} />
        </div>
        <div>
          <div style={{ fontWeight: 700, color: '#92400e', fontSize: '.9rem' }}>Vergi oranlari</div>
          <div style={{ fontSize: '.78rem', color: '#7c5a10' }}>
            Buradaki oranlar urun ve stok mali formlarinda secilebilir hale gelir.
          </div>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
            <i className="fa-solid fa-spinner fa-spin" /> Yukleniyor...
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Vergi Adi</th>
                <th style={{ width: 180, textAlign: 'right' }}>Oran</th>
                <th style={{ width: 120, textAlign: 'center' }}>Islem</th>
              </tr>
            </thead>
            <tbody>
              {activeTaxes.length === 0 ? (
                <tr>
                  <td colSpan={3}>
                    <div className="empty">
                      <i className="fa-solid fa-percent" />
                      <p>Henuz vergi tanimi yok</p>
                    </div>
                  </td>
                </tr>
              ) : (
                activeTaxes.map(tax => (
                  <tr key={tax.id}>
                    <td style={{ fontWeight: 700, color: '#0f172a' }}>{tax.name}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '1rem', fontWeight: 800, color: '#b45309' }}>
                        %{parseFloat(tax.rate).toFixed(1)}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: 3 }}>
                        <button className="ico-btn edit" onClick={() => openEdit(tax)}>
                          <i className="fa-solid fa-pen" />
                        </button>
                        <button className="ico-btn del" onClick={() => setConfirm(tax)}>
                          <i className="fa-solid fa-trash" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={modal}
        onClose={closeModal}
        width={400}
        title={editId ? 'Vergi Duzenle' : 'Yeni Vergi Ekle'}
        footer={(
          <>
            <button className="btn-g" onClick={closeModal}>Iptal</button>
            <button className="btn-p" onClick={save}>
              <i className="fa-solid fa-check" /> Kaydet
            </button>
          </>
        )}
      >
        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <label className="f-label">Vergi Adi <span style={{ color: '#ef4444' }}>*</span></label>
            <input
              className="f-input"
              value={form.name}
              onChange={event => set('name', event.target.value)}
              placeholder="or. KDV %10, KDV %20, OTV"
            />
          </div>
          <div>
            <label className="f-label">KDV Orani (%) <span style={{ color: '#ef4444' }}>*</span></label>
            <div style={{ position: 'relative' }}>
              <input
                className="f-input"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={form.rate}
                onChange={event => set('rate', event.target.value)}
                placeholder="or. 10"
                style={{ paddingRight: 36 }}
              />
              <span
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#94a3b8',
                  fontSize: '.85rem',
                  fontWeight: 700,
                }}
              >
                %
              </span>
            </div>
          </div>
          {form.rate !== '' && !Number.isNaN(parseFloat(form.rate)) && (
            <div
              style={{
                padding: '11px 14px',
                borderRadius: 10,
                background: '#fff7ed',
                border: '1.5px solid #fdba74',
                fontSize: '.83rem',
                color: '#9a3412',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <i className="fa-solid fa-percent" />
              {form.name || 'Bu vergi'} {'->'} <strong>%{parseFloat(form.rate).toFixed(1)}</strong> oraninda uygulanacak
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        title={`"${confirm?.name}" silinsin mi?`}
        desc="Bu vergi orani kullaniliyorsa silme islemi veritabani tarafinda engellenebilir."
        onConfirm={() => remove(confirm)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
