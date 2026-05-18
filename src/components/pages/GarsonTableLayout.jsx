import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '@/context/WorkspaceContext'
import { loadTableManagementCatalog } from '@/lib/posTableCatalogService'

const STATUS_META = {
  empty: { label: 'Bos', color: '#22c55e' },
  occupied: { label: 'Dolu', color: '#ef4444' },
  reserved: { label: 'Rezerve', color: '#3b82f6' },
  inactive: { label: 'Pasif', color: '#94a3b8' },
}

function getTableDescriptor(table) {
  const label = table?.table_name || table?.table_number || 'Masa'
  return {
    tableKey: String(table?.id || ''),
    masaNo: String(table?.table_number || label).trim(),
    label,
  }
}

function groupTables(catalog) {
  const hallMap = new Map((catalog.halls || []).map(hall => [hall.id, { ...hall, sections: [], tables: [] }]))
  const sectionMap = new Map()

  ;(catalog.sections || []).forEach(section => {
    const nextSection = { ...section, tables: [] }
    sectionMap.set(section.id, nextSection)
    hallMap.get(section.hall_id)?.sections.push(nextSection)
  })

  ;(catalog.tables || []).forEach(table => {
    const normalizedTable = { ...table, table_type: table.table_type || 'round' }
    const section = sectionMap.get(table.section_id)
    if (section) {
      section.tables.push(normalizedTable)
      return
    }
    hallMap.get(table.hall_id)?.tables.push(normalizedTable)
  })

  return Array.from(hallMap.values())
}

