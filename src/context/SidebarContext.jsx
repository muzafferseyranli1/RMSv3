import { createContext, useContext, useEffect, useState } from 'react'

const SidebarContext = createContext(null)

function detectMode() {
  const w = window.innerWidth
  if (w > 1280) return 'full'
  if (w >= 768) return 'icon'
  return 'closed'
}

export function SidebarProvider({ children }) {
  const [autoMode, setAutoMode] = useState(detectMode)
  const [pinned, setPinned] = useState(() => localStorage.getItem('rms_sidebar_pin') || null)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onResize = () => {
      const m = detectMode()
      setAutoMode(m)
      if (m === 'closed') setMobileOpen(false)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const mode = pinned && autoMode !== 'closed' ? pinned : autoMode
  const isPinned = pinned === 'full'
  const sidebarWidth = mode === 'full' ? 220 : mode === 'icon' ? 48 : 0

  useEffect(() => {
    document.documentElement.setAttribute('data-sidebar-mode', mode)
  }, [mode])

  const togglePin = () => {
    const current = pinned || autoMode
    const next = current === 'full' ? 'icon' : 'full'
    const newPin = next === autoMode ? null : next
    setPinned(newPin)
    if (newPin) localStorage.setItem('rms_sidebar_pin', newPin)
    else localStorage.removeItem('rms_sidebar_pin')
  }

  return (
    <SidebarContext.Provider value={{ mode, autoMode, sidebarWidth, mobileOpen, setMobileOpen, pinned, isPinned, togglePin }}>
      {children}
    </SidebarContext.Provider>
  )
}

export const useSidebar = () => useContext(SidebarContext)
