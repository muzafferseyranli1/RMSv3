import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { db } from '@/lib/db'
import QueueScreen from '@/components/pages/QueueScreen'

// We create a mock WorkspaceContext Provider by importing the context directly.
import { WorkspaceProvider } from '@/context/WorkspaceContext'

export default function PublicQueueScreen() {
  const { code } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [branchId, setBranchId] = useState(null)

  useEffect(() => {
    async function loadTerminal() {
      if (!code) {
        setError('Aktivasyon kodu bulunamadı.')
        setLoading(false)
        return
      }

      try {
        const { data, error } = await db
          .from('pos_terminals')
          .select('branch_id')
          .eq('activation_code', code)
          .single()

        if (error || !data) {
          setError('Cihaz bulunamadı veya aktivasyon kodu geçersiz.')
          return
        }

        setBranchId(data.branch_id)
      } catch (err) {
        setError(err.message || 'Bir hata oluştu.')
      } finally {
        setLoading(false)
      }
    }
    loadTerminal()
  }, [code])

  if (loading) {
    return (
      <div style={{ width: '100vw', height: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 20 }}>
        Cihaz bilgileri yükleniyor...
      </div>
    )
  }

  if (error || !branchId) {
    return (
      <div style={{ width: '100vw', height: '100vh', background: '#0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#ef4444', fontSize: 20 }}>
        <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: 48, marginBottom: 16 }} />
        <div>{error}</div>
      </div>
    )
  }

  // We use WorkspaceProvider with forcedBranchId to simulate the branch scope
  // QueueScreen only needs branchId and branchName from useWorkspace()
  return (
    <WorkspaceProvider forcedBranchId={branchId} forcedScope="branch">
      <QueueScreen />
    </WorkspaceProvider>
  )
}
