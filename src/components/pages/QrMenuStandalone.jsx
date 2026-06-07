import React from 'react'

export default function QrMenuStandalone() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: '#0f172a',
      color: '#f8fafc',
      fontFamily: 'Outfit, Inter, system-ui, sans-serif',
      padding: 24,
      textAlign: 'center'
    }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
        maxWidth: 480,
        backgroundColor: '#1e293b',
        border: '1px solid #334155',
        borderRadius: 16,
        padding: '40px 32px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)'
      }}>
        <div style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 8
        }}>
          <i className="fa-solid fa-qrcode" style={{ fontSize: '2rem', color: '#f59e0b' }} />
        </div>
        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc' }}>
          Masadan Sipariş &amp; QR Menü
        </h2>
        <p style={{ margin: 0, fontSize: '0.9rem', color: '#94a3b8', lineHeight: 1.6 }}>
          Yapım Aşamasında
        </p>
      </div>
    </div>
  )
}
