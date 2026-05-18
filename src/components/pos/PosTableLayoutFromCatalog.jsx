import { useMemo } from 'react'

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

export default function PosTableLayoutFromCatalog({
  tableCatalog,
  tableCatalogLoading,
  occupiedTableKeys = [],
  coverCountByTable = {},
  currentTableKey = '',
  onSelectTable,
  onNavigateToMasaManagement,
}) {
  const occupiedSet = useMemo(
    () => new Set((occupiedTableKeys || []).map(key => String(key || '').trim()).filter(Boolean)),
    [occupiedTableKeys],
  )
  const grouped = useMemo(() => groupTables(tableCatalog), [tableCatalog])
  const activeTables = useMemo(
    () => (tableCatalog.tables || []).filter(table => table.status === 'active' && table.is_active !== false),
    [tableCatalog.tables],
  )

  if (tableCatalogLoading) {
    return (
      <div style={{
        minHeight: 220,
        borderRadius: 20,
        border: '1px solid rgba(148,163,184,.12)',
        background: 'rgba(15,23,42,.4)',
        display: 'grid',
        placeItems: 'center',
        color: '#94a3b8',
        fontWeight: 800,
      }}>
        Masalar yukleniyor...
      </div>
    )
  }

  if (!tableCatalog?.tables?.length || activeTables.length === 0) {
    return (
      <div style={{
        minHeight: 220,
        borderRadius: 20,
        border: '1px solid rgba(148,163,184,.12)',
        background: 'rgba(15,23,42,.4)',
        display: 'grid',
        placeItems: 'center',
        color: '#94a3b8',
        fontWeight: 800,
      }}>
        Aktif masa bulunamadi.
      </div>
    )
  }

  function handleTableClick(table) {
    const descriptor = getTableDescriptor(table)
    const occupied = occupiedSet.has(descriptor.tableKey)
    onSelectTable?.({
      tableKey: descriptor.tableKey,
      masaNo: descriptor.masaNo,
      label: descriptor.label,
      keepLayoutOpen: occupied,
      occupied,
    })
  }

  return (
    <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
      {grouped.map(hall => (
        <div key={hall.id} style={{ display: 'grid', gap: 10 }}>
          <div style={{ color: '#93c5fd', fontSize: '.82rem', fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase' }}>
            {hall.name}
          </div>
          {hall.sections.map(section => (
            <div key={section.id} style={{ display: 'grid', gap: 8 }}>
              <div style={{ color: '#bae6fd', fontSize: '.75rem', fontWeight: 700 }}>
                {section.name}
              </div>
              <TableGrid
                tables={section.tables.filter(table => table.status === 'active' && table.is_active !== false)}
                selectedId={currentTableKey}
                occupiedSet={occupiedSet}
                coverCountByTable={coverCountByTable}
                onTableClick={handleTableClick}
              />
            </div>
          ))}
          {hall.tables.length > 0 && (
            <TableGrid
              tables={hall.tables.filter(table => table.status === 'active' && table.is_active !== false)}
              selectedId={currentTableKey}
              occupiedSet={occupiedSet}
              coverCountByTable={coverCountByTable}
              onTableClick={handleTableClick}
            />
          )}
        </div>
      ))}
    </div>
  )
}

function TableGrid({ tables, selectedId, occupiedSet, coverCountByTable, onTableClick }) {
  if (!tables.length) return null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))', gap: 12 }}>
      {tables.map(table => {
        const descriptor = getTableDescriptor(table)
        const occupied = occupiedSet.has(descriptor.tableKey)
        const statusMeta = occupied ? STATUS_META.occupied : STATUS_META.empty
        const selected = selectedId === descriptor.tableKey
        const liveCoverCount = Math.max(0, parseInt(coverCountByTable?.[descriptor.tableKey], 10) || 0)

        return (
          <button
            key={descriptor.tableKey}
            type="button"
            onClick={() => onTableClick(table)}
            style={{
              minHeight: 112,
              borderRadius: 18,
              border: `1px solid ${selected ? 'rgba(251,191,36,.48)' : 'rgba(148,163,184,.16)'}`,
              background: selected ? 'rgba(251,191,36,.12)' : 'rgba(15,23,42,.52)',
              boxShadow: `0 10px 24px ${statusMeta.color}22`,
              padding: 14,
              cursor: 'pointer',
              textAlign: 'left',
              display: 'grid',
              gap: 10,
              opacity: occupied ? 1 : 0.86,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ color: '#fff', fontWeight: 900, fontSize: '.95rem' }}>{descriptor.label}</span>
              <span style={{
                width: 12,
                height: 12,
                borderRadius: 999,
                background: statusMeta.color,
                boxShadow: `0 0 0 4px ${statusMeta.color}22`,
                flexShrink: 0,
              }} />
            </div>
            <div style={{ color: 'rgba(191,219,254,.74)', fontSize: '.78rem', fontWeight: 700 }}>
              {table.table_type === 'square' ? 'Kare' : 'Yuvarlak'} / {table.capacity || '-'} kisilik
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ color: '#f8fafc', fontSize: '.76rem', fontWeight: 800 }}>
                Kuver: {liveCoverCount}
              </span>
              <span style={{
                borderRadius: 999,
                padding: '4px 8px',
                background: `${statusMeta.color}22`,
                color: statusMeta.color,
                fontSize: '.72rem',
                fontWeight: 900,
              }}>
                {statusMeta.label}
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}