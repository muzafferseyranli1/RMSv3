import { useMemo, useState } from 'react'
import Header from '@/components/layout/Header'

const PREVIEW_ROWS = [
  { id: 1, sku: 'CBM-1001', name: 'Klasik Menu', shortName: 'Tekli menu', category: 'Menuler', status: 'active', branchScope: 'Tum subeler', priceMode: 'Net fiyat' },
  { id: 2, sku: 'CBM-1018', name: 'Cheese Combo', shortName: 'Cheeseburger menu', category: 'One Cikan Menuler', status: 'active', branchScope: 'AVM Subeleri', priceMode: 'Indirim %' },
  { id: 3, sku: 'CBM-1042', name: 'Aile Paylasim Menu', shortName: '4 kisilik set', category: 'Aile Menuleri', status: 'passive', branchScope: 'Secili subeler', priceMode: 'Net fiyat' },
  { id: 4, sku: 'CBM-1094', name: 'Tavuk Avantaj Menu', shortName: 'Ekonomik menu', category: 'Menuler', status: 'active', branchScope: 'Tum subeler', priceMode: 'Sabit indirim' },
]

const CATEGORY_OPTIONS = ['Tum kategoriler', 'Menuler', 'One Cikan Menuler', 'Aile Menuleri']

const EMPTY_FORM = {
  name: '',
  shortName: '',
  sku: '',
  category: 'Menuler',
  branchScope: 'Tum subeler',
  priceMode: 'Net fiyat',
  active: true,
  note: '',
}

function badgeForStatus(status) {
  return status === 'active'
    ? { className: 'badge bg', label: 'Aktif' }
    : { className: 'badge br', label: 'Pasif' }
}

