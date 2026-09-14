// Office attendance: Day / Week / Month of children × dates from GET /api/office/attendance, "Fix a time", "Mark away" and the two
// CSV downloads (the Worker's bytes, saved as they came). Minutes are the API's; the page only formats and adds up what it shows.
import { api } from '/api.js'
import { h, $, toast, icon, minutesLabel } from '/ui.js'
import { range, shift, shortLabel, rangeLabel, dayLabel } from '/office/dates.js'

const VIEWS = [['day', 'Day'], ['week', 'Week'], ['month', 'Month']]
const REASONS = [['sick', 'Sick'], ['holiday', 'Holiday'], ['appointment', 'Appointment'], ['family', 'Family reasons'], ['other', 'Other']]
const reasonLabel = (absence) => absence?.reason_label || REASONS.find(([k]) => k === absence?.reason)?.[1] || 'Away'

export async function showAttendance({ today, state, attempt, refresh }) {
  state.anchor ??= today
  const { from, to } = range(state.view, state.anchor)
  const data = await attempt(null, null, () => api.attendance(from, to))
  if (!data) return null
  const statusLine = h('div', { class: 'status-line', id: 'attendance-status' })
  const ctx = { data, today, attempt, refresh, from, to }
  const move = (dir) => { state.anchor = shift(state.view, state.anchor, dir); refresh() }
  const noun = { day: 'day', week: 'week', month: 'month' }[state.view]

  return [
    h('div', { class: 'office-head' }, h('h1', { class: 'office-title' }, 'Attendance'), h('p', { class: 'muted', id: 'attendance-range' }, rangeLabel(state.view, from, to))),
    h('div', { class: 'att-controls' },
      h('div', { class: 'segmented', role: 'group', 'aria-label': 'Show' }, VIEWS.map(([v, label]) => h('button', {
        type: 'button', class: 'btn seg', 'data-view': v, 'aria-pressed': String(state.view === v),
        onclick: () => { state.view = v; refresh() },
      }, label))),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', id: 'att-prev', class: 'btn btn-quiet', onclick: () => move(-1) }, icon('back'), `Previous ${noun}`),
        h('button', { type: 'button', id: 'att-next', class: 'btn btn-quiet', onclick: () => move(1) }, `Next ${noun}`, icon('arrow')))),
    h('div', { class: 'btn-row att-actions' },
      h('button', { type: 'button', id: 'mark-away', class: 'btn btn-outline', onclick: () => openMarkAway(ctx, null, from <= today && today <= to ? today : from) }, 'Mark away'),
      h('button', { type: 'button', id: 'download-csv', class: 'btn btn-outline', onclick: (e) => download(`/api/office/attendance.csv?from=${from}&to=${to}`, e.currentTarget, ctx) }, 'Download CSV'),
      h('button', { type: 'button', id: 'download-summary', class: 'btn btn-outline', onclick: (e) => download(`/api/office/attendance-summary.csv?from=${from}&to=${to}`, e.currentTarget, ctx) }, 'Download summary CSV')),
    statusLine,
    h('div', { class: 'table-scroll', tabindex: '0', role: 'region', 'aria-label': 'Attendance table' }, table(ctx)),
    h('p', { class: 'faint small' }, 'A visit that crosses midnight counts on each side of it. A child signed in today and not signed out yet is Still here. A visit from an earlier day never signed out counts as present with 0 minutes until its time is fixed. Empty cells are days the child is not booked, or days still to come.'),
  ]
}

function table(ctx) {
  const { data } = ctx
  const dayTotal = (d) => data.children.reduce((n, c) => n + (c.days[d]?.minutes || 0), 0)
  return h('table', { id: 'attendance-table', class: 'att-table' },
    h('thead', {}, h('tr', {},
      h('th', { scope: 'col', class: 'att-child' }, 'Child'),
      data.dates.map((d) => h('th', { scope: 'col', class: d === ctx.today ? 'is-today' : null }, shortLabel(d))),
      h('th', { scope: 'col' }, 'Days'),
      h('th', { scope: 'col' }, 'Total'))),
    h('tbody', {}, data.children.map((c) => h('tr', { 'data-att-row': c.id },
      h('th', { scope: 'row', class: 'att-child' }, h('span', { class: 'row-title' }, c.name), h('span', { class: 'muted small block' }, c.room_name)),
      data.dates.map((d) => h('td', { 'data-cell': `${c.id}:${d}`, class: `att-cell status-${c.days[d]?.status || 'none'}` }, cell(ctx, c, d, c.days[d]))),
      h('td', { class: 'att-days' }, String(c.days_present)),
      h('td', { class: 'att-total', 'data-total': c.id }, minutesLabel(c.minutes))))),
    h('tfoot', {}, h('tr', {},
      h('th', { scope: 'row', class: 'att-child' }, 'Total'),
      data.dates.map((d) => h('td', { 'data-day-total': d }, minutesLabel(dayTotal(d)))),
      h('td', { id: 'attendance-child-days' }, String(data.totals.child_days)),
      h('td', { id: 'attendance-total', class: 'att-total' }, minutesLabel(data.totals.minutes)))))
}

