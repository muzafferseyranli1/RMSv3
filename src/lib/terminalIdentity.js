// Electron IPC üzerinden terminal config'i renderer'a aktaran bridge.
// Electron ortamında window.__ELECTRON_TERMINAL_CONFIG__ inject edilir (main.cjs'de).
// Web/dev ortamında sessionStorage fallback kullanılır.

const CACHE_KEY = 'suitable_terminal_config_v1'

export function readTerminalConfig() {
  try {
    if (typeof window === 'undefined') return null
    if (window.electronAPI?.getConfigSync) {
      const cfg = window.electronAPI.getConfigSync()
      if (cfg) return cfg
    }
    if (window.__ELECTRON_TERMINAL_CONFIG__) return window.__ELECTRON_TERMINAL_CONFIG__
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function getTerminalId() {
  return readTerminalConfig()?.terminalId ?? null
}

export function getBranchId() {
  return readTerminalConfig()?.branchId ?? null
}

export function getTerminalRole() {
  // 'master' | 'slave' | null
  return readTerminalConfig()?.terminalRole ?? null
}

export function isMasterTerminal() {
  return getTerminalRole() === 'master'
}

export function getSlaveConfig() {
  const cfg = readTerminalConfig()
  if (cfg?.terminalRole !== 'slave') return null
  return {
    masterIp: cfg.masterLanIp,
    masterPort: Number(cfg.masterLanPort) || 4000,
  }
}

export function getScreenMode() {
  return readTerminalConfig()?.screenMode ?? 'pos'
}

export function getTerminalConfigData() {
  return readTerminalConfig()?.configData ?? {}
}

export function getStartupPath() {
  const PATHS = {
    pos: '/pos',
    garson: '/garson',
    'pos-masa': '/pos-masa',
    'pos-masalar': '/pos-masalar',
    kds: '/kds',
    pickup: '/pickup',
  }
  return PATHS[getScreenMode()] ?? '/pos'
}

export function isDesktopMode() {
  return Boolean(
    typeof window !== 'undefined' &&
    (window.electronAPI || window.__ELECTRON_TERMINAL_CONFIG__ || window.__DESKTOP_MODE__ === true)
  )
}

const TERMINAL_TRACKED_TABLES = new Set([
  'sales',
  'sale_lines',
  'inventory_movements',
])

export function injectTerminalFields(tableName, data) {
  const terminalId = getTerminalId()
  if (!terminalId) return data
  if (!TERMINAL_TRACKED_TABLES.has(tableName)) return data

  if (Array.isArray(data)) {
    return data.map(row => ({ ...row, created_by_terminal: terminalId }))
  }
  return { ...data, created_by_terminal: terminalId }
}

