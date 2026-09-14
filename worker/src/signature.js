// Finger signatures: integer strokes in a 600 × 200 box, drawn back as SVG built from the integers only. Pure.
export const SIG_W = 600
export const SIG_H = 200
export const MAX_STROKES = 50
export const MAX_POINTS = 4000
export const MIN_SPAN = 20
export const SIGNATURE_MESSAGE = 'Please sign with your finger.'

// → { w, h, strokes } when the signature is acceptable, else null.
export function parseSignature(sig) {
  if (!sig || typeof sig !== 'object' || Array.isArray(sig)) return null
  if (sig.w !== SIG_W || sig.h !== SIG_H) return null
  const { strokes } = sig
  if (!Array.isArray(strokes) || strokes.length < 1 || strokes.length > MAX_STROKES) return null
  let points = 0
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const s of strokes) {
    if (!Array.isArray(s) || s.length < 4 || s.length % 2 !== 0) return null
    for (let i = 0; i < s.length; i += 2) {
      const x = s[i]
      const y = s[i + 1]
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > SIG_W || y < 0 || y > SIG_H) return null
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
    points += s.length / 2
    if (points > MAX_POINTS) return null
  }
  if (maxX - minX < MIN_SPAN && maxY - minY < MIN_SPAN) return null
  return { w: SIG_W, h: SIG_H, strokes: strokes.map((s) => [...s]) }
}

// strokes (already validated integers) → the SVG string. Nothing but M, L, digits and spaces reaches the path.
export function signatureSvg(strokes) {
  const d = strokes.map((s) => {
    const pts = []
    for (let i = 0; i < s.length; i += 2) pts.push(`${i ? 'L' : 'M'}${Math.trunc(Number(s[i])) || 0} ${Math.trunc(Number(s[i + 1])) || 0}`)
    return pts.join(' ')
  }).join(' ')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIG_W} ${SIG_H}"><path d="${d}"/></svg>`
}
