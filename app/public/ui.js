// Small DOM helpers shared by the room view, the notes and the office. Every piece of data goes in as text (never innerHTML),
// so a name from the API can never become markup.

/** h('button', { class: 'x', onclick }, 'text', child) */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v)
    else if (k === 'class') el.className = v
    else if (k === 'dataset') Object.assign(el.dataset, v)
    else if (k === 'text') el.textContent = v
    else if (k in el && typeof v !== 'string') el[k] = v
    else el.setAttribute(k, v === true ? '' : v)
  }
  append(el, children)
  return el
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue
    el.append(c instanceof Node ? c : document.createTextNode(String(c)))
  }
}

export const $ = (sel, root = document) => root.querySelector(sel)
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)]

// ---------- icons (inline SVG, drawn with currentColor) ----------
const SVG_NS = 'http://www.w3.org/2000/svg'
const ICONS = {
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M15 5l-7 7 7 7',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  pen: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
  check: 'M5 12.5l4.5 4.5L19 7',
  print: 'M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M7 14h10v6H7z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  note: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5',
}
export function icon(name, { size = 20, label } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', size)
  svg.setAttribute('height', size)
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('class', 'icon')
  if (label) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label) } else svg.setAttribute('aria-hidden', 'true')
  const p = document.createElementNS(SVG_NS, 'path')
  p.setAttribute('d', ICONS[name])
  svg.append(p)
  return svg
}

// ---------- shared pieces ----------
/** Initials avatar in a ring coloured by age group. */
export const avatar = (initials, ageGroup, size = 'md') =>
  h('span', { class: `avatar avatar-${size}`, style: ageGroup ? `--ring: var(--group-${ageGroup})` : null, 'aria-hidden': 'true' }, initials || '')

/**
 * Put the centre's name and SAMPLE badge on the page from an API answer (/api/info, today, a note). The name is exactly
 * `centre_name`: before first setup the API sends "" and the page shows no name, never a guessed one. The badge shows only when
 * `sample` is true.
 */
export function applyCentre(source) {
  if (!source) return
  for (const el of document.querySelectorAll('.centre-name')) el.textContent = source.centre_name || ''
  for (const el of document.querySelectorAll('.centre .sample-badge')) el.hidden = source.sample !== true
}

/** A ratio pill coloured only through data-state (theme.css). */
export const meterPill = (meter) =>
  h('span', { class: 'pill state-pill', 'data-state': meter.state }, meter.state_label)

/** Minutes as people read them: "45 min", "2 h", "7 h 25 min". */
export const minutesLabel = (m) => {
  const n = Math.max(0, Math.round(Number(m) || 0))
  if (n < 60) return `${n} min`
  return n % 60 ? `${Math.floor(n / 60)} h ${n % 60} min` : `${n / 60} h`
}

/** "1 child" / "4 children", "1 staff" */
export const childrenCount = (n) => (n === 1 ? '1 child' : `${n} children`)

/** Show a field's API error under the input named by `field` (inside scope), or in the fallback element. */
export function showError(scope, err, fallback) {
  clearErrors(scope)
  const target = err.field ? scope.querySelector(`[name="${CSS.escape(err.field)}"], [data-field="${CSS.escape(err.field)}"]`) : null
  if (target) {
    target.setAttribute('aria-invalid', 'true')
    const msg = h('p', { class: 'field-error', role: 'alert' }, err.message)
    target.insertAdjacentElement('afterend', msg)
    return msg
  }
  if (fallback) {
    fallback.textContent = err.message
    fallback.hidden = false
    return fallback
  }
  return null
}
export function clearErrors(scope) {
  for (const e of scope.querySelectorAll('.field-error')) e.remove()
  for (const e of scope.querySelectorAll('[aria-invalid]')) e.removeAttribute('aria-invalid')
}

/**
 * Replace a region's children only when its data changed, so a 5-second poll never swaps a button out from under a finger
 * for nothing. Returns true when it rebuilt.
 */
export function renderIf(el, data, build) {
  const sig = JSON.stringify(data)
  if (el.__sig === sig) return false
  el.__sig = sig
  el.replaceChildren(...[build(data)].flat(Infinity).filter(Boolean))
  return true
}

// While a finger or mouse button is down, background refreshes wait until it lifts.
let pointersDown = 0
const waiting = []
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', () => { pointersDown++ }, true)
  const up = () => {
    pointersDown = Math.max(0, pointersDown - 1)
    if (pointersDown === 0) setTimeout(() => { while (pointersDown === 0 && waiting.length) waiting.shift()() }, 350)
  }
  document.addEventListener('pointerup', up, true)
  document.addEventListener('pointercancel', up, true)
}
/** Run fn now, or as soon as no pointer is down. */
export function whenIdle(fn) {
  if (pointersDown === 0) fn()
  else waiting.push(fn)
}

/** Repeat fn every ms (after each run finishes); runs again at once when the page comes back into view. */
export function poll(fn, ms) {
  let timer = null
  let stopped = false
  const run = async () => {
    clearTimeout(timer)
    if (stopped) return
    try { await fn() } catch { /* the page shows its own error */ }
    if (!stopped) timer = setTimeout(run, ms)
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) run() })
  timer = setTimeout(run, ms)
  return { now: run, stop() { stopped = true; clearTimeout(timer) } }
}

// ---------- toast ----------
/**
 * One #toast per page. It lives in a reserved slot, never floating over the page: the sheet header's status line when a sheet is
 * open, or a .status-line beside the control that caused it (#toast-home when the caller names none).
 */
let toastTimer = null
export function toast(message, { action, onAction, slot, error = false } = {}) {
  let t = document.getElementById('toast')
  if (!t) {
    t = h('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite' })
  }
  const home = slot || document.getElementById('toast-home') || document.body
  if (t.parentElement !== home) home.append(t)
  t.classList.toggle('toast-inline', !!slot && !slot.classList.contains('status-line'))
  t.classList.toggle('toast-error', error)
  t.replaceChildren(...[
    h('span', { class: 'toast-text' }, message),
    action ? h('button', { type: 'button', class: 'btn btn-quiet toast-action undo', onclick: () => { hideToast(); onAction() } }, action) : null,
  ].filter(Boolean))
  t.hidden = false
  clearTimeout(toastTimer)
  toastTimer = setTimeout(hideToast, 6000)
  return t
}
export function hideToast() {
  const t = document.getElementById('toast')
  if (t) { t.hidden = true; t.replaceChildren() }
  clearTimeout(toastTimer)
}
