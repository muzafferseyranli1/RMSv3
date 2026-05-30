import React, { useState, useEffect } from 'react'
import { isDesktopMode } from '@/lib/terminalIdentity'

export default function GlobalUpdaterNotification() {
  const [updateInfo, setUpdateInfo] = useState(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const isDesktop = isDesktopMode()

  useEffect(() => {
    if (!isDesktop || !window.electronAPI || !window.electronAPI.onUpdateReady) {
      return
    }

    // Subscribe to update:ready IPC event
    const unsubscribe = window.electronAPI.onUpdateReady((info) => {
      console.log('[Updater] Update is ready to install:', info)
      setUpdateInfo(info)
    })

    return () => {
      unsubscribe()
    }
  }, [isDesktop])

  if (!isDesktop || !updateInfo) return null

  const handleApplyUpdate = async () => {
    if (isUpdating) return
    setIsUpdating(true)
    try {
      if (window.electronAPI && window.electronAPI.applyUpdate) {
        await window.electronAPI.applyUpdate()
      }
    } catch (err) {
      console.error('[Updater] Failed to apply update:', err)
      setIsUpdating(false)
    }
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      left: 24,
      zIndex: 9998,
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.98))',
      border: '1px solid rgba(99, 102, 241, 0.4)', // Subtle indigo border
      borderRadius: 16,
      padding: '16px 20px',
      color: '#fff',
      boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4), 0 0 20px rgba(99, 102, 241, 0.15)', // Indigo glow
      backdropFilter: 'blur(12px)',
      fontFamily: "'Inter', sans-serif",
      maxWidth: 420,
      animation: 'slideUpGlow 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
    }}>
      {/* Dynamic Keyframes injected style */}
      <style>{`
        @keyframes slideUpGlow {
          from {
            transform: translateY(30px) scale(0.95);
            opacity: 0;
          }
          to {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
        }
        @keyframes pulseGlow {
          0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.4); }
          70% { transform: scale(1.05); box-shadow: 0 0 0 10px rgba(99, 102, 241, 0); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
        }
      `}</style>

      <div style={{
        width: 42,
        height: 42,
        borderRadius: 12,
        background: 'rgba(99, 102, 241, 0.15)',
        border: '1px solid rgba(99, 102, 241, 0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '1.25rem',
        color: '#818cf8',
        flexShrink: 0,
        animation: 'pulseGlow 2s infinite',
      }}>
        {isUpdating ? (
          <i className="fa-solid fa-spinner fa-spin" />
        ) : (
          <i className="fa-solid fa-cloud-arrow-down" />
        )}
      </div>

      <div style={{ flexGrow: 1, minWidth: 0 }}>
        <h4 style={{ margin: '0 0 4px 0', fontSize: '0.95rem', fontWeight: 600, color: '#f8fafc' }}>
          Yeni Güncelleme Hazır!
        </h4>
        <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Sürüm v{updateInfo.version} indirilip hazırlandı.
        </p>
      </div>

      <button
        onClick={handleApplyUpdate}
        disabled={isUpdating}
        style={{
          padding: '8px 14px',
          background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
          border: 'none',
          borderRadius: 10,
          color: '#fff',
          fontWeight: 600,
          fontSize: '0.85rem',
          cursor: isUpdating ? 'not-allowed' : 'pointer',
          boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
          transition: 'all 0.2s',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          if (!isUpdating) {
            e.currentTarget.style.transform = 'translateY(-1px)'
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(99, 102, 241, 0.4)'
          }
        }}
        onMouseLeave={(e) => {
          if (!isUpdating) {
            e.currentTarget.style.transform = 'none'
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(99, 102, 241, 0.3)'
          }
        }}
      >
        {isUpdating ? 'Yükleniyor...' : 'Güncelle ve Yeniden Başlat'}
      </button>
    </div>
  )
}
