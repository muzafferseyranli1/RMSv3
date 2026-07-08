export default function PinLoginScreen({
  title,
  subtitle,
  branchName,
  pin,
  error,
  loading = false,
  embedded = false,
  onPinChange,
  onSubmit,
  onClose,
}) {
  const keypad = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'sil', '0']
  const outerStyle = embedded
    ? {
        height: '100%',
        minHeight: 0,
        background: 'linear-gradient(180deg, #e0f2fe 0%, #f8fafc 42%, #eef2ff 100%)',
        display: 'grid',
        placeItems: 'center',
        padding: 14,
        overflowY: 'auto',
      }
    : {
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        background: 'radial-gradient(circle at top, rgba(30,41,99,.9), rgba(3,7,30,.98))',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }

  const cardStyle = embedded
    ? {
        width: '100%',
        borderRadius: 28,
        border: '1px solid rgba(14,165,233,.16)',
        background: 'linear-gradient(180deg, rgba(15,23,42,.96), rgba(7,13,36,.98))',
        boxShadow: '0 18px 44px rgba(15,23,42,.20)',
        padding: 18,
        display: 'grid',
        gap: 14,
      }
    : {
        width: 'min(560px, 100%)',
        borderRadius: 28,
        border: '1px solid rgba(148,163,184,.18)',
        background: 'linear-gradient(180deg, rgba(15,23,42,.94), rgba(7,13,36,.98))',
        boxShadow: '0 30px 90px rgba(2,6,23,.42)',
        padding: 28,
        display: 'grid',
        gap: 20,
      }

  return (
    <div className="pin-login-screen-overlay" style={outerStyle}>
      <div className="pin-login-screen-card" style={cardStyle}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div>
              <div className="pin-login-title-label" style={{ color: '#fbbf24', fontSize: '.75rem', fontWeight: 900, letterSpacing: '.14em', textTransform: 'uppercase' }}>
                Personel PIN
              </div>
              <div className="pin-login-title" style={{ color: '#fff', fontSize: embedded ? '1.15rem' : '1.5rem', fontWeight: 900, marginTop: 8 }}>
                {title}
              </div>
            </div>
            {typeof onClose === 'function' && (
              <button
                className="pin-login-close-btn"
                type="button"
                onClick={onClose}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 999,
                  border: '1px solid rgba(148,163,184,.2)',
                  background: 'rgba(15,23,42,.52)',
                  color: '#cbd5e1',
                  cursor: 'pointer',
                  fontSize: '1.1rem',
                  fontWeight: 900,
                }}
              >
                x
              </button>
            )}
          </div>
          <div className="pin-login-subtitle" style={{ color: '#94a3b8', lineHeight: 1.55, marginTop: 8, fontSize: embedded ? '.78rem' : '1rem' }}>
            {subtitle}
          </div>
          {branchName && (
            <div className="pin-login-branch" style={{ color: '#7dd3fc', fontWeight: 800, marginTop: 10, fontSize: embedded ? '.8rem' : '1rem' }}>
              {branchName}
            </div>
          )}
        </div>

        <div className="pin-login-stars-display" style={{
          minHeight: embedded ? 56 : 72,
          borderRadius: 18,
          border: `1px solid ${error ? 'rgba(248,113,113,.42)' : 'rgba(251,191,36,.2)'}`,
          background: error ? 'rgba(127,29,29,.26)' : 'rgba(15,23,42,.68)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: embedded ? '1.45rem' : '1.9rem',
          fontWeight: 900,
          letterSpacing: '.24em',
        }}>
          {(pin || '').padEnd(4, '*')}
        </div>

        {error && (
          <div className="pin-login-error" style={{ color: '#fca5a5', fontSize: '.8rem', fontWeight: 700 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
          {keypad.map(key => (
            <button
              key={key}
              type="button"
              disabled={loading}
              onClick={() => {
                if (key === 'sil') {
                  onPinChange((pin || '').slice(0, -1))
                  return
                }
                onPinChange(`${pin || ''}${key}`)
              }}
              className={`pin-login-keypad-btn ${key === 'sil' ? 'btn-sil' : ''}`}
              style={{
                minHeight: embedded ? 48 : 58,
                borderRadius: 16,
                border: '1px solid rgba(148,163,184,.18)',
                background: key === 'sil' ? 'rgba(239,68,68,.14)' : 'rgba(30,41,59,.78)',
                color: key === 'sil' ? '#fca5a5' : '#fff',
                fontWeight: 900,
                fontSize: key === 'sil' ? '.9rem' : '1.15rem',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {key === 'sil' ? 'Sil' : key}
            </button>
          ))}
        </div>

        <button
          className="pin-login-submit-btn"
          type="button"
          disabled={loading || (pin || '').length < 4}
          onClick={onSubmit}
          style={{
            minHeight: embedded ? 50 : 56,
            borderRadius: 16,
            border: 'none',
            background: loading ? 'rgba(255,255,255,.12)' : 'linear-gradient(135deg,#f59e0b,#fbbf24)',
            color: loading ? 'rgba(255,255,255,.45)' : '#111827',
            fontWeight: 900,
            fontSize: '1rem',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Kontrol ediliyor...' : 'Giris Yap'}
        </button>
      </div>
    </div>
  )
}
