import fs from 'node:fs'
import path from 'node:path'

const rootDir = process.cwd()
const scanDirs = ['src', '.vscode']
const scanFiles = ['README.md', 'index.html', 'package.json']
const allowedExtensions = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.css',
  '.html',
  '.json',
  '.md',
  '.sql',
])

const suspectRegex = /(Ã.|Å.|Ä.|â[\u0080-\u00BF]|ğŸ|�)/u

function collectFiles(startPath, results = []) {
  if (!fs.existsSync(startPath)) return results
  const stat = fs.statSync(startPath)
  if (stat.isFile()) {
    if (allowedExtensions.has(path.extname(startPath).toLowerCase())) {
      results.push(startPath)
    }
    return results
  }

  for (const entry of fs.readdirSync(startPath, { withFileTypes: true })) {
    const fullPath = path.join(startPath, entry.name)
    if (entry.isDirectory()) {
      collectFiles(fullPath, results)
      continue
    }
    if (allowedExtensions.has(path.extname(entry.name).toLowerCase())) {
      results.push(fullPath)
    }
  }

  return results
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const findings = []
  const lines = content.split(/\r?\n/)

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!suspectRegex.test(line)) continue
    findings.push({
      filePath,
      lineNumber: index + 1,
      line: line.trim().slice(0, 200),
    })
  }

  return findings
}

const files = [
  ...scanDirs.flatMap(dir => collectFiles(path.join(rootDir, dir))),
  ...scanFiles.map(file => path.join(rootDir, file)).filter(fs.existsSync),
]

const findings = files.flatMap(scanFile)

if (findings.length === 0) {
  console.log('No mojibake markers found.')
  process.exit(0)
}

console.error('Possible encoding issues found:\n')
for (const finding of findings) {
  const relativePath = path.relative(rootDir, finding.filePath)
  console.error(`${relativePath}:${finding.lineNumber} ${finding.line}`)
}

process.exit(1)
