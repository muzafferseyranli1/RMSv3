import React, { useState, useEffect, useCallback } from 'react'
import { fetchTicketCategories, createTicketCategory, updateTicketCategory, deleteTicketCategory } from '@/lib/feedbackService'
import { useToast } from '@/hooks/useToast'

const COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#10b981', '#f472b6', '#64748b', '#22d3ee', '#e11d48', '#6366f1']

export default function TicketCategories() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ name: '', slug: '', icon: 'fa-tag', color: '#64748b' })
  const toast = useToast()

  const loadCategories = useCallback(async () => {
    setLoading(true)
    const { data, error } = await fetchTicketCategories({ activeOnly: false })
    if (error) toast('Kategoriler yüklenemedi', 'error')
    else setCategories(data || [])
    setLoading(false)
  }, [toast])

  useEffect(() => { loadCategories() }, [loadCategories])

  const handleSave = async () => {
    if (!form.name.trim()) return toast('Kategori adı gerekli', 'warning')
    const slug = form.slug || form.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '')
    if (editingId) {
      const { error } = await updateTicketCategory(editingId, { ...form, slug })
      if (error) return toast('Güncelleme başarısız', 'error')
      toast('Kategori güncellendi', 'success')
    } else {
      const { error } = await createTicketCategory({ ...form, slug, sortOrder: categories.length })
      if (error) return toast('Oluşturma başarısız', 'error')
      toast('Kategori oluşturuldu', 'success')
    }
    setEditingId(null)
    setShowNew(false)
    setForm({ name: '', slug: '', icon: 'fa-tag', color: '#64748b' })
    loadCategories()
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Bu kategoriyi pasif yapmak istediğinize emin misiniz?')) return
    const { error } = await deleteTicketCategory(id)
    if (error) return toast('Silme başarısız', 'error')
    toast('Kategori pasif yapıldı', 'success')
    loadCategories()
  }

  const startEdit = (cat) => {
    setEditingId(cat.id)
    setForm({ name: cat.name, slug: cat.slug, icon: cat.icon || 'fa-tag', color: cat.color || '#64748b' })
    setShowNew(false)
  }

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(239,68,68,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="fa-solid fa-tags" style={{ color: '#ef4444', fontSize: '1rem' }} />
            </span>
            Geribildirim Kategorileri
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '.82rem', color: 'var(--text-muted)' }}>Şikayet ve denetim geribildirimleri için kullanılan kategorileri yönetin.</p>
        </div>
        <button
          className="btn-p"
          onClick={() => { setShowNew(true); setEditingId(null); setForm({ name: '', slug: '', icon: 'fa-tag', color: '#64748b' }) }}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <i className="fa-solid fa-plus" /> Yeni Kategori
        </button>
      </div>

      {/* New / Edit Form */}
      {(showNew || editingId) && (
        <div className="card" style={{ padding: 20, marginBottom: 16, borderLeft: '4px solid #6366f1' }}>
          <div style={{ fontWeight: 700, fontSize: '.85rem', marginBottom: 12, color: 'var(--text-strong)' }}>
            {editingId ? 'Kategori Düzenle' : 'Yeni Kategori'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="f-label">Ad</label>
              <input
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Örn: Yemek Kalitesi"
                className="f-input"
              />
            </div>
            <div>
              <label className="f-label">Slug</label>
              <input
                value={form.slug}
                onChange={e => setForm(p => ({ ...p, slug: e.target.value }))}
                placeholder="Otomatik oluşturulur"
                className="f-input"
              />
            </div>
            <div>
              <label className="f-label">Renk</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm(p => ({ ...p, color: c }))}
                    style={{
                      width: 28, height: 28, borderRadius: 8, border: form.color === c ? '2px solid #fff' : '2px solid transparent',
                      background: c, cursor: 'pointer', transition: 'transform .15s',
                      transform: form.color === c ? 'scale(1.15)' : 'scale(1)',
                    }}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="f-label">İkon (FontAwesome)</label>
              <input
                value={form.icon}
                onChange={e => setForm(p => ({ ...p, icon: e.target.value }))}
                placeholder="fa-tag"
                className="f-input"
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
            <button className="btn-o" onClick={() => { setShowNew(false); setEditingId(null) }}>İptal</button>
            <button className="btn-p" onClick={handleSave}>{editingId ? 'Güncelle' : 'Oluştur'}</button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
          <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} /> Yükleniyor...
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Kategori</th>
                <th style={{ textAlign: 'left' }}>Slug</th>
                <th style={{ textAlign: 'center' }}>Durum</th>
                <th style={{ textAlign: 'right' }}>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {categories.map(cat => (
                <tr key={cat.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{
                        width: 32, height: 32, borderRadius: 8, background: `${cat.color || '#64748b'}22`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <i className={`fa-solid ${cat.icon || 'fa-tag'}`} style={{ color: cat.color || '#64748b', fontSize: '.8rem' }} />
                      </span>
                      <span style={{ fontWeight: 700, color: 'var(--text-strong)' }}>{cat.name}</span>
                    </div>
                  </td>
                  <td>
                    <code style={{ fontSize: '.75rem', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-strong)', padding: '2px 8px', borderRadius: 4 }}>{cat.slug}</code>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className={`badge ${cat.active !== false ? 'bg' : 'br'}`}>
                      {cat.active !== false ? 'Aktif' : 'Pasif'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button className="btn-g" onClick={() => startEdit(cat)} style={{ padding: '4px 10px', fontSize: '.75rem' }}>
                        <i className="fa-solid fa-pen" style={{ marginRight: 4 }} /> Düzenle
                      </button>
                      {cat.active !== false && (
                        <button className="btn-g" onClick={() => handleDelete(cat.id)} style={{ padding: '4px 10px', fontSize: '.75rem', color: 'var(--danger)' }}>
                          <i className="fa-solid fa-ban" style={{ marginRight: 4 }} /> Pasif Yap
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {categories.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: '.85rem' }}>
                    Henüz kategori tanımlanmamış. <button className="btn-g" onClick={() => setShowNew(true)} style={{ marginLeft: 4 }}>İlk kategoriyi ekleyin</button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
