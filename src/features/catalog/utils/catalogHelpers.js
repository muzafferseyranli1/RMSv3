export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export function getAllBranches(tree) {
  const result = []

  function walk(nodes) {
    for (const node of nodes || []) {
      if (node.type === 'sube') result.push({ id: node.id, name: node.name })
      walk(node.children || [])
    }
  }

  walk(tree)
  return result
}

export function resolveMask(mask) {
  if (!mask) return ''

  const now = new Date()
  const yyyy = String(now.getFullYear())

  return mask.toUpperCase()
    .replace(/YYYY/g, yyyy)
    .replace(/YY/g, yyyy.slice(2))
    .replace(/AA/g, String(now.getMonth() + 1).padStart(2, '0'))
    .replace(/GG/g, String(now.getDate()).padStart(2, '0'))
}

export function genSku(mask, appendType, appendLen) {
  const len = parseInt(appendLen) || 0
  if (!mask && (!appendType || !len)) return null

  const resolved = resolveMask(mask || '')
  let suffix = ''

  if (appendType && len > 0) {
    const pool = appendType === 'sayi'
      ? '0123456789'
      : appendType === 'harf'
        ? 'ABCDEFGHJKLMNPQRSTUVWXYZ'
        : '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'

    for (let i = 0; i < len; i++) {
      suffix += pool[Math.floor(Math.random() * pool.length)]
    }
  }

  return resolved + suffix || null
}

export function catAncestry(cats, id) {
  const chain = []
  let current = cats.find(cat => cat.id === id)

  while (current) {
    chain.unshift(current)
    current = current.parent_id ? cats.find(cat => cat.id === current.parent_id) : null
  }

  return chain
}
