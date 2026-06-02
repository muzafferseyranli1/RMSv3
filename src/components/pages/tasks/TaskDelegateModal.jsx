import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import SearchableSelect from '@/components/ui/SearchableSelect'

export default function TaskDelegateModal({ open, onClose, options = [], onSubmit }) {
  const [personnelId, setPersonnelId] = useState('')

  async function handleSubmit() {
    if (!personnelId) return
    await onSubmit(personnelId)
    setPersonnelId('')
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 4, height: 18, background: '#8b5cf6', borderRadius: 2 }}></span>
          <span>Delege Et</span>
        </div>
      }
      subtitle="Görevi başka bir personele yönlendir."
      footer={(
        <>
          <button type="button" className="btn-o" onClick={onClose}>Vazgeç</button>
          <button type="button" className="btn-p" onClick={handleSubmit} disabled={!personnelId}>Delege Et</button>
        </>
      )}
    >
      <div>
        <label className="f-label">Personel</label>
        <SearchableSelect
          value={personnelId}
          onChange={setPersonnelId}
          options={options}
          placeholder="Personel seçin..."
          searchPlaceholder="Personel ara..."
        />
      </div>
    </Modal>
  )
}
