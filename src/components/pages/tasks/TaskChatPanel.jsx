import { useState } from 'react'

export default function TaskChatPanel({ messages = [], peopleById, onSend }) {
  const [body, setBody] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    const trimmed = body.trim()
    if (!trimmed) return
    const result = await onSend(trimmed)
    if (!result?.error) setBody('')
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gap: 8, maxHeight: 280, overflowY: 'auto', paddingRight: 6 }}>
        {messages.length === 0 ? (
          <div style={{ fontSize: '.82rem', color: '#94a3b8' }}>Henuz mesaj yok.</div>
        ) : messages.map(message => {
          const isSystem = message.message_type === 'system'
          const person = peopleById.get(String(message.sender_id || ''))
          return (
            <div key={message.id} style={{
              justifySelf: isSystem ? 'stretch' : 'start',
              padding: isSystem ? '8px 10px' : '10px 12px',
              borderRadius: 12,
              background: isSystem ? '#f8fafc' : '#eff6ff',
              color: isSystem ? '#64748b' : '#0f172a',
              fontSize: '.8rem',
              border: `1px solid ${isSystem ? '#e2e8f0' : '#bfdbfe'}`,
            }}>
              {!isSystem && (
                <div style={{ fontSize: '.7rem', fontWeight: 800, color: '#2563eb', marginBottom: 4 }}>
                  {[person?.firstName, person?.lastName].filter(Boolean).join(' ') || 'Personel'}
                </div>
              )}
              <div>{message.body || '-'}</div>
            </div>
          )
        })}
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8 }}>
        <input
          className="f-input"
          value={body}
          onChange={event => setBody(event.target.value)}
          placeholder="Mesaj yaz..."
        />
        <button type="submit" className="btn-p">
          <i className="fa-solid fa-paper-plane" /> Gonder
        </button>
      </form>
    </div>
  )
}
