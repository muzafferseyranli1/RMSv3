const { app, BrowserWindow, dialog, shell } = require('electron')
const fs = require('fs')
const http = require('http')
const path = require('path')

const DESKTOP_PORT = Number(process.env.DESKTOP_SERVER_PORT || 4173)
const HOST = '127.0.0.1'
const DIST_DIR = path.join(__dirname, '..', 'dist-desktop-web')
const INDEX_FILE_CANDIDATES = [
  path.join(DIST_DIR, 'desktop.html'),
  path.join(DIST_DIR, 'index.html'),
]

let mainWindow = null
let staticServer = null
let desktopBaseUrl = ''

function getMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase()

  switch (extension) {
    case '.css':
      return 'text/css; charset=utf-8'
    case '.js':
      return 'application/javascript; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.svg':
      return 'image/svg+xml'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.woff':
      return 'font/woff'
    case '.woff2':
      return 'font/woff2'
    case '.pdf':
      return 'application/pdf'
    case '.html':
    default:
      return 'text/html; charset=utf-8'
  }
}

function sendFile(response, filePath, statusCode = 200) {
  fs.readFile(filePath, (error, fileBuffer) => {
    if (error) {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('Desktop dosyalari okunamadi.')
      return
    }

    response.writeHead(statusCode, {
      'Content-Type': getMimeType(filePath),
      'Cache-Control': 'no-store',
    })
    response.end(fileBuffer)
  })
}

function resolveRequestPath(requestPath) {
  const normalizedPath = decodeURIComponent(requestPath.split('?')[0] || '/')
  const relativePath = normalizedPath.replace(/^\/+/, '')
  const absolutePath = path.normalize(path.join(DIST_DIR, relativePath))

  if (!absolutePath.startsWith(DIST_DIR)) return null
  return absolutePath
}

function createStaticServer() {
  return new Promise((resolve, reject) => {
    const indexFile = INDEX_FILE_CANDIDATES.find(filePath => fs.existsSync(filePath))

    if (!indexFile) {
      reject(new Error(`Desktop build bulunamadi: ${DIST_DIR}`))
      return
    }

    const server = http.createServer((request, response) => {
      if ((request.url || '').startsWith('/__desktop_ready')) {
        response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
        response.end('ok')
        return
      }

      const absolutePath = resolveRequestPath(request.url || '/')

      if (!absolutePath) {
        response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
        response.end('Erisim reddedildi.')
        return
      }

      fs.stat(absolutePath, (error, stats) => {
        if (!error && stats.isFile()) {
          sendFile(response, absolutePath)
          return
        }

        sendFile(response, indexFile)
      })
    })

    server.once('error', reject)
    server.listen(DESKTOP_PORT, HOST, () => {
      const baseUrl = `http://${HOST}:${DESKTOP_PORT}`
      desktopBaseUrl = baseUrl
      resolve({ server, baseUrl })
    })
  })
}

async function waitForServer(baseUrl, timeoutMs = 15000) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const isReady = await new Promise(resolve => {
      const request = http.get(`${baseUrl}/__desktop_ready`, response => {
        response.resume()
        resolve(response.statusCode === 200)
      })

      request.on('error', () => resolve(false))
      request.setTimeout(1500, () => {
        request.destroy()
        resolve(false)
      })
    })

    if (isReady) return

    await new Promise(resolve => setTimeout(resolve, 250))
  }

  throw new Error('Yerel desktop sunucusu zamaninda yanit vermedi.')
}

async function createWindow(baseUrl) {
  mainWindow = new BrowserWindow({
    width: 1460,
    height: 960,
    minWidth: 1200,
    minHeight: 760,
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#0f172a',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`http://${HOST}:${DESKTOP_PORT}`)) {
      shell.openExternal(url)
    }

    return { action: 'deny' }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  await waitForServer(baseUrl)
  await mainWindow.loadURL(`${baseUrl}/pos`)
}

app.whenReady().then(async () => {
  try {
    const serverState = await createStaticServer()
    staticServer = serverState.server
    await createWindow(serverState.baseUrl)
  } catch (error) {
    dialog.showErrorBox(
      'SuitableRMS POS baslatilamadi',
      error?.message || 'Desktop uygulamasi icin gerekli dosyalar hazir degil.',
    )
    app.quit()
  }
})

app.on('window-all-closed', () => {
  if (staticServer) {
    staticServer.close()
    staticServer = null
  }

  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0 && staticServer && desktopBaseUrl) {
    await createWindow(desktopBaseUrl)
  }
})
