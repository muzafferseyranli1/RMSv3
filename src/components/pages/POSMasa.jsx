import { useNavigate } from 'react-router-dom'
import TableManagementModal from '@/components/pos/TableManagementModal'
import { useWorkspace } from '@/context/WorkspaceContext'

export default function POSMasa() {
  const navigate = useNavigate()
  const { branchId, branchName } = useWorkspace()

  return (
    <TableManagementModal
      open
      embedded
      branchId={branchId}
      branchName={branchName}
      onClose={() => navigate('/garson')}
    />
  )
}
