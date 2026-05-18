export function getTheme() {
  return localStorage.getItem('rms_theme') || 'light'
}

export function setTheme(theme) {
  localStorage.setItem('rms_theme', theme)
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark')
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
}

export function toggleTheme() {
  setTheme(getTheme() === 'light' ? 'dark' : 'light')
}

export function initTheme() {
  const saved = localStorage.getItem('rms_theme')
  const theme = saved === 'dark' ? 'dark' : 'light'
  setTheme(theme)
}
