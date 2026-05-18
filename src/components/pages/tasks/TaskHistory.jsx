export default function TaskHistory({ history = [], peopleById }) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {history.length === 0 ? (
        <div style={{ fontSize: '.82rem', color: '#94a3b8' }}>Henuz history kaydi yok.</div>
      ) : history.map(entry => {
        const person = peopleById.get(String(entry.performed_by || ''))
        return (
          <div key={entry.id} style={{ borderLeft: '2px solid #dbeafe', paddingLeft: 12 }}>
            <div style={{ fontSize: '.82rem', fontWeight: 700, color: '#0f172a' }}>
              {entry.action}
            </div>
            <div style={{ marginTop: 3, fontSize: '.74rem', color: '#64748b' }}>
              {[person?.firstName, person?.lastName].filter(Boolean).join(' ') || 'Sistem'} · {new Date(entry.created_at).toLocaleString('tr-TR')}
            </div>
            {entry.metadata?.reason && (
              <div style={{ marginTop: 4, fontSize: '.76rem', color: '#475569' }}>{entry.metadata.reason}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}
