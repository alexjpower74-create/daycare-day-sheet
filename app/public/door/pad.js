// The signature pad: Pointer Events with pointer capture, so a finger that slides off the edge keeps drawing. Ink is kept as
// integers in the API's 600 × 200 box whatever size the pad is on screen, and within the API's limits (50 strokes, 4 000 points).
export const BOX_W = 600
export const BOX_H = 200
export const MIN_SPAN = 20
const MAX_STROKES = 50
const MAX_POINTS = 4000

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

export function createPad(canvas, { onChange } = {}) {
  let strokes = []
  let current = null
  let points = 0
  const ctx = canvas.getContext('2d')

  const toBox = (e) => {
    const r = canvas.getBoundingClientRect()
    return [clamp(Math.round(((e.clientX - r.left) / r.width) * BOX_W), 0, BOX_W), clamp(Math.round(((e.clientY - r.top) / r.height) * BOX_H), 0, BOX_H)]
  }

  function redraw() {
    const r = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const w = Math.max(1, Math.round(r.width * dpr))
    const hgt = Math.max(1, Math.round(r.height * dpr))
    if (canvas.width !== w || canvas.height !== hgt) {
      canvas.width = w
      canvas.height = hgt
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.setTransform(canvas.width / BOX_W, 0, 0, canvas.height / BOX_H, 0, 0)
    ctx.strokeStyle = getComputedStyle(canvas).color
    ctx.fillStyle = ctx.strokeStyle
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const s of strokes) {
      if (s.length === 2) {
        ctx.beginPath()
        ctx.arc(s[0], s[1], 2.5, 0, Math.PI * 2)
        ctx.fill()
        continue
      }
      ctx.beginPath()
      ctx.moveTo(s[0], s[1])
      for (let i = 2; i < s.length; i += 2) ctx.lineTo(s[i], s[i + 1])
      ctx.stroke()
    }
  }

  // Only strokes of 2 points or more count, as the API refuses a stroke of one point.
  const usable = () => strokes.filter((s) => s.length >= 4)

  function hasInk() {
    let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity
    for (const s of usable()) {
      for (let i = 0; i < s.length; i += 2) {
        minX = Math.min(minX, s[i]); maxX = Math.max(maxX, s[i])
        minY = Math.min(minY, s[i + 1]); maxY = Math.max(maxY, s[i + 1])
      }
    }
    return maxX - minX >= MIN_SPAN || maxY - minY >= MIN_SPAN
  }

  const changed = () => onChange?.(hasInk())

  const down = (e) => {
    // No preventDefault needed: touch-action: none on the pad already keeps a finger from scrolling the page.
    if (current || strokes.length >= MAX_STROKES || points >= MAX_POINTS) return
    try { canvas.setPointerCapture(e.pointerId) } catch { /* the pointer already ended */ }
    current = { id: e.pointerId, pts: toBox(e) }
    strokes.push(current.pts)
    points++
    redraw()
  }
  const move = (e) => {
    if (!current || e.pointerId !== current.id) return
    const [x, y] = toBox(e)
    const pts = current.pts
    if (Math.abs(x - pts[pts.length - 2]) + Math.abs(y - pts[pts.length - 1]) < 2 || points >= MAX_POINTS) return
    pts.push(x, y)
    points++
    redraw()
    changed()
  }
  const up = (e) => {
    if (!current || e.pointerId !== current.id) return
    current = null
    changed()
  }

  canvas.addEventListener('pointerdown', down)
  canvas.addEventListener('pointermove', move)
  canvas.addEventListener('pointerup', up)
  canvas.addEventListener('pointercancel', up)
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => redraw()) : null
  resize?.observe(canvas)
  requestAnimationFrame(redraw)

  return {
    hasInk,
    signature: () => ({ w: BOX_W, h: BOX_H, strokes: usable().map((s) => [...s]) }),
    clear() {
      strokes = []
      current = null
      points = 0
      redraw()
      changed()
    },
    destroy() {
      resize?.disconnect()
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
    },
  }
}