function cell(ctx, child, date, day) {
  if (!day) return null
  const when = `${child.name}, ${dayLabel(date)}`
  if (day.status === 'present') {
    const nodes = []
    if (!day.open || day.minutes > 0) {
      nodes.push(h('button', { type: 'button', class: 'cell-btn fix-time', 'aria-label': `${minutesLabel(day.minutes)}. Fix a time for ${when}`, onclick: () => openFix(ctx, child, date, day) }, minutesLabel(day.minutes)))
    }
    if (day.still_here) {
      // API.md: an open visit dated today is simply still here: no flag and no Fix a time.
      nodes.push(h('span', { class: 'chip chip-here' }, 'Still here'))
    } else if (day.open) {
      nodes.push(h('span', { class: 'chip chip-sign' }, 'Not signed out'),
        h('button', { type: 'button', class: 'btn btn-quiet fix-time', 'aria-label': `Fix a time for ${when}`, onclick: () => openFix(ctx, child, date, day) }, 'Fix a time'))
    }
    return nodes
  }
  if (day.status === 'away') return h('span', { class: 'chip chip-away' }, `Away: ${reasonLabel(day.absence)}`)
  if (day.status === 'missing') {
    return h('button', { type: 'button', class: 'cell-btn cell-missing', 'aria-label': `No record. Mark ${when} away`, onclick: () => openMarkAway(ctx, child.id, date) }, 'No record')
  }
  return null // not_booked and upcoming: an empty cell
}

// ---------- dialogs ----------
function dialog(id, heading, body) {
  for (const d of document.querySelectorAll('dialog')) { if (d.open) d.close(); d.remove() }
  const el = h('dialog', { id, class: 'office-dialog', 'aria-labelledby': `${id}-title` },
    h('h2', { id: `${id}-title`, class: 'panel-title' }, heading), body)
  el.addEventListener('close', () => el.remove())
  document.body.append(el)
  el.showModal()
  return el
}
const field = (label, control, hint) => h('div', { class: 'field' }, h('label', { for: control.id }, label), control, hint ? h('p', { class: 'faint small' }, hint) : null)
function control(tag, id, name, attrs = {}, value = '') {
  const el = h(tag, { id, name, ...attrs })
  if (value) el.value = value
  return el
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/**
 * The date one end of a visit is on. A part's label carries the other date when that end is not on the cell's date
 * ("10:30 PM Sep 14" in the Sep 15 cell, API.md), so the fix sends the visit's own dates, never the cell's.
 */
export function endDate(label, cellDate) {
  const m = /\s([A-Z][a-z]{2}) (\d{1,2})$/.exec(label || '')
  const month = m ? MONTHS_SHORT.indexOf(m[1]) + 1 : 0
  if (!month) return cellDate
  let [year, cellMonth] = cellDate.split('-').map(Number)
  if (month - cellMonth > 6) year -= 1 // Dec 31 shown in a Jan 1 cell
  if (cellMonth - month > 6) year += 1 // Jan 1 shown in a Dec 31 cell
  return `${year}-${String(month).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`
}

function openFix(ctx, child, date, day) {
  const parts = day.parts || []
  const open = parts.find((p) => !p.out_label)
  const first = open || parts[0]
  const choose = parts.length > 1
    ? control('select', 'fix-part', 'part', {}, '')
    : null
  if (choose) {
    parts.forEach((p, i) => choose.append(h('option', { value: String(i), selected: p === (open || parts[0]) }, `In ${p.in_label}, out ${p.out_label || 'not signed out'}`)))
  }
  const status = h('div', { class: 'status-line' })
  const form = h('form', { class: 'dialog-form', novalidate: true },
    h('p', { class: 'muted' }, `${child.name}, ${dayLabel(date)}.`),
    choose ? field('Which visit', choose) : h('p', {}, parts[0] ? `In ${parts[0].in_label}, out ${parts[0].out_label || 'not signed out'}.` : ''),
    h('div', { class: 'two-fields' },
      field('Signed in, date', control('input', 'fix-in_date', 'in_date', { type: 'date' }, endDate(first?.in_label, date))),
      field('Signed in, time', control('input', 'fix-in_time', 'in_time', { type: 'time' }))),
    h('div', { class: 'two-fields' },
      field('Signed out, date', control('input', 'fix-out_date', 'out_date', { type: 'date' }, first?.out_label ? endDate(first.out_label, date) : date)),
      field('Signed out, time', control('input', 'fix-out_time', 'out_time', { type: 'time' }))),
    h('p', { class: 'faint small' }, 'Fill in only the time that is wrong. The old time, who changed it and why are kept.'),
    field('Why', control('textarea', 'fix-reason', 'reason', { rows: '2', maxlength: '200' })),
    status,
    h('div', { class: 'btn-row' },
      h('button', { type: 'submit', id: 'fix-save', class: 'btn btn-primary' }, 'Save the time'),
      h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => el.close() }, 'Cancel')))
  const el = dialog('fix-dialog', 'Fix a time', form)
  choose?.addEventListener('change', () => {
    const p = parts[Number(choose.value)]
    form.elements.namedItem('in_date').value = endDate(p.in_label, date)
    form.elements.namedItem('out_date').value = p.out_label ? endDate(p.out_label, date) : date
  })
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const part = choose ? parts[Number(choose.value)] : parts[0]
    const v = (name) => form.elements.namedItem(name).value
    const body = { reason: v('reason') }
    if (v('in_time')) { body.in_date = v('in_date'); body.in_time = v('in_time') }
    if (v('out_time')) { body.out_date = v('out_date'); body.out_time = v('out_time') }
    const r = await ctx.attempt(form, status, () => api.fixVisit(part.visit_id, body))
    if (!r) return
    el.close()
    await ctx.refresh()
    toast('Time fixed. The old time and the reason are kept.', { slot: $('#attendance-status') })
  })
}

