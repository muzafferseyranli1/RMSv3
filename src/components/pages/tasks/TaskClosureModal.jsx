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
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 4, height: 18, background: '#10b981', borderRadius: 2 }}></span>
          <span>Görevi Tamamla</span>
        </div>
      }
      subtitle="Kapanış kurallarına göre görev kapanış bilgilerini gönder."
      footer={(
        <>
          <button type="button" className="btn-o" onClick={onClose}>Vazgeç</button>
          <button type="button" className="btn-p" onClick={handleSubmit}>Gönder</button>
        </>
      )}
    >
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{ fontSize: '.78rem', color: '#475569', lineHeight: 1.5 }}>
          {task?.approval_required ? 'Bu görev kapanış onayına düşecek.' : 'Bu görev doğrudan tamamlanacak.'}
        </div>
        <div>
          <label className="f-label">Kapanış Özeti</label>
          <textarea
            className="f-input"
            rows={5}
            value={summary}
            onChange={event => setSummary(event.target.value)}
            placeholder="Yapılan işi kısaca yaz..."
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label className="f-label">Kapanış Dosyaları</label>
            <input type="file" className="f-input" multiple onChange={event => setFiles(Array.from(event.target.files || []))} />
          </div>
          <div>
            <label className="f-label">Kapanış Fotoğrafları</label>
            <input type="file" className="f-input" multiple accept="image/png,image/jpeg,image/webp" onChange={event => setImages(Array.from(event.target.files || []))} />
          </div>
        </div>
      </div>
    </Modal>
  )
}
