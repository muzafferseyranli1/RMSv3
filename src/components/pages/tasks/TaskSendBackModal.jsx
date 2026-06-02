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
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 4, height: 18, background: '#ef4444', borderRadius: 2 }}></span>
          <span>Geri Gönder</span>
        </div>
      }
      subtitle="Gerekçe zorunludur."
      footer={(
        <>
          <button type="button" className="btn-o" onClick={onClose}>Vazgeç</button>
          <button type="button" className="btn-p" onClick={handleSubmit} disabled={!reason.trim()}>Gönder</button>
        </>
      )}
    >
      <div>
        <label className="f-label">Gerekçe</label>
        <textarea className="f-input" rows={5} value={reason} onChange={event => setReason(event.target.value)} />
      </div>
    </Modal>
  )
}
