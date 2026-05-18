import { useEffect, useState, useCallback } from 'react'
import React from 'react'
import { db } from '@/lib/db'
import Header from '@/components/layout/Header'


function SearchSelect({ value, onChange, options, placeholder = 'Tümü' }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = React.useRef()

  React.useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = options.filter(o => o.toLowerCase().includes(q.toLowerCase()))
  const label = value || placeholder

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 120 }}>
      <div onClick={() => { setOpen(o => !o); setQ('') }}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          border: `1px solid ${value ? '#6366f1' : '#e2e8f0'}`, borderRadius: 6,
          padding: '3px 8px', cursor: 'pointer', fontSize: '.75rem',
          background: value ? '#eff6ff' : '#fff', color: value ? '#0f172a' : '#94a3b8',
          userSelect: 'none', gap: 6 }}>
        <span style={{ fontWeight: value ? 600 : 400 }}>{label}</span>
        <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'}`} style={{ fontSize: '.6rem', color: '#94a3b8' }}/>
      </div>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 50, minWidth: 160,
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,.12)', overflow: 'hidden', marginTop: 2 }}>
          <div style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9' }}>
            <input autoFocus value={q} onChange={e => setQ(e.target.value)}
              placeholder="Ara…"
              style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 6,
                padding: '4px 8px', fontSize: '.75rem', outline: 'none' }}/>
          </div>
          <div style={{ maxHeight: 180, overflowY: 'auto' }}>
            <div onClick={() => { onChange(''); setOpen(false) }}
              style={{ padding: '7px 12px', cursor: 'pointer', fontSize: '.78rem',
                background: !value ? '#eff6ff' : 'transparent',
                color: !value ? '#6366f1' : '#334155', fontWeight: !value ? 700 : 400 }}
              onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
              onMouseLeave={e => e.currentTarget.style.background = !value ? '#eff6ff' : 'transparent'}>
              Tümü
            </div>
            {filtered.map(o => (
              <div key={o} onClick={() => { onChange(o); setOpen(false) }}
                style={{ padding: '7px 12px', cursor: 'pointer', fontSize: '.78rem',
                  background: value === o ? '#eff6ff' : 'transparent',
                  color: value === o ? '#6366f1' : '#334155', fontWeight: value === o ? 700 : 400 }}
                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                onMouseLeave={e => e.currentTarget.style.background = value === o ? '#eff6ff' : 'transparent'}>
                {o}
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: '10px 12px', color: '#94a3b8', fontSize: '.75rem', textAlign: 'center' }}>
                Sonuç yok
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function PriceChanges() {
  const [changes, setChanges]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [channels, setChannels] = useState([])
  const [filterPort, setFilterPort]     = useState('')
  const [filterBranch, setFilterBranch] = useState('')
  const [filterChannel, setFilterChannel] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: pc }, { data: ch }] = await Promise.all([
      db.from('price_changes').select('*').order('created_at', { ascending: false }),
      db.from('sales_channels').select('*').is('deleted_at', null).order('sort_order'),
    ])
    setChanges(pc || [])
    setChannels(ch || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const today = new Date().toISOString().slice(0, 10)

  function isFuture(rec) {
    return rec.effective_date && rec.effective_date > today
  }

  function formatDate(d) {
    if (!d) return 'Hemen'
    return new Date(d + 'T00:00:00').toLocaleDateString('tr-TR')
  }

  function formatPrice(v) {
    if (v === null || v === undefined || v === '') return '—'
    return parseFloat(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
  }

  // Group changes by sale_item
  const grouped = {}
  changes.forEach(c => {
    if (!grouped[c.sale_item_id || 'unknown']) grouped[c.sale_item_id || 'unknown'] = []
    grouped[c.sale_item_id || 'unknown'].push(c)
  })

  return (
    <div className="page-enter">
      <Header
        title="Fiyat Değişiklikleri"
        subtitle="Kaydedilen tüm fiyat değişikliği işlemleri"
        actions={
          <button className="btn-o" onClick={load} style={{ fontSize: '.83rem' }}>
            <i className="fa-solid fa-rotate-right" /> Yenile
          </button>
        }
      />

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>
          <i className="fa-solid fa-spinner fa-spin fa-2x" />
          <p style={{ marginTop: 12 }}>Yükleniyor…</p>
        </div>
      ) : changes.length === 0 ? (
        <div className="card">
          <div className="empty">
            <i className="fa-solid fa-clock-rotate-left" />
            <p>Henüz fiyat değişikliği kaydı yok</p>
            <p style={{ fontSize: '.78rem', color: '#94a3b8' }}>Fiyat Yönetimi sayfasından fiyat kaydedince burada görünür</p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {changes.map(rec => {
            const future = isFuture(rec)
            const isOpen = expanded === rec.id
            const chgs = rec.changes || []
            const changedCount = chgs.filter(c => c.old_price !== c.new_price).length

            return (
              <div key={rec.id} className="card" style={{
                padding: 0, overflow: 'hidden',
                border: future ? '2px solid #fbbf24' : '1px solid #e2e8f0'
              }}>
                {/* Başlık satırı */}
                <div
                  onClick={() => setExpanded(isOpen ? null : rec.id)}
                  style={{
                    padding: '12px 16px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 12,
                    background: future ? '#fffbeb' : '#fff',
                    borderBottom: isOpen ? '1px solid #f1f5f9' : 'none',
                  }}
                >
                  {/* Expand icon */}
                  <i className={`fa-solid fa-chevron-${isOpen ? 'down' : 'right'}`}
                    style={{ color: '#94a3b8', fontSize: '.72rem', width: 12 }} />

                  {/* Ürün adı */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: '.9rem', color: '#0f172a' }}>
                        {rec.sale_item_name || '—'}
                      </span>
                      <span style={{ fontFamily: 'monospace', fontSize: '.72rem', color: '#94a3b8',
                        background: '#f1f5f9', padding: '1px 6px', borderRadius: 5 }}>
                        {rec.sale_item_sku}
                      </span>
                      {future && (
                        <span style={{ background: '#fef3c7', color: '#92400e', fontSize: '.7rem',
                          fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                          display: 'flex', alignItems: 'center', gap: 4 }}>
                          <i className="fa-solid fa-clock" /> İleri Tarihli
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '.75rem', color: '#64748b', marginTop: 2 }}>
                      {changedCount} değişiklik
                    </div>
                  </div>

                  {/* Geçerlilik tarihi */}
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '.78rem', fontWeight: 700,
                      color: future ? '#d97706' : '#16a34a' }}>
                      <i className={`fa-solid ${future ? 'fa-hourglass-half' : 'fa-check-circle'}`}
                        style={{ marginRight: 4 }} />
                      {rec.effective_date ? formatDate(rec.effective_date) : 'Anında Uygulandı'}
                    </div>
                    <div style={{ fontSize: '.7rem', color: '#94a3b8', marginTop: 2 }}>
                      Kaydedildi: {new Date(rec.created_at).toLocaleString('tr-TR')}
                    </div>
                  </div>
                </div>

                {/* Detay tablosu */}
                {isOpen && (
                  <div style={{ overflowX: 'auto' }}>
                    {chgs.length === 0 ? (
                      <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: '.83rem' }}>
                        Detay bilgisi bulunamadı
                      </div>
                    ) : (() => {
                      // Unique değerler
                      const ports    = [...new Set(chgs.map(c => c.port_name || 'Standart'))]
                      const branches = [...new Set(chgs.map(c => c.branch_name).filter(Boolean))]
                      const chNames  = [...new Set(chgs.map(c => c.channel_name).filter(Boolean))]

                      const filtered = chgs.filter(c => {
                        if (filterPort    && (c.port_name || 'Standart') !== filterPort)    return false
                        if (filterBranch  && c.branch_name  !== filterBranch)               return false
                        if (filterChannel && c.channel_name !== filterChannel)              return false
                        return true
                      })

                      return (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.8rem' }}>
                          <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                              <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 700, color: '#64748b' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  <span>Boyut</span>
                                  <SearchSelect value={filterPort} onChange={setFilterPort} options={ports}/>
                                </div>
                              </th>
                              <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 700, color: '#64748b' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  <span>Şube</span>
                                  {branches.length > 0 && <SearchSelect value={filterBranch} onChange={setFilterBranch} options={branches}/>}
                                </div>
                              </th>
                              <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 700, color: '#64748b' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  <span>Satış Kanalı</span>
                                  <SearchSelect value={filterChannel} onChange={setFilterChannel} options={chNames}/>
                                </div>
                              </th>
                              <th style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 700, color: '#64748b' }}>Eski Fiyat</th>
                              <th style={{ padding: '8px 14px', textAlign: 'center', fontWeight: 700, color: '#64748b', width: 30 }} />
                              <th style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 700, color: '#64748b' }}>Yeni Fiyat</th>
                              <th style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 700, color: '#64748b' }}>
                                Fark
                                {(filterPort || filterBranch || filterChannel) && (
                                  <button onClick={() => { setFilterPort(''); setFilterBranch(''); setFilterChannel('') }}
                                    title="Filtreleri temizle"
                                    style={{ marginLeft: 8, background: '#fee2e2', border: 'none', borderRadius: 5,
                                      padding: '2px 6px', cursor: 'pointer', fontSize: '.68rem', color: '#dc2626' }}>
                                    ✕ Temizle
                                  </button>
                                )}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {filtered.length === 0 ? (
                              <tr><td colSpan={7} style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>
                                Filtreyle eşleşen kayıt yok
                              </td></tr>
                            ) : filtered.map((c, ci) => {
                              const changed = c.old_price !== c.new_price
                              const diff = (parseFloat(c.new_price) || 0) - (parseFloat(c.old_price) || 0)
                              const isUp = diff > 0
                              return (
                                <tr key={ci} style={{
                                  borderBottom: '1px solid #f8fafc',
                                  background: !changed ? '#fff' : isUp ? '#fef2f2' : '#f0fdf4',
                                  opacity: changed ? 1 : 0.5
                                }}>
                                  <td style={{ padding: '7px 14px', color: '#334155', fontWeight: changed ? 600 : 400 }}>
                                    {c.port_name || 'Standart'}
                                  </td>
                                  <td style={{ padding: '7px 14px', color: '#64748b' }}>{c.branch_name || '—'}</td>
                                  <td style={{ padding: '7px 14px' }}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                      <i className="fa-solid fa-store" style={{ color: '#0369a1', fontSize: '.72rem' }} />
                                      {c.channel_name}
                                    </span>
                                  </td>
                                  <td style={{ padding: '7px 14px', textAlign: 'right', fontFamily: 'monospace',
                                    color: '#64748b', textDecoration: changed ? 'line-through' : 'none' }}>
                                    {formatPrice(c.old_price)}
                                  </td>
                                  <td style={{ padding: '7px 6px', textAlign: 'center', color: '#94a3b8' }}>
                                    {changed && <i className="fa-solid fa-arrow-right" style={{ fontSize: '.7rem' }} />}
                                  </td>
                                  <td style={{ padding: '7px 14px', textAlign: 'right', fontFamily: 'monospace',
                                    fontWeight: changed ? 700 : 400,
                                    color: changed ? (isUp ? '#dc2626' : '#16a34a') : '#64748b' }}>
                                    {formatPrice(c.new_price)}
                                  </td>
                                  <td style={{ padding: '7px 14px', textAlign: 'right', fontFamily: 'monospace',
                                    fontWeight: 700,
                                    color: !changed ? '#94a3b8' : isUp ? '#dc2626' : '#16a34a' }}>
                                    {changed ? `${isUp ? '+' : ''}${formatPrice(diff)}` : '—'}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      )
                    })()}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
