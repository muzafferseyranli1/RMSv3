export function isPublicDisplayPath(pathname = '') {
  const path = String(pathname || '')
  return (
    path === '/kiosk' ||
    path === '/kiosk-big' ||
    path === '/kiosk-tablet' ||
    path.startsWith('/kiosk/') ||
    path.startsWith('/kiosk-link/') ||
    path === '/mobil-app/qr-menu' ||
    path === '/pos-loyalty-link' ||
    path.startsWith('/pos-loyalty-link/') ||
    path === '/kds' ||
    path.startsWith('/kds/') ||
    path === '/pickup' ||
    path.startsWith('/pickup/') ||
    path === '/queue' ||
    path.startsWith('/queue/') ||
    path.startsWith('/sira-ekrani/') ||
    path.startsWith('/anket/')
  )
}
