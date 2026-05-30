import React, { useState } from 'react'
import { isDesktopMode } from '@/lib/terminalIdentity'

export default function GlobalExitButton() {
  const [modalOpen, setModalOpen] = useState(false)
  const isDesktop = isDesktopMode()

  if (!isDesktop) return null

  const handleExit = () => {
    if (window.electronAPI && window.electronAPI.exitApp) {
      window.electronAPI.exitApp()
    }
  }

  const handleMinimize = () => {
    if (window.electronAPI && window.electronAPI.minimizeApp) {
      window.electronAPI.minimizeApp()
    }
  }

  return (
    <>
      <div style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        display: 'flex',
        gap: 8,
        zIndex: 9998,
      }}>
        <button
          onClick={handleMinimize}
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            color: '#cbd5e1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            transition: 'all 0.2s',
            fontSize: '1.2rem'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'
            e.currentTarget.style.transform = 'scale(1.05)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
            e.currentTarget.style.transform = 'scale(1)'
          }}
          title="Simge Durumuna Küçült"
        >
          <i className="fa-solid fa-minus" />
        </button>

        <button
          onClick={() => setModalOpen(true)}
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#f87171',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            transition: 'all 0.2s',
            fontSize: '1.2rem'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)'
            e.currentTarget.style.transform = 'scale(1.05)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'
            e.currentTarget.style.transform = 'scale(1)'
          }}
          title="Uygulamadan Çık"
        >
          <i className="fa-solid fa-xmark" />
        </button>
      </div>

      {modalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(2, 6, 23, 0.85)',
          backdropFilter: 'blur(4px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20
        }}>
          <div style={{
            background: '#0f172a',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 20,
            padding: '32px',
            width: '100%',
            maxWidth: 400,
            color: '#fff',
            boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
            fontFamily: "'Inter', sans-serif"
          }}>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '1.4rem', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 12 }}>
              <i className="fa-solid fa-circle-exclamation" style={{ color: '#fbbf24' }} />
              Uygulamadan Çık
            </h2>

            <div style={{
              background: 'rgba(51, 65, 85, 0.4)',
              border: '1px solid rgba(71, 85, 105, 0.4)',
              padding: 16,
              borderRadius: 12,
              marginBottom: 24,
            }}>
              <div style={{ color: '#cbd5e1', fontSize: '0.95rem', lineHeight: 1.6 }}>
                Uygulamayı kapatmak istediğinize emin misiniz?
                <br /><br />
                <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                  Çevrimdışı bekleyen işlemleriniz (fişleriniz) ve kaydedilmiş verileriniz korunacak, uygulamayı yeniden açtığınızda kaldığı yerden devam edecektir.
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setModalOpen(false)}
                style={{
                  padding: '10px 16px',
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 10,
                  color: '#e2e8f0',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Vazgeç
              </button>
              <button
                onClick={handleExit}
                style={{
                  padding: '10px 20px',
                  background: '#ef4444',
                  border: 'none',
                  borderRadius: 10,
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Evet, Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
