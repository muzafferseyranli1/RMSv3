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
      title="Delege Et"
      subtitle="Gorevi baska bir personele yonlendir."
      footer={(
        <>
          <button type="button" className="btn-o" onClick={onClose}>Vazgec</button>
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
          placeholder="Personel secin..."
          searchPlaceholder="Personel ara..."
        />
      </div>
    </Modal>
  )
}
