const { app } = require('electron')
const fs = require('fs')
const path = require('path')

const CONFIG_FILE = path.join(app.getPath('userData'), 'terminal-config.json')

function readConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return null
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
  } catch { return null }
}

function writeConfig(data) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf8')
}

function isPaired() {
  const cfg = readConfig()
  return Boolean(cfg?.terminalId && cfg?.branchId && cfg?.terminalRole && cfg?.screenMode)
}

function isMaster() {
  return readConfig()?.terminalRole === 'master'
}

// 'pos' | 'garson' | 'pos-masa' | 'pos-masalar'
function getScreenMode() {
  return readConfig()?.screenMode ?? 'pos'
}

// Electron window.loadURL() için başlangıç rotası
function getStartupRoute() {
  const mode = String(getScreenMode() || 'pos').toLowerCase().trim()
  if (mode.includes('garson') || mode.includes('masa')) return '/garson'
  if (mode.includes('kds')) return '/kds'
  if (mode.includes('pickup')) return '/pickup'
  return '/pos'
}

module.exports = { readConfig, writeConfig, isPaired, isMaster, getScreenMode, getStartupRoute, CONFIG_FILE }
