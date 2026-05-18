export function getDisplayMode() {
  return localStorage.getItem('rms_display_mode') || 'auto'
}

export function setDisplayMode(mode) {
  localStorage.setItem('rms_display_mode', mode)
  document.documentElement.setAttribute('data-display-mode', mode)
}

export function initDisplayMode() {
  document.documentElement.setAttribute('data-display-mode', getDisplayMode())
}