export default function ComboMenuBackofficePreview() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('Tum kategoriler')
  const [showPassive, setShowPassive] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRow, setEditingRow] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return PREVIEW_ROWS.filter(row => {
      if (!showPassive && row.status !== 'active') return false
      if (category !== 'Tum kategoriler' && row.category !== category) return false
      if (!query) return true
      return (
        row.name.toLowerCase().includes(query) ||
        row.shortName.toLowerCase().includes(query) ||
        row.sku.toLowerCase().includes(query)
      )
    })
  }, [category, search, showPassive])

  function handleOpenNew() {
    setEditingRow(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  function handleOpenEdit(row) {
    setEditingRow(row)
    setForm({
      name: row.name,
      shortName: row.shortName,
      sku: row.sku,
      category: row.category,
      branchScope: row.branchScope,
      priceMode: row.priceMode,
      active: row.status === 'active',
      note: '',
    })
    setModalOpen(true)
  }

  function updateField(key, value) {
    setForm(current => ({ ...current, [key]: value }))
  }

  return (
    <div className="page-enter">
      <Header
        title="Combo Menu Preview"
        subtitle="Backoffice tasarim dili ornegi: once liste, sonra pencere icinde detay"
        actions={(
          <>
            <button type="button" className="btn-o">
              <i className="fa-solid fa-file-arrow-down" />
              Disa Aktar
            </button>
            <button type="button" className="btn-p" onClick={handleOpenNew}>
              <i className="fa-solid fa-plus" />
              Yeni Combo Menu
            </button>
          </>
        )}
      />

      <div
        className="card"
        style={{
          padding: 14,
          marginBottom: 14,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(220px, 2fr) minmax(180px, 1fr) auto',
            gap: 12,
            alignItems: 'end',
          }}
        >
          <div>
            <label className="f-label">Ara</label>
            <div style={{ position: 'relative' }}>
              <i
                className="fa-solid fa-search"
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#94a3b8',
                  fontSize: '.75rem',
                }}
              />
              <input
                className="f-input"
                placeholder="Combo menu, kisa isim veya SKU ara..."
                value={search}
                onChange={event => setSearch(event.target.value)}
                style={{ paddingLeft: 30 }}
              />
            </div>
          </div>

          <div>
            <label className="f-label">Kategori</label>
            <div className="sel-wrap">
              <select className="f-input" value={category} onChange={event => setCategory(event.target.value)}>
                {CATEGORY_OPTIONS.map(option => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '9px 12px',
              minHeight: 42,
              borderRadius: 10,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              color: '#475569',
              fontSize: '.83rem',
              fontWeight: 700,
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <label className="tog" onClick={event => event.stopPropagation()}>
              <input type="checkbox" checked={showPassive} onChange={event => setShowPassive(event.target.checked)} />
              <span className="tog-sl" />
            </label>
            Pasifleri goster
          </label>
        </div>
      </div>

      <div
        className="card"
        style={{
          marginBottom: 14,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid #e2e8f0',
            background: '#f8fafc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="badge bgr">
              <i className="fa-solid fa-rectangle-list" />
              {filteredRows.length} kayit
            </span>
            <span style={{ fontSize: '.78rem', color: '#64748b' }}>
              Liste agirlikli masaustu ekran. Detay girisi popup pencere ile aciliyor.
            </span>
          </div>
          <button type="button" className="btn-o" onClick={handleOpenNew}>
            <i className="fa-solid fa-plus" />
            Yeni Kayit
          </button>
        </div>

        <table className="tbl">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Combo Menu</th>
              <th>Kategori</th>
              <th>Kapsam</th>
              <th>Fiyat Modu</th>
              <th>Durum</th>
              <th>Islem</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="empty">
                    <i className="fa-solid fa-burger" />
                    <p>Filtreye uyan combo menu bulunamadi</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredRows.map(row => {
                const status = badgeForStatus(row.status)
                return (
                  <tr key={row.id}>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#475569' }}>{row.sku}</span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{row.name}</div>
                      <div style={{ fontSize: '.74rem', color: '#94a3b8', marginTop: 2 }}>{row.shortName}</div>
                    </td>
                    <td>
                      <span className="badge by">{row.category}</span>
                    </td>
                    <td>{row.branchScope}</td>
                    <td>{row.priceMode}</td>
                    <td>
                      <span className={status.className}>{status.label}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button type="button" className="ico-btn edit" onClick={() => handleOpenEdit(row)} title="Duzenle">
                          <i className="fa-solid fa-pen" />
                        </button>
                        <button type="button" className="ico-btn" title="Kopyala">
                          <i className="fa-solid fa-copy" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <div
        className="card"
        style={{
          padding: 16,
          background: '#fffbeb',
          border: '1px solid #fde68a',
        }}
      >
        <div style={{ fontSize: '.78rem', fontWeight: 800, color: '#92400e', marginBottom: 6 }}>
          Bu preview neyi gostermek icin var?
        </div>
        <div style={{ fontSize: '.82rem', color: '#7c2d12', lineHeight: 1.6 }}>
          Bu ekran, `Combo Menu` gibi backoffice sayfalarin kiosk/POS tarzi ayrik bir arayuz yerine;
          tablo, filtre ve detay penceresi merkezli ortak SuitableRMS masaustu diline nasil oturabilecegini
          gosteren bir referans kopyadir.
        </div>
      </div>

      {modalOpen && (
        <div className="modal-bg open">
          <div
            className="modal-box"
            style={{
              width: 'min(92vw, 860px)',
              maxHeight: '88vh',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div className="modal-head">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    {editingRow ? 'Combo Menu Duzenle' : 'Yeni Combo Menu'}
                  </h2>
                  <p style={{ margin: '4px 0 0', fontSize: '.78rem', color: '#94a3b8' }}>
                    Ayrik full-screen akis yerine, ana listeden acilan masaustu detay penceresi
                  </p>
                </div>
                <button type="button" className="ico-btn" onClick={() => setModalOpen(false)}>
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>
            </div>

            <div className="modal-body" style={{ display: 'grid', gap: 18 }}>
              <div
                className="card"
                style={{
                  padding: 16,
                  background: '#f8fafc',
                }}
              >
                <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12 }}>
                  Temel Bilgiler
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label className="f-label">Combo Menu Adi</label>
                    <input className="f-input" value={form.name} onChange={event => updateField('name', event.target.value)} />
                  </div>
                  <div>
                    <label className="f-label">Kisa Ad</label>
                    <input className="f-input" value={form.shortName} onChange={event => updateField('shortName', event.target.value)} />
                  </div>
                  <div>
                    <label className="f-label">SKU</label>
                    <input className="f-input" value={form.sku} onChange={event => updateField('sku', event.target.value)} />
                  </div>
                  <div>
                    <label className="f-label">Kategori</label>
                    <div className="sel-wrap">
                      <select className="f-input" value={form.category} onChange={event => updateField('category', event.target.value)}>
                        {CATEGORY_OPTIONS.filter(option => option !== 'Tum kategoriler').map(option => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.1fr .9fr',
                  gap: 16,
                }}
              >
                <div className="card" style={{ padding: 16 }}>
                  <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12 }}>
                    Yayin ve Kapsam
                  </div>
                  <div style={{ display: 'grid', gap: 14 }}>
                    <div>
                      <label className="f-label">Sube Kapsami</label>
                      <div className="sel-wrap">
                        <select className="f-input" value={form.branchScope} onChange={event => updateField('branchScope', event.target.value)}>
                          <option value="Tum subeler">Tum subeler</option>
                          <option value="AVM Subeleri">AVM Subeleri</option>
                          <option value="Secili subeler">Secili subeler</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="f-label">Fiyat Modu</label>
                      <div className="sel-wrap">
                        <select className="f-input" value={form.priceMode} onChange={event => updateField('priceMode', event.target.value)}>
                          <option value="Net fiyat">Net fiyat</option>
                          <option value="Indirim %">Indirim %</option>
                          <option value="Sabit indirim">Sabit indirim</option>
                        </select>
                      </div>
                    </div>
                    <label
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: '.84rem',
                        color: '#334155',
                        cursor: 'pointer',
                      }}
                    >
                      <input type="checkbox" checked={form.active} onChange={event => updateField('active', event.target.checked)} />
                      Kayit aktif olsun
                    </label>
                  </div>
                </div>

                <div className="card" style={{ padding: 16, background: '#fffbeb', borderColor: '#fde68a' }}>
                  <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#92400e', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12 }}>
                    Tasarim Notu
                  </div>
                  <div style={{ display: 'grid', gap: 10, fontSize: '.8rem', color: '#7c2d12', lineHeight: 1.6 }}>
                    <div>Bu alan bilerek sade tutuldu; ana bilgi once listede, detay sonra pencerede aciliyor.</div>
                    <div>Gereksiz buyuk sekme blogu, hero alan veya tam ekran mini uygulama yok.</div>
                    <div>4:3 ekranlarda footer butonlari ve temel alanlar gorunur kalacak yogunluk hedeflendi.</div>
                  </div>
                </div>
              </div>

              <div className="card" style={{ padding: 16 }}>
                <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12 }}>
                  Ic Not
                </div>
                <textarea
                  className="f-input"
                  rows={4}
                  value={form.note}
                  onChange={event => updateField('note', event.target.value)}
                  placeholder="Operasyon notu, kampanya farki veya kullanim aciklamasi..."
                  style={{ resize: 'vertical', minHeight: 110 }}
                />
              </div>
            </div>

            <div className="modal-foot" style={{ justifyContent: 'space-between' }}>
              <div style={{ fontSize: '.76rem', color: '#64748b' }}>
                Preview amaclidir. Bu pencere orijinal `ComboMenu.jsx` davranisini degistirmez.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn-g" onClick={() => setModalOpen(false)}>
                  Iptal
                </button>
                <button type="button" className="btn-p">
                  <i className="fa-solid fa-check" />
                  Kaydet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
