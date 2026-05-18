import { useEffect, useRef, useState } from 'react'

const BASE_W = 1024
const BASE_H = 768

export default function ScreenFrame({ children }) {
  const outerRef = useRef(null)
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement)

  // ResizeObserver: window.resize fullscreen geçişlerinde güvenilir değil
  useEffect(() => {
    const el = outerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setSize({ w: Math.round(width), h: Math.round(height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(!!document.fullscreenElement)
      // Fullscreen boyut değişimini bir sonraki frame'de oku
      requestAnimationFrame(() => {
        setSize({ w: window.innerWidth, h: window.innerHeight })
      })
    }
    document.addEventListener('fullscreenchange', onFsChange)
    document.documentElement.requestFullscreen?.().catch(() => {})
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const scale = Math.min(size.w / BASE_W, size.h / BASE_H)
  const frameW = Math.round(BASE_W * scale)
  const frameH = Math.round(BASE_H * scale)
  const offsetX = Math.round((size.w - frameW) / 2)
  const offsetY = Math.round((size.h - frameH) / 2)

  return (
    <div
      ref={outerRef}
      style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}
    >
      {!isFullscreen && (
        <button
          type="button"
          onClick={() => document.documentElement.requestFullscreen?.()}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 9999,
            padding: '6px 14px',
            background: 'rgba(255,255,255,.18)',
            color: '#fff',
            border: '1px solid rgba(255,255,255,.3)',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: '.78rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <i className="fa-solid fa-expand" />
          Tam Ekran
        </button>
      )}
      <style>{`
        .sf-inner .touch-modal {
          max-width: min(980px, 96%) !important;
          max-height: min(720px, 96%) !important;
        }
      `}</style>
      <div
        className="sf-inner"
        style={{
          position: 'absolute',
          width: BASE_W,
          height: BASE_H,
          left: offsetX,
          top: offsetY,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  )
}
