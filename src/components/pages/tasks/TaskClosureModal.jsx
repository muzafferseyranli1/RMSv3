import { useState } from 'react'
import Modal from '@/components/ui/Modal'

export default function TaskClosureModal({ open, task, onClose, onSubmit }) {
  const [summary, setSummary] = useState('')
  const [files, setFiles] = useState([])
  const [images, setImages] = useState([])

  async function handleSubmit() {
    await onSubmit({ summary, files, images })
    setSummary('')
    setFiles([])
    setImages([])
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Gorevi Tamamla"
      subtitle="Kapanis kurallarina gore gorev kapanis bilgilerini gonder."
      footer={(
        <>
          <button type="button" className="btn-o" onClick={onClose}>Vazgec</button>
          <button type="button" className="btn-p" onClick={handleSubmit}>Gonder</button>
        </>
      )}
    >
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{ fontSize: '.78rem', color: '#475569', lineHeight: 1.5 }}>
          {task?.approval_required ? 'Bu gorev kapanis onayina dusecek.' : 'Bu gorev dogrudan tamamlanacak.'}
        </div>
        <div>
          <label className="f-label">Kapanis Ozeti</label>
          <textarea
            className="f-input"
            rows={5}
            value={summary}
            onChange={event => setSummary(event.target.value)}
            placeholder="Yapilan isi kisaca yaz..."
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label className="f-label">Kapanis Dosyalari</label>
            <input type="file" className="f-input" multiple onChange={event => setFiles(Array.from(event.target.files || []))} />
          </div>
          <div>
            <label className="f-label">Kapanis Fotograflari</label>
            <input type="file" className="f-input" multiple accept="image/png,image/jpeg,image/webp" onChange={event => setImages(Array.from(event.target.files || []))} />
          </div>
        </div>
      </div>
    </Modal>
  )
}