export default function GarsonTableLayout({
  selectedTableKey = '',
  occupiedTableKeys = [],
  coverCountByTable = {},
  tableSignalsByKey = {},
  onSelectTable,
}) {
  const navigate = useNavigate()
  const { branchId } = useWorkspace()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [catalog, setCatalog] = useState({ halls: [], sections: [], tables: [] })
  const [selectedId, setSelectedId] = useState(selectedTableKey || '')

  useEffect(() => {
    if (!branchId) return
    let cancelled = false
    setLoading(true)
    setError('')

    loadTableManagementCatalog(branchId)
      .then(nextCatalog => {
        if (cancelled) return
        setCatalog(nextCatalog)
        setSelectedId(current => current || nextCatalog.tables?.[0]?.id || '')
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

  useEffect(() => {
    if (selectedTableKey) setSelectedId(selectedTableKey)
  }, [selectedTableKey])

  const occupiedSet = useMemo(
    () => new Set((occupiedTableKeys || []).map(key => String(key || '').trim()).filter(Boolean)),
    [occupiedTableKeys],
  )
  const grouped = useMemo(() => groupTables(catalog), [catalog])
  const activeTables = useMemo(
    () => (catalog.tables || []).filter(table => table.status === 'active' && table.is_active !== false),
    [catalog.tables],
  )

  function handleTableClick(table) {
    const descriptor = getTableDescriptor(table)
    setSelectedId(descriptor.tableKey)
    const occupied = occupiedSet.has(descriptor.tableKey)
    onSelectTable?.({
      tableKey: descriptor.tableKey,
      masaNo: descriptor.masaNo,
      label: descriptor.label,
      keepLayoutOpen: occupied,
      occupied,
    })
  }

  if (!branchId) {
    return <EmptyState title="Sube baglami bulunamadi" text="Masa listesi icin once sube baglami secilmeli." />
  }

  if (loading) {
    return <EmptyState title="Masalar yukleniyor" text="Salon, bolge ve masa kataloglari okunuyor." spinning />
  }

  if (error) {
    return <EmptyState title="Masa katalogu okunamadi" text={error} tone="danger" />
  }

  if (activeTables.length === 0) {
    return (
      <EmptyState
        title="Henuz masa tanimlanmadi"
        text="Bu subede kayitli masa yok. Once Salon > Bolge > Masa agacindan masa ekleyin."
        actionLabel="Masa yonetimine git"
        onAction={() => navigate('/pos-masa')}
      />
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', gap: 14, minHeight: 0, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: '#fff', fontSize: '1.05rem', fontWeight: 900 }}>Basit Masa Gorunumu</div>
          <div style={{ color: 'rgba(191,219,254,.72)', fontSize: '.82rem', marginTop: 4 }}>
            Salon / bolge / masa katalogu
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate('/pos-masa')}
          style={{
            minHeight: 40,
            padding: '0 16px',
            borderRadius: 999,
            border: '1px solid rgba(251,191,36,.3)',
            background: 'linear-gradient(135deg,#fbbf24,#f59e0b)',
            color: '#071035',
            fontWeight: 900,
            cursor: 'pointer',
          }}
        >
          Duzenle
        </button>
      </div>

      <div style={{ minHeight: 0, borderRadius: 24, padding: 18, background: 'rgba(4,8,28,.44)', border: '1px solid rgba(148,163,184,.12)', overflow: 'auto' }}>
        <div style={{ display: 'grid', gap: 18 }}>
          {grouped.map(hall => (
            <section key={hall.id} style={{ display: 'grid', gap: 12 }}>
              <div style={{ color: '#fff', fontSize: '1rem', fontWeight: 900 }}>{hall.name}</div>
              {hall.sections.map(section => (
                <div key={section.id} style={{ display: 'grid', gap: 10 }}>
                  <div style={{ color: '#93c5fd', fontSize: '.78rem', fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase' }}>
                    {section.name}
                  </div>
                  <TableGrid
                    tables={section.tables.filter(table => table.status === 'active' && table.is_active !== false)}
                    selectedId={selectedId}
                    occupiedSet={occupiedSet}
                    coverCountByTable={coverCountByTable}
                    tableSignalsByKey={tableSignalsByKey}
                    onTableClick={handleTableClick}
                  />
                </div>
              ))}
              {hall.tables.length > 0 && (
                <TableGrid
                  tables={hall.tables.filter(table => table.status === 'active' && table.is_active !== false)}
                  selectedId={selectedId}
                  occupiedSet={occupiedSet}
                  coverCountByTable={coverCountByTable}
                  tableSignalsByKey={tableSignalsByKey}
                  onTableClick={handleTableClick}
                />
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

function TableGrid({ tables, selectedId, occupiedSet, coverCountByTable, tableSignalsByKey, onTableClick }) {
  if (!tables.length) return null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))', gap: 12 }}>
      {tables.map(table => {
        const descriptor = getTableDescriptor(table)
        const occupied = occupiedSet.has(descriptor.tableKey)
        const statusMeta = occupied ? STATUS_META.occupied : STATUS_META.empty
        const selected = selectedId === descriptor.tableKey
        const liveCoverCount = Math.max(0, parseInt(coverCountByTable?.[descriptor.tableKey], 10) || 0)
        const signal = tableSignalsByKey?.[descriptor.tableKey] || {}
        const hasPendingAlert = signal.pendingCount > 0
        const hasAcknowledgedAlert = !hasPendingAlert && signal.acknowledgedCount > 0
        const signalBorder = hasPendingAlert
          ? 'rgba(248,113,113,.92)'
          : hasAcknowledgedAlert
            ? 'rgba(56,189,248,.72)'
            : (selected ? 'rgba(251,191,36,.48)' : 'rgba(148,163,184,.16)')
        const signalBackground = hasPendingAlert
          ? 'linear-gradient(180deg, rgba(127,29,29,.82), rgba(15,23,42,.84))'
          : hasAcknowledgedAlert
            ? 'linear-gradient(180deg, rgba(8,47,73,.82), rgba(15,23,42,.84))'
            : (selected ? 'rgba(251,191,36,.12)' : 'rgba(15,23,42,.52)')
        const signalShadow = hasPendingAlert
          ? '0 0 0 2px rgba(248,113,113,.16), 0 0 24px rgba(248,113,113,.42)'
          : hasAcknowledgedAlert
            ? '0 0 0 2px rgba(56,189,248,.12), 0 0 20px rgba(56,189,248,.28)'
            : `0 10px 24px ${statusMeta.color}22`

        return (
          <button
            key={descriptor.tableKey}
            type="button"
            onClick={() => onTableClick(table)}
            style={{
              minHeight: 112,
              borderRadius: 18,
              border: `1px solid ${signalBorder}`,
              background: signalBackground,
              boxShadow: signalShadow,
              padding: 14,
              cursor: 'pointer',
              textAlign: 'left',
              display: 'grid',
              gap: 10,
              animation: hasPendingAlert ? 'tableSignalPulse 1.15s ease-in-out infinite' : 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ color: '#fff', fontWeight: 900, fontSize: '.95rem' }}>{descriptor.label}</span>
              <span style={{ width: 12, height: 12, borderRadius: 999, background: statusMeta.color, boxShadow: `0 0 0 4px ${statusMeta.color}22`, flexShrink: 0 }} />
            </div>
            <div style={{ color: 'rgba(191,219,254,.74)', fontSize: '.78rem', fontWeight: 700 }}>
              {table.table_type === 'square' ? 'Kare' : 'Yuvarlak'} / {table.capacity || '-'} kisilik
            </div>
            {(signal.hasQrOrder || signal.hasCallWaiter || signal.hasBillRequest || signal.acknowledgedBy) ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {signal.hasQrOrder ? (
                  <span style={{ borderRadius: 999, padding: '4px 8px', background: 'rgba(251,191,36,.16)', color: '#fbbf24', fontSize: '.66rem', fontWeight: 900 }}>
                    QR Siparisi
                  </span>
                ) : null}
                {signal.hasCallWaiter ? (
                  <span style={{ borderRadius: 999, padding: '4px 8px', background: 'rgba(248,113,113,.16)', color: '#fca5a5', fontSize: '.66rem', fontWeight: 900 }}>
                    Garson Cagiriyor
                  </span>
                ) : null}
                {signal.hasBillRequest ? (
                  <span style={{ borderRadius: 999, padding: '4px 8px', background: 'rgba(125,211,252,.16)', color: '#7dd3fc', fontSize: '.66rem', fontWeight: 900 }}>
                    Hesap Istiyor
                  </span>
                ) : null}
                {!hasPendingAlert && signal.acknowledgedBy ? (
                  <span style={{ borderRadius: 999, padding: '4px 8px', background: 'rgba(56,189,248,.16)', color: '#7dd3fc', fontSize: '.66rem', fontWeight: 900 }}>
                    {signal.acknowledgedBy}
                  </span>
                ) : null}
              </div>
            ) : null}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ borderRadius: 999, padding: '4px 8px', background: `${statusMeta.color}22`, color: statusMeta.color, fontSize: '.72rem', fontWeight: 900 }}>
                {statusMeta.label}
              </span>
              <span style={{ color:'#f8fafc', fontSize:'.76rem', fontWeight:800 }}>Kuver: {liveCoverCount}</span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

function EmptyState({ title, text, actionLabel, onAction, spinning = false, tone = 'default' }) {
  return (
    <div style={{ minHeight: 420, borderRadius: 24, border: '1px solid rgba(148,163,184,.12)', background: 'linear-gradient(180deg, rgba(11,20,64,.62), rgba(7,14,49,.82))', display: 'grid', placeItems: 'center', padding: 28, textAlign: 'center' }}>
      <div style={{ maxWidth: 560 }}>
        <div style={{ width: 72, height: 72, margin: '0 auto 18px', borderRadius: 20, background: tone === 'danger' ? 'rgba(239,68,68,.14)' : 'rgba(56,189,248,.12)', color: tone === 'danger' ? '#fca5a5' : '#7dd3fc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem' }}>
          <i className={`fa-solid ${spinning ? 'fa-spinner fa-spin' : 'fa-table-cells-large'}`} />
        </div>
        <div style={{ color: '#fff', fontSize: '1.18rem', fontWeight: 900 }}>{title}</div>
        <div style={{ color: 'rgba(191,219,254,.78)', lineHeight: 1.7, marginTop: 10 }}>{text}</div>
        {actionLabel && (
          <button type="button" onClick={onAction} style={{ marginTop: 20, minHeight: 48, padding: '0 18px', borderRadius: 14, border: '1px solid rgba(251,191,36,.3)', background: 'linear-gradient(135deg,#fbbf24,#f59e0b)', color: '#071035', fontWeight: 900, cursor: 'pointer' }}>
            {actionLabel}
          </button>
        )}
      </div>
      <style>{`
        @keyframes tableSignalPulse {
          0%, 100% { transform: translateY(0); box-shadow: 0 0 0 2px rgba(248,113,113,.16), 0 0 18px rgba(248,113,113,.24); }
          50% { transform: translateY(-1px); box-shadow: 0 0 0 2px rgba(248,113,113,.24), 0 0 30px rgba(248,113,113,.48); }
        }
      `}</style>
    </div>
  )
}
