const BROKEN_TURKISH_PATTERN = /[\u00C3\u0192\u00C2\u00E2\u00C4\u00C5]/

function decodeUtf8Once(input) {
  if (typeof TextDecoder === 'undefined') return input
  try {
    const bytes = Uint8Array.from(Array.from(input), char => char.charCodeAt(0) & 0xff)
    return new TextDecoder('utf-8').decode(bytes)
  } catch {
    return input
  }
}

export function repairTurkishText(value = '') {
  const text = String(value ?? '')
  if (!text || !BROKEN_TURKISH_PATTERN.test(text)) return text

  let current = text
  for (let pass = 0; pass < 3; pass += 1) {
    const next = decodeUtf8Once(current)
    if (!next || next === current) break
    const currentScore = (current.match(BROKEN_TURKISH_PATTERN) || []).length
    const nextScore = (next.match(BROKEN_TURKISH_PATTERN) || []).length
    if (nextScore > currentScore) break
    current = next
    if (!BROKEN_TURKISH_PATTERN.test(current)) break
  }

  return current
}

export function displayText(value = '', fallback = '') {
  const repaired = repairTurkishText(value)
  if (repaired) return repaired
  return repairTurkishText(fallback)
}
