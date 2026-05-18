import { useState } from 'react'
import Modal from '@/components/ui/Modal'

export default function TaskSendBackModal({ open, onClose, onSubmit }) {
  const [reason, setReason] = useState('')

  async function handleSubmit() {
    await onSubmit(reason)
    setReason('')
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Geri Gonder"
      subtitle="Gerekce zorunludur."
      footer={(
        <>
          <button type="button" className="btn-o" onClick={onClose}>Vazgec</button>
          <button type="button" className="btn-p" onClick={handleSubmit} disabled={!reason.trim()}>Gonder</button>
        </>
      )}
    >
      <div>
        <label className="f-label">Gerekce</label>
        <textarea className="f-input" rows={5} value={reason} onChange={event => setReason(event.target.value)} />
      </div>
    </Modal>
  )
}