/** "Fix a time" for one visit left open (the office Today tab's Not signed out list): the sign-out date and time, and why. */
export function openFixVisit(ctx, { visitId, childName, date, dateLabel, inLabel }) {
  const status = h('div', { class: 'status-line' })
  const form = h('form', { class: 'dialog-form', novalidate: true },
    h('p', { class: 'muted' }, `${childName}, ${dateLabel}. In at ${inLabel}, never signed out.`),
    h('div', { class: 'two-fields' },
      field('Signed out, date', control('input', 'fix-out_date', 'out_date', { type: 'date' }, date)),
      field('Signed out, time', control('input', 'fix-out_time', 'out_time', { type: 'time' }))),
    h('p', { class: 'faint small' }, 'The old time, who changed it and why are kept.'),
    field('Why', control('textarea', 'fix-reason', 'reason', { rows: '2', maxlength: '200' })),
    status,
    h('div', { class: 'btn-row' },
      h('button', { type: 'submit', id: 'fix-save', class: 'btn btn-primary' }, 'Save the time'),
      h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => el.close() }, 'Cancel')))
  const el = dialog('fix-dialog', 'Fix a time', form)
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const v = (name) => form.elements.namedItem(name).value
    const body = { reason: v('reason') }
    if (v('out_time')) { body.out_date = v('out_date'); body.out_time = v('out_time') }
    const r = await ctx.attempt(form, status, () => api.fixVisit(visitId, body))
    if (!r) return
    el.close()
    await ctx.refresh()
    if (ctx.done) ctx.done()
  })
}

function openMarkAway(ctx, childId, date) {
  const status = h('div', { class: 'status-line' })
  const who = control('select', 'away-child_id', 'child_id', {})
  for (const c of ctx.data.children) who.append(h('option', { value: c.id, selected: c.id === childId }, c.name))
  const reason = control('select', 'away-reason', 'reason', {})
  for (const [value, label] of REASONS) reason.append(h('option', { value }, label))
  const form = h('form', { class: 'dialog-form', novalidate: true },
    field('Child', who),
    field('Date', control('input', 'away-date', 'date', { type: 'date' }, date)),
    field('Reason', reason),
    field('Note', control('input', 'away-note', 'note', { type: 'text', maxlength: '200', autocomplete: 'off' }), 'Optional. It goes in the CSV.'),
    status,
    h('div', { class: 'btn-row' },
      h('button', { type: 'submit', id: 'away-save', class: 'btn btn-primary' }, 'Mark away'),
      h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => el.close() }, 'Cancel')))
  const el = dialog('away-dialog', 'Mark away', form)
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const v = (name) => form.elements.namedItem(name).value
    const r = await ctx.attempt(form, status, () => api.addAbsence({ child_id: v('child_id'), date: v('date'), reason: v('reason'), note: v('note') }))
    if (!r) return
    el.close()
    await ctx.refresh()
    toast(`Marked away: ${r.absence.reason_label}.`, { slot: $('#attendance-status') })
  })
}

async function download(path, btn, ctx) {
  btn.disabled = true
  const r = await ctx.attempt(null, $('#attendance-status'), () => api.download(path))
  if (btn.isConnected) btn.disabled = false
  if (!r) return
  const url = URL.createObjectURL(r.blob)
  const link = h('a', { href: url, download: r.filename, hidden: true })
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  toast(`Downloaded ${r.filename}.`, { slot: $('#attendance-status') })
}
