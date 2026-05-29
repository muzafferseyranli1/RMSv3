const { autoUpdater } = require('electron-updater')

function initAutoUpdater(mainWindow) {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update:available', info)
  })

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('update:ready', info)
  })

  autoUpdater.on('error', (err) => {
    console.error('[Updater]', err.message)
  })

  // GitHub Releases — repo ve owner uygulamaya göre ayarlanacak
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'muzafferseyranli1',
    repo: 'RMSv3',
    private: false,
  })

  // Uygulama açılışında bir kez kontrol et
  autoUpdater.checkForUpdates().catch(err => {
    console.warn('[Updater] Check failed:', err.message)
  })
}

module.exports = { initAutoUpdater, autoUpdater }
