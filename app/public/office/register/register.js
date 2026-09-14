// Printable daily register for one homeroom: /office/register/?date=YYYY-MM-DD&room=<room id>. GET /api/office/register
// (NLR 39/17 s.45). Signatures are rebuilt from the Worker's SVG: only <path> elements whose d is M/L/digits/spaces and a short
// list of stroke attributes are copied, so nothing from the data becomes live markup.
import { api, staffSession } from '/api.js'
import { h, $ } from '/ui.js'
import { createKeypad } from '/keypad.js'
import { longDate } from '/office/dates.js'

const app = $('#app')
const params = new URLSearchParams(location.search)
const roomId = params.get('room')
let date = params.get('date')
const SVG_NS = 'http://www.w3.org/2000/svg'
const PATH_ATTRS = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin']

$('#print').addEventListener('click', () => window.print())

function signIn(message) {
  const wrap = h('div', { class: 'signin-wrap' })
  const pad = createKeypad({
    title: 'Office sign in',
    hint: 'The supervisor\'s PIN.',
    onSubmit: async (pin) => { await api.signin(pin); pad.destroy(); load() },
  })
  wrap.append(pad.el)
  app.replaceChildren(wrap)
  if (message) pad.showError(message)
}

/** A problem is shown on the page in #register-error (role="alert"), never in a browser dialog. */
const showProblem = (text) => app.replaceChildren(h('p', { id: 'register-error', class: 'alert', role: 'alert' }, text))

async function load() {
  if (!staffSession.token()) return signIn()
  if (staffSession.role() !== 'supervisor') return showProblem('Only the supervisor can open the office.')
  if (!roomId) return showProblem('Open the register from the office Today tab, where each room has "Print the daily register".')
  try {
    const info = await api.info()
    if (!date) date = info.today
    build(await api.register(date, roomId), info.today)
  } catch (e) {
    if (e.status === 401) return signIn('Please sign in again.')
    showProblem(e.message)
  }
}

export function signature(svgText, label) {
  if (!svgText) return null
  const source = new DOMParser().parseFromString(svgText, 'image/svg+xml').documentElement
  if (!source || source.localName !== 'svg' || source.namespaceURI !== SVG_NS) return null
  const viewBox = source.getAttribute('viewBox') || ''
  if (!/^0 0 \d{1,4} \d{1,4}$/.test(viewBox)) return null
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', viewBox)
  svg.setAttribute('class', 'signature')
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', label)
  for (const p of source.getElementsByTagNameNS(SVG_NS, 'path')) {
    const d = p.getAttribute('d') || ''
    if (!/^[ML0-9 ]+$/.test(d)) continue
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', d)
    for (const a of PATH_ATTRS) {
      const v = p.getAttribute(a)
      if (v && /^[A-Za-z0-9.]+$/.test(v)) path.setAttribute(a, v)
    }
    svg.append(path)
  }
  return svg.childNodes.length ? svg : null
}

function notes(v) {
  if (!v) return []
  const out = []
  if (v.in_recorded_by) out.push(`Recorded by ${v.in_recorded_by.initials}${v.awaiting_signature === 'in' ? ', signature needed' : ''}`)
  if (v.out_recorded_by) out.push(`Pick-up recorded by ${v.out_recorded_by.initials}${v.awaiting_signature === 'out' ? ', signature needed' : ''}`)
  for (const e of v.edits || []) {
    const by = typeof e.by === 'string' ? e.by : e.by?.initials || e.by?.name || ''
    out.push(`Changed by ${by}: ${e.reason}`)
  }
  return out
}

// API.md: a visit with no out_at reads "Still here" on today's register and "Not signed out" on an earlier date's.
function end(v, which, isToday) {
  const at = v[`${which}_label`]
  if (!at) return which === 'out' ? h('span', { class: isToday ? 'still-here' : 'muted' }, isToday ? 'Still here' : 'Not signed out') : null
  const by = v[`${which}_by`]
  return h('div', { class: 'register-end' },
    h('strong', {}, at),
    by ? h('span', { class: 'block' }, `by ${by.name}${by.relationship ? ` (${by.relationship})` : ''}`) : null,
    signature(v[`${which}_signature_svg`], `Signature of ${by?.name || 'the parent'}`) || (v[`${which}_recorded_by`] ? h('span', { class: 'muted small block' }, 'No signature yet') : null))
}

function build(reg, today) {
  const isToday = reg.date === today
  document.title = reg.centre_name ? `Daily register · ${reg.room.name} · ${reg.centre_name}` : `Daily register · ${reg.room.name}`
  const rows = reg.rows.flatMap((row) => {
    const visits = row.visits.length ? row.visits : [null]
    return visits.map((v, i) => h('tr', { 'data-register-row': row.child.name },
      i === 0 ? [
        h('th', { scope: 'row', rowspan: String(visits.length) }, row.child.name),
        h('td', { rowspan: String(visits.length) }, row.child.dob ? longDate(row.child.dob) : ''),
        h('td', { rowspan: String(visits.length) }, row.emergency
          ? [h('span', { class: 'block' }, row.emergency.name), h('span', { class: 'muted small block' }, [row.emergency.relationship, row.emergency.phone].filter(Boolean).join(' · '))]
          : h('span', { class: 'muted' }, 'None on file')),
      ] : null,
      h('td', { class: 'register-in' }, v ? end(v, 'in') : h('span', { class: 'muted' }, 'Placed here, signed in elsewhere')),
      h('td', { class: 'register-out' }, v ? end(v, 'out', isToday) : null),
      i === 0 ? h('td', { rowspan: String(visits.length), class: 'register-moves' }, row.moves.map((m) => h('span', { class: 'block' }, m.label))) : null,
      h('td', { class: 'register-notes' }, notes(v).map((n) => h('span', { class: 'block' }, n)))))
  })
  app.replaceChildren(
    h('header', { class: 'register-head' },
      h('p', { class: 'centre' }, h('span', { class: 'centre-name' }, reg.centre_name || ''), reg.sample === true ? h('span', { class: 'sample-badge' }, 'SAMPLE') : null),
      h('h1', {}, `Daily register: ${reg.room.name}`),
      h('p', { class: 'register-date' }, `${reg.long_label}, ${reg.date.slice(0, 4)}`)),
    reg.rows.length
      ? h('div', { class: 'table-scroll' }, h('table', { id: 'register-table', class: 'register-table' },
        h('thead', {}, h('tr', {}, ['Child', 'Date of birth', 'Emergency contact', 'In', 'Out', 'Moves', 'Notes'].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', {}, rows)))
      : h('p', { class: 'empty' }, 'No child was in this room on this day.'),
    h('p', { id: 'kept-note', class: 'kept-note' }, reg.kept_note))
}

load()
