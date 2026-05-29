import React, { useEffect, useState } from 'react'
import { WifiOff, ServerCrash, RefreshCw } from 'lucide-react'

export default function OfflineStatusBar({
  isOnline,
  queueSize = 0,
  role = null,
  masterReachable = false,
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isSlave = role === 'slave'
  const isMasterReachable = !isSlave || masterReachable
  const isStable = isOnline && queueSize === 0 && isMasterReachable

  if (isStable) return null

  let bgColor = 'linear-gradient(90deg, #dc2626, #b91c1c)'
  let icon = <WifiOff size={16} style={{ color: '#fca5a5' }} />
  let message = `ÇEVRİMDIŞI MOD — ${queueSize} fiş senkronize edilecek`
  let isSyncing = false

  if (!isOnline) {
    bgColor = 'linear-gradient(90deg, #ef4444 0%, #dc2626 50%, #991b1b 100%)'
    icon = <WifiOff size={16} style={{ color: '#fee2e2' }} />
    message = `ÇEVRİMDIŞI MOD — ${queueSize} fiş senkronize edilecek`
  } else if (isSlave && !masterReachable) {
    bgColor = 'linear-gradient(90deg, #f97316 0%, #ea580c 50%, #c2410c 100%)'
    icon = <ServerCrash size={16} style={{ color: '#ffedd5' }} />
    message = "Ana Kasa'ya bağlanılamıyor — Önbellek modu"
  } else if (queueSize > 0 && isOnline) {
    bgColor = 'linear-gradient(90deg, #eab308 0%, #ca8a04 50%, #854d0e 100%)'
    icon = <RefreshCw size={16} className="osb-spin-icon" style={{ color: '#fef9c3' }} />
    message = `Senkronize ediliyor... ${queueSize} fiş kaldı`
    isSyncing = true
  }

  return (
    <>
      <style>{`
        @keyframes osb-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes osb-pulse {
          0%, 100% { opacity: 1; transform: scale(1); box-shadow: 0 0 8px currentColor; }
          50% { opacity: 0.4; transform: scale(0.85); box-shadow: 0 0 2px currentColor; }
        }
        .osb-spin-icon {
          animation: osb-spin 2s linear infinite;
        }
        .osb-pulse-dot {
          width: 8px;
          height: 8px;
          background-color: currentColor;
          border-radius: 50%;
          display: inline-block;
          animation: osb-pulse 1.8s infinite ease-in-out;
        }
        .osb-bar-container {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 9999;
          display: flex;
          align-items: center;
          justifyContent: center;
          height: 38px;
          padding: 0 16px;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 13px;
          font-weight: 700;
          color: #ffffff;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25), inset 0 -1px 0 rgba(255, 255, 255, 0.15);
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
          transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
          letter-spacing: 0.02em;
        }
      `}</style>
      <div 
        className="osb-bar-container"
        style={{
          background: bgColor,
          transform: mounted ? 'translateY(0)' : 'translateY(-100%)',
          opacity: mounted ? 1 : 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span 
            className={isSyncing ? '' : 'osb-pulse-dot'} 
            style={{ 
              color: isOnline ? (isSlave && !masterReachable ? '#ffedd5' : '#fef9c3') : '#fee2e2',
              display: isSyncing ? 'none' : 'inline-block'
            }} 
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {icon}
          </div>
          <span>{message}</span>
        </div>
      </div>
    </>
  )
}
