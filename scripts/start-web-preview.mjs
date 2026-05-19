import { spawn } from 'node:child_process'

const port = String(process.env.PORT || '4173')
const host = process.env.HOST || '0.0.0.0'
const isWindows = process.platform === 'win32'
const command = isWindows ? 'npx.cmd' : 'npx'
const args = ['vite', 'preview', '--host', host, '--port', port]

const child = spawn(command, args, {
  stdio: 'inherit',
  shell: false,
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})

child.on('error', (error) => {
  console.error('Frontend preview baslatilamadi:', error?.message || error)
  process.exit(1)
})
