const shellStyle = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  background: 'linear-gradient(135deg,#0f172a 0%,#1e293b 48%,#334155 100%)',
}

const cardStyle = {
  width: 'min(460px, 100%)',
  borderRadius: 28,
  padding: 32,
  background: 'rgba(248,250,252,.98)',
  border: '1px solid rgba(148,163,184,.24)',
  boxShadow: '0 28px 90px rgba(15,23,42,.34)',
}

const primaryButtonStyle = {
  width: '100%',
  border: 'none',
  borderRadius: 16,
  padding: '14px 18px',
  background: '#0f172a',
  color: '#fff',
  fontWeight: 800,
  fontSize: '.95rem',
  cursor: 'pointer',
}

const secondaryButtonStyle = {
  ...primaryButtonStyle,
  background: '#fff',
  color: '#0f172a',
  border: '1px solid #cbd5e1',
}

export function AuthLoadingScreen() {
  return (
    <div style={shellStyle}>
      <div style={{ ...cardStyle, textAlign: 'center' }}>
        <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>
          <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 10 }} />
          Oturum kontrol ediliyor
        </div>
        <div style={{ color: '#64748b', lineHeight: 1.6 }}>
          Google oturumu ve erisim izinleri dogrulaniyor.
        </div>
      </div>
    </div>
  )
}

export function LoginPage({ loading, error, onLogin }) {
  return (
    <div style={shellStyle}>
      <div style={cardStyle}>
        <div style={{
          width: 52,
          height: 52,
          borderRadius: 16,
          background: 'linear-gradient(135deg,#e8521a,#fbbf24)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: '1.1rem',
          marginBottom: 18,
        }}>
          <i className="fa-solid fa-utensils" />
        </div>
        <div style={{ fontSize: '.74rem', fontWeight: 800, color: '#f97316', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 10 }}>
          SuitableRMS
        </div>
        <h1 style={{ margin: 0, fontSize: '1.9rem', color: '#0f172a', lineHeight: 1.1 }}>
          Uygulamaya Google ile giris yapin
        </h1>
        <p style={{ margin: '14px 0 0', color: '#475569', lineHeight: 1.7 }}>
          Anonim erisim kapatildi. Uygulamaya devam etmek icin izinli Google hesabi ile oturum acmaniz gerekir.
        </p>
        {error && (
          <div style={{
            marginTop: 18,
            borderRadius: 16,
            background: '#fef2f2',
            color: '#b91c1c',
            padding: '12px 14px',
            fontSize: '.88rem',
            lineHeight: 1.5,
          }}>
            {error}
          </div>
        )}
        <button type="button" onClick={onLogin} disabled={loading} style={{ ...primaryButtonStyle, marginTop: 24, opacity: loading ? 0.7 : 1 }}>
          {loading
            ? <><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} />Google yonlendiriliyor...</>
            : <><i className="fa-brands fa-google" style={{ marginRight: 8 }} />Google ile giris yap</>}
        </button>
      </div>
    </div>
  )
}

export function AccessDeniedPage({ email, error, onSignOut, loading }) {
  return (
    <div style={shellStyle}>
      <div style={cardStyle}>
        <div style={{
          width: 52,
          height: 52,
          borderRadius: 16,
          background: '#fef2f2',
          color: '#b91c1c',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.1rem',
          marginBottom: 18,
        }}>
          <i className="fa-solid fa-shield-halved" />
        </div>
        <h1 style={{ margin: 0, fontSize: '1.7rem', color: '#0f172a', lineHeight: 1.15 }}>
          Bu hesap icin erisim yok
        </h1>
        <p style={{ margin: '14px 0 0', color: '#475569', lineHeight: 1.7 }}>
          {email || 'Giris yapan hesap'} allowlist icinde olmadigi icin uygulama acilmadi.
        </p>
        <p style={{ margin: '10px 0 0', color: '#64748b', fontSize: '.9rem', lineHeight: 1.6 }}>
          Gerekirse yetkili listesine eklendikten sonra tekrar deneyin veya farkli bir Google hesabi ile giris yapin.
        </p>
        {error && (
          <div style={{
            marginTop: 18,
            borderRadius: 16,
            background: '#fff7ed',
            color: '#9a3412',
            padding: '12px 14px',
            fontSize: '.88rem',
            lineHeight: 1.5,
          }}>
            {error}
          </div>
        )}
        <button type="button" onClick={onSignOut} disabled={loading} style={{ ...secondaryButtonStyle, marginTop: 24 }}>
          {loading
            ? <><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} />Cikis yapiliyor...</>
            : <><i className="fa-solid fa-arrow-right-from-bracket" style={{ marginRight: 8 }} />Baska hesapla dene</>}
        </button>
      </div>
    </div>
  )
}
