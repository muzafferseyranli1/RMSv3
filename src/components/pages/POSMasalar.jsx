import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '@/context/WorkspaceContext'
import { loadTableManagementCatalog } from '@/lib/posTableCatalogService'

export default function POSMasalar() {
  const navigate = useNavigate()
  const { branchId, branchName } = useWorkspace()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [catalog, setCatalog] = useState({ halls: [], sections: [], tables: [] })
  const [selectedId, setSelectedId] = useState('')

  useEffect(() => {
    if (!branchId) return
    let cancelled = false
    setLoading(true)
    setError('')
    loadTableManagementCatalog(branchId)
      .then(nextCatalog => {
        if (cancelled) return
        setCatalog(nextCatalog)
        setSelectedId(nextCatalog.tables?.[0]?.id || '')
      })
      .catch(loadError => {
        if (!cancelled) setError(loadError?.message || 'Masa katalogu okunamadi.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [branchId])

  const activeTables = useMemo(
    () => (catalog.tables || []).filter(table => table.status === 'active' && table.is_active !== false),
    [catalog.tables],
  )
  const selectedTable = activeTables.find(table => table.id === selectedId) || activeTables[0] || null

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg,#05082b 0%,#071035 48%,#08123c 100%)', color: '#eef4ff', padding: 22, display: 'grid', gap: 16, alignContent: 'start' }}>
      <header style={{ borderRadius: 24, padding: 20, background: 'linear-gradient(180deg,rgba(11,20,64,.95),rgba(7,14,49,.94))', border: '1px solid rgba(148,163,184,.14)', display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '.75rem', letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(191,219,254,.68)' }}>POS / Kayitli Masa Katalogu</div>
          <h1 style={{ margin: '4px 0 0', fontSize: '2rem' }}>Masalar Ekrani</h1>
          <p style={{ margin: '8px 0 0', color: 'rgba(191,219,254,.74)', lineHeight: 1.55 }}>Masalar yalniz DB katalogundan listelenir.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span style={{ height: 44, borderRadius: 16, padding: '0 16px', display: 'inline-flex', alignItems: 'center', background: 'rgba(15,23,42,.42)', border: '1px solid rgba(148,163,184,.16)', fontWeight: 700 }}>{branchName || 'Aktif sube'}</span>
          <button type="button" onClick={() => navigate('/pos-masa')} style={{ border: 'none', borderRadius: 16, padding: '0 16px', height: 44, fontWeight: 900, display: 'inline-flex', gap: 10, alignItems: 'center', cursor: 'pointer', background: 'linear-gradient(135deg,#fbbf24,#f59e0b)', color: '#071035' }}>
            <i className="fa-solid fa-table-cells-large" /> Masa Yonetimi
          </button>
        </div>
      </header>

      <main style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 330px', gap: 16, alignItems: 'start' }}>
        <section style={{ borderRadius: 24, padding: 18, background: 'linear-gradient(180deg,rgba(11,20,64,.95),rgba(7,14,49,.94))', border: '1px solid rgba(148,163,184,.14)' }}>
          {loading ? (
            <EmptyBox title="Masalar yukleniyor" />
          ) : error ? (
            <EmptyBox title={error} />
          ) : activeTables.length === 0 ? (
            <EmptyBox title="Henuz masa tanimlanmadi" text="Masa eklemeden bu ekranda hazir/demo masa gosterilmez." />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
              {activeTables.map(table => (
                <button key={table.id} type="button" onClick={() => setSelectedId(table.id)} style={{ minHeight: 124, borderRadius: 18, border: `1px solid ${selectedTable?.id === table.id ? 'rgba(251,191,36,.48)' : 'rgba(148,163,184,.16)'}`, background: selectedTable?.id === table.id ? 'rgba(251,191,36,.12)' : 'rgba(15,23,42,.52)', padding: 14, cursor: 'pointer', textAlign: 'left', display: 'grid', gap: 10 }}>
                  <div style={{ color: '#fff', fontWeight: 900 }}>{table.table_name || table.table_number}</div>
                  <div style={{ color: 'rgba(191,219,254,.74)', fontSize: '.8rem', fontWeight: 700 }}>No: {table.table_number || '-'}</div>
                  <div style={{ color: '#86efac', fontSize: '.78rem', fontWeight: 800 }}>{table.table_type === 'square' ? 'Kare' : 'Yuvarlak'} / {table.capacity || '-'} kisilik</div>
                </button>
              ))}
            </div>
          )}
        </section>

        <aside style={{ borderRadius: 24, padding: 18, background: 'linear-gradient(180deg,rgba(11,20,64,.95),rgba(7,14,49,.94))', border: '1px solid rgba(148,163,184,.14)' }}>
          <div style={{ fontSize: '1rem', fontWeight: 900, marginBottom: 12 }}>Secili Masa</div>
          {selectedTable ? (
            <div style={{ display: 'grid', gap: 10, color: 'rgba(219,234,254,.86)', lineHeight: 1.7 }}>
              <strong style={{ color: '#fff', fontSize: '1.08rem' }}>{selectedTable.table_name}</strong>
              <span>Masa No: {selectedTable.table_number || '-'}</span>
              <span>Tip: {selectedTable.table_type === 'square' ? 'Kare' : 'Yuvarlak'}</span>
              <span>Kapasite: {selectedTable.capacity || '-'}</span>
              <span>Durum: {selectedTable.status === 'active' ? 'Aktif' : 'Pasif'}</span>
            </div>
          ) : (
            <div style={{ color: 'rgba(191,219,254,.72)' }}>Masa secilmedi.</div>
          )}
        </aside>
      </main>
    </div>
  )
}

function EmptyBox({ title, text = '' }) {
  return (
    <div style={{ minHeight: 360, display: 'grid', placeItems: 'center', textAlign: 'center', color: 'rgba(191,219,254,.78)' }}>
      <div>
        <div style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 900 }}>{title}</div>
        {text && <div style={{ marginTop: 8 }}>{text}</div>}
      </div>
    </div>
  )
}
