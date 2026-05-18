export default function Placeholder({ title, icon }) {
  return (
    <div className="empty" style={{ minHeight: '60vh' }}>
      <i className={`fa-solid ${icon || 'fa-clock'}`} />
      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#334155' }}>{title}</div>
      <p style={{ fontSize: '.85rem' }}>Bu modül yakında eklenecek.</p>
    </div>
  )
}
