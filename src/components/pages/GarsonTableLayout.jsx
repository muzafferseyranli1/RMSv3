import { useEffect, useState } from 'react'
import { useWorkspace } from '@/context/WorkspaceContext'
import { loadTableManagementCatalog } from '@/lib/posTableCatalogService'
import PosTableLayoutFromCatalog from '@/components/pos/PosTableLayoutFromCatalog'

export default function GarsonTableLayout({
  masaNo,
  selectedTableKey,
  occupiedTableKeys = [],
  coverCountByTable = {},
  tableSignalsByKey = {},
  onSelectTable,
}) {
  const { branchId } = useWorkspace()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [catalog, setCatalog] = useState({ halls: [], sections: [], tables: [] })

  useEffect(() => {
    if (!branchId) return
    let cancelled = false
    setLoading(true)
    setError('')
    loadTableManagementCatalog(branchId)
      .then(nextCatalog => {
        if (cancelled) return
        setCatalog(nextCatalog)
      })
      .catch(loadError => {
        if (!cancelled) setError(loadError?.message || 'Masa kataloğu yüklenemedi.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [branchId])

  if (error) {
    return (
      <div style={{
        minHeight: 220,
        borderRadius: 20,
        border: '1px solid rgba(248,113,113,.2)',
        background: 'rgba(127,29,29,.2)',
        display: 'grid',
        placeItems: 'center',
        color: '#fecaca',
        fontWeight: 800,
        padding: 20,
        textAlign: 'center',
      }}>
        {error}
      </div>
    )
  }

  return (
    <PosTableLayoutFromCatalog
      tableCatalog={catalog}
      tableCatalogLoading={loading}
      occupiedTableKeys={occupiedTableKeys}
      coverCountByTable={coverCountByTable}
      currentTableKey={selectedTableKey}
      onSelectTable={onSelectTable}
    />
  )
}
