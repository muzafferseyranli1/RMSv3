import { useCallback, useEffect, useState } from 'react'
import { db } from '@/lib/db'
import { useToast } from '@/hooks/useToast'
import Header from '@/components/layout/Header'
import Modal from '@/components/ui/Modal'
import AddButton from '@/components/ui/AddButton'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

const EMPTY = {
  name: '',
  icon: '',
  sort_order: 0,
  show_in_kds: true,
  show_in_queue: true,
}

const ICON_MAP = {
  'Hizli Satis': 'fa-bolt',
  Masa: 'fa-chair',
  QR: 'fa-qrcode',
  Kiosk: 'fa-desktop',
  'Suitable Yemek': 'fa-utensils',
  'Yemek Sepeti': 'fa-basket-shopping',
  Getir: 'fa-motorcycle',
  Trendyol: 'fa-bag-shopping',
  Migros: 'fa-cart-shopping',
  'Tikla Gelsin': 'fa-truck-fast',
}

function TogglePill({ checked, onChange, disabled = false }) {
  return (
    <label className="tog" style={{ opacity: disabled ? 0.55 : 1 }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />
      <span className="tog-sl" />
    </label>
  )
}

function getIcon(channel) {
  return channel.icon || ICON_MAP[channel.name] || 'fa-store'
}

export default function SalesChannels() {
  const toast = useToast()
  const [channels, setChannels] = useState([])
  const [loading, setLoading] = useState(true)
  const [showDeleted, setShowDeleted] = useState(false)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState(null)
  const [confirm, setConfirm] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await db.from('sales_channels').select('*').order('sort_order').order('name')
    if (error) {
      toast(error.message, 'error')
      setChannels([])
    } else {
      setChannels(data || [])
    }
    setLoading(false)
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const filtered = channels.filter(channel => !channel.deleted_at || showDeleted)

  function setField(key, value) {
    setForm(current => ({ ...current, [key]: value }))
  }

  function openAdd() {
    setForm(EMPTY)
    setEditId(null)
    setModal(true)
  }

  function openEdit(channel) {
    setForm({
      name: channel.name || '',
      icon: channel.icon || '',
      sort_order: channel.sort_order || 0,
      show_in_kds: channel.show_in_kds !== false,
      show_in_queue: channel.show_in_queue !== false,
    })
    setEditId(channel.id)
    setModal(true)
  }

  function closeModal() {
    setModal(false)
    setForm(EMPTY)
    setEditId(null)
  }

  async function save() {
    if (!form.name.trim()) {
      toast('Kanal adi zorunludur', 'error')
      return
    }

    const payload = {
      name: form.name.trim(),
      icon: form.icon.trim() || null,
      sort_order: parseInt(form.sort_order, 10) || 0,
      show_in_kds: form.show_in_kds !== false,
      show_in_queue: form.show_in_queue !== false,
    }

    if (editId) {
      const { error } = await db.from('sales_channels').update(payload).eq('id', editId)
      if (error) {
        toast(`Hata: ${error.message}`, 'error')
        return
      }
      toast(`"${payload.name}" guncellendi`, 'success')
    } else {
      const { error } = await db.from('sales_channels').insert(payload)
      if (error) {
        toast(`Hata: ${error.message}`, 'error')
        return
      }
      toast(`"${payload.name}" eklendi`, 'success')
    }

    closeModal()
    load()
  }

  async function remove(channel) {
    const { error } = await db.from('sales_channels').update({ deleted_at: new Date().toISOString() }).eq('id', channel.id)
    if (error) toast(`Silinemedi: ${error.message}`, 'error')
    else {
      toast(`"${channel.name}" silindi`, 'info')
      load()
    }
    setConfirm(null)
  }

  async function restoreItem(channel) {
    const { error } = await db.from('sales_channels').update({ deleted_at: null }).eq('id', channel.id)
    if (error) toast(`Geri alinamadi: ${error.message}`, 'error')
    else {
      toast(`"${channel.name}" geri alindi`, 'success')
      load()
    }
  }

  async function patchChannel(channel, patch) {
    const { error } = await db.from('sales_channels').update(patch).eq('id', channel.id)
    if (error) {
      toast(error.message, 'error')
      return
    }
    setChannels(current => current.map(item => (item.id === channel.id ? { ...item, ...patch } : item)))
  }

  return (
    <div className="page-enter">
      <Header
        title="Satis Kanali Yonetimi"
        subtitle="Satis mallarina fiyat tanimlanacak kanallar ve ekran gorunurlukleri."
        actions={(
          <>
            <label
              style={{
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
              }}
            >
              <span onClick={event => event.stopPropagation()}>
                <TogglePill checked={showDeleted} onChange={setShowDeleted} />
              </span>
              Silinmisleri goster
            </label>
            <AddButton onClick={openAdd} label="Kanal Ekle" />
          </>
        )}
      />

      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
            <i className="fa-solid fa-spinner fa-spin" /> Yukleniyor...
          </div>
        ) : (
          <table className="tbl" style={{ tableLayout: 'fixed', width: '100%' }}>
            <colgroup>
              <col style={{ width: '32%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '12%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Satis Kanali</th>
                <th style={{ textAlign: 'center' }}>Sira</th>
                <th style={{ textAlign: 'center' }}>Aktif</th>
                <th style={{ textAlign: 'center' }}>KDS</th>
                <th style={{ textAlign: 'center' }}>Sira Ekrani</th>
                <th style={{ textAlign: 'center' }}>Durum</th>
                <th style={{ textAlign: 'center' }}>Islem</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty">
                      <i className="fa-solid fa-store" />
                      <p>Satis kanali bulunamadi</p>
                    </div>
                  </td>
                </tr>
              ) : filtered.map(channel => (
                <tr key={channel.id} className={channel.deleted_at ? 'deleted' : ''}>
                  <td style={{ textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 10,
                          background: '#f1f5f9',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <i className={`fa-solid ${getIcon(channel)}`} style={{ color: '#6366f1', fontSize: '.9rem' }} />
                      </div>
                      <span className={channel.deleted_at ? 'row-deleted' : ''} style={{ fontWeight: 700, color: '#0f172a' }}>
                        {channel.name}
                      </span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '.82rem', color: '#64748b' }}>{channel.sort_order}</span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {!channel.deleted_at && (
                      <TogglePill checked={channel.active !== false} onChange={value => patchChannel(channel, { active: value })} />
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {!channel.deleted_at && (
                      <TogglePill checked={channel.show_in_kds !== false} onChange={value => patchChannel(channel, { show_in_kds: value })} />
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {!channel.deleted_at && (
                      <TogglePill checked={channel.show_in_queue !== false} onChange={value => patchChannel(channel, { show_in_queue: value })} />
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                      <span className={`badge ${channel.deleted_at ? 'br' : channel.active !== false ? 'bg' : 'bgr'}`}>
                        {channel.deleted_at ? 'Silinmis' : channel.active !== false ? 'Aktif' : 'Pasif'}
                      </span>
                      {!channel.deleted_at && channel.show_in_kds === false && <span className="badge bgr">KDS gizli</span>}
                      {!channel.deleted_at && channel.show_in_queue === false && <span className="badge bgr">Sira gizli</span>}
                    </div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                      {channel.deleted_at ? (
                        <button
                          className="ico-btn"
                          title="Geri Al"
                          onClick={() => restoreItem(channel)}
                          style={{ color: '#16a34a', background: '#d1fae5' }}
                        >
                          <i className="fa-solid fa-rotate-left" />
                        </button>
                      ) : (
                        <>
                          <button className="ico-btn edit" onClick={() => openEdit(channel)}>
                            <i className="fa-solid fa-pen" />
                          </button>
                          <button className="ico-btn del" onClick={() => setConfirm(channel)}>
                            <i className="fa-solid fa-trash" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={modal}
        onClose={closeModal}
        width={460}
        title={editId ? 'Kanal Duzenle' : 'Yeni Satis Kanali'}
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
            <label className="f-label">Kanal Adi <span style={{ color: '#ef4444' }}>*</span></label>
            <input className="f-input" value={form.name} onChange={event => setField('name', event.target.value)} placeholder="Orn. Hizli Satis, QR, Yemek Sepeti" />
          </div>

          <div>
            <label className="f-label">Sira No</label>
            <input className="f-input" type="number" min="0" value={form.sort_order} onChange={event => setField('sort_order', event.target.value)} />
            <p className="f-hint">Kucuk sayi ustte gorunur.</p>
          </div>

          <div>
            <label className="f-label">Ikon <span style={{ fontSize: '.7rem', color: '#94a3b8', fontWeight: 400 }}>(Font Awesome class, opsiyonel)</span></label>
            <input className="f-input" value={form.icon} onChange={event => setField('icon', event.target.value)} placeholder="Orn. fa-bolt" />
            <p className="f-hint">Bos birakilirsa otomatik ikon secilir.</p>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>KDS ekraninda goster</div>
                <div style={{ fontSize: '.8rem', color: '#64748b', marginTop: 4 }}>Bu kanaldan gelen siparisler mutfak ekraninda gorunur.</div>
              </div>
              <TogglePill checked={form.show_in_kds !== false} onChange={value => setField('show_in_kds', value)} />
            </div>

            <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>Sira ekraninda goster</div>
                <div style={{ fontSize: '.8rem', color: '#64748b', marginTop: 4 }}>Bu kanaldan gelen siparisler teslim ve sira ekranlarinda gorunur.</div>
              </div>
              <TogglePill checked={form.show_in_queue !== false} onChange={value => setField('show_in_queue', value)} />
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        title={`"${confirm?.name}" silinsin mi?`}
        onConfirm={() => remove(confirm)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
