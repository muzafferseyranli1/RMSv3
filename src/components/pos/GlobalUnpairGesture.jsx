import React, { useState, useEffect, useRef } from 'react'

export default function GlobalUnpairGesture() {
  const [clickCount, setClickCount] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)
  const [queueSize, setQueueSize] = useState(null)
  const [loading, setLoading] = useState(false)
  const timerRef = useRef(null)

  const isDesktop = typeof window !== 'undefined' && window.__DESKTOP_MODE__

  useEffect(() => {
    if (clickCount > 0) {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        setClickCount(0)
      }, 2500) // 2.5 saniye içinde 5 tıklama yapılmalı
    }
  }, [clickCount])

  const handleClick = async () => {
    if (!isDesktop) return
    const newCount = clickCount + 1
    if (newCount >= 5) {
      setClickCount(0)
      if (timerRef.current) clearTimeout(timerRef.current)
      await openModal()
    } else {
      setClickCount(newCount)
    }
  }

  const openModal = async () => {
    setModalOpen(true)
    setLoading(true)
    try {
      if (window.electronAPI && window.electronAPI.getQueueSize) {
        const size = await window.electronAPI.getQueueSize()
        setQueueSize(size || 0)
      } else {
        setQueueSize(0)
      }
    } catch (err) {
      console.error('Kuyruk okunamadi:', err)
      setQueueSize(0)
    } finally {
      setLoading(false)
    }
  }

  const handleUnpair = async () => {
    if (queueSize > 0) return // Güvenlik kontrolü
    if (window.electronAPI && window.electronAPI.saveTerminalConfig) {
      await window.electronAPI.saveTerminalConfig({})
      window.location.reload()
    }
  }

  if (!isDesktop) return null

  return (
    <>
      {/* Gizli tetikleyici alan */}
      <div
        onClick={handleClick}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: 60,
          height: 60,
          zIndex: 9998,
          cursor: 'default',
          background: 'transparent',
        }}
      />

      {/* Modal */}
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
            maxWidth: 440,
            color: '#fff',
            boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
            fontFamily: "'Inter', sans-serif"
          }}>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '1.4rem', color: '#f8fafc' }}>
              Cihaz Eşleşmesini Kaldır
            </h2>

            {loading ? (
              <div style={{ padding: '20px 0', textAlign: 'center', color: '#94a3b8' }}>
                Senkronizasyon durumu kontrol ediliyor...
              </div>
            ) : (
              <>
                {queueSize > 0 ? (
                  <div style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    padding: 16,
                    borderRadius: 12,
                    marginBottom: 24,
                  }}>
                    <div style={{ color: '#fca5a5', fontWeight: 'bold', marginBottom: 8 }}>
                      İşlem Durduruldu
                    </div>
                    <div style={{ color: '#fee2e2', fontSize: '0.9rem', lineHeight: 1.5 }}>
                      Cihazda merkeze aktarılmayı bekleyen <strong>{queueSize} adet</strong> çevrimdışı işlem (fiş) bulunuyor. Veri kaybını önlemek için şu an eşleşme kaldırılamaz. Lütfen cihaz internete/ana kasaya bağlanana kadar bekleyin.
                    </div>
                  </div>
                ) : (
                  <div style={{
                    background: 'rgba(234, 179, 8, 0.1)',
                    border: '1px solid rgba(234, 179, 8, 0.3)',
                    padding: 16,
                    borderRadius: 12,
                    marginBottom: 24,
                  }}>
                    <div style={{ color: '#fef08a', fontSize: '0.9rem', lineHeight: 1.5 }}>
                      Senkronize edilmemiş veri yok. Bu cihazın donanım kimliğini silmek üzeresiniz. Onayladığınızda uygulama eşleştirme (pairing) moduna dönecektir. Devam edilsin mi?
                    </div>
                  </div>
                )}

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
                  {queueSize === 0 && (
                    <button
                      onClick={handleUnpair}
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
                      Eşleşmeyi Kaldır
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
