// Door tablet (1024 × 768 landscape first, still works at 768 portrait). A parent taps a child's card, Sign in or Sign out, their
// own name, signs with a finger and taps Done. No typing. Talks only to docs/API.md through door-api.js, and every date and time
// shown comes from the API. Polls GET /api/door/children every 15 s and after every write. A sheet left alone for 45 s goes back
// to the grid; a confirmation goes back after 6 s or on Done.
import { avatar, h, icon, whenIdle } from '/ui.js'
import { createKeypad } from '/keypad.js'
import { doorApi, doorSession } from '/door/door-api.js'
import { createPad } from '/door/pad.js'

export const POLL_MS = 15_000
export const IDLE_MS = 45_000
export const CONFIRM_MS = 6_000

const $ = (id) => document.getElementById(id)
const app = $('app')
const pageHead = $('door-head')
const offline = $('offline')

let info = null
let data = null
let filter = 'all'
let pollTimer = null
let keypad = null
let sheet = null

// ---------- data ----------

async function refresh() {
  clearTimeout(pollTimer)
  if (!doorSession.token()) return showSetup()
  // Info (name, date, clock) and the children are fetched independently: a failed /api/info must not throw away a good grid.
  const [i, d] = await Promise.allSettled([doorApi.info(), doorApi.children()])
  if (i.status === 'fulfilled') {
    info = i.value
    drawHeader()
  }
  if (d.status === 'fulfilled') {
    data = d.value
    offline.hidden = true
    whenIdle(drawGrid)
  } else {
    if (d.reason.status === 401) return showSetup()
    offline.textContent = `${d.reason.message} Trying again shortly.`
    offline.hidden = false
  }
  pollTimer = setTimeout(refresh, POLL_MS)
}

function drawHeader() {
  if (!info) return
  $('centre-name').textContent = info.centre_name
  $('sample-badge').hidden = info.sample !== true
  document.title = info.centre_name ? `Door tablet · ${info.centre_name}` : 'Door tablet'
  $('date-line').textContent = info.long_label
  $('time-line').textContent = info.time_label
}

// ---------- set up this tablet ----------

function showSetup(message) {
  clearTimeout(pollTimer)
  data = null
  closeSheet({ reload: false })
  const chips = $('chips')
  chips.hidden = true
  chips.replaceChildren()
  chips.__sig = undefined
  doorApi.info().then((i) => { info = i; drawHeader() }).catch(() => {})
  keypad?.destroy()
  keypad = createKeypad({
    title: 'Set up this tablet',
    hint: 'The supervisor enters their PIN once. Then parents sign children in and out here.',
    onSubmit: async (pin) => {
      await doorApi.unlock(pin)
      keypad.destroy()
      keypad = null
      app.__sig = undefined
      await refresh()
    },
  })
  app.__sig = undefined
  app.replaceChildren(h('section', { class: 'setup' }, keypad.el))
  if (message) keypad.showError(message)
}

// ---------- the grid ----------

function chip(roomId, label) {
  return h('button', {
    type: 'button', class: 'chip', 'data-room': roomId, 'aria-pressed': String(filter === roomId),
    onclick: () => {
      filter = roomId
      $('chips').__sig = undefined
      app.__sig = undefined
      drawGrid()
    },
  }, label)
}

function childCard(c, groupOf) {
  return h('button', {
    type: 'button', class: 'child', 'data-child': c.id, 'data-status': c.status,
    onclick: (e) => openChild(c.id, e.currentTarget),
  },
  avatar(c.initials, groupOf[c.room_id], 'lg'),
  h('span', { class: 'child-text' },
    h('span', { class: 'child-name' }, c.name),
    h('span', { class: 'child-room' }, c.room_name || '')),
  // The status takes the card's full width (door.css), so a short label never wraps beside the avatar.
  h('span', { class: 'status-pill', 'data-status': c.status }, c.status_label),
  c.awaiting_signature ? h('span', { class: 'chip-sign' }, 'Signature needed') : null)
}

function drawGrid() {
  if (!data || sheet || keypad) return
  if (filter !== 'all' && !data.rooms.some((m) => m.room_id === filter)) filter = 'all'
  const chips = $('chips')
  chips.hidden = false
  const chipSig = JSON.stringify([filter, data.rooms.map((m) => [m.room_id, m.room_name])])
  if (chips.__sig !== chipSig) {
    chips.__sig = chipSig
    chips.replaceChildren(chip('all', 'All'), ...data.rooms.map((m) => chip(m.room_id, m.room_name)))
  }
  const sig = JSON.stringify([filter, data.rooms, data.children])
  if (app.__sig === sig) return
  app.__sig = sig
  const groupOf = Object.fromEntries(data.rooms.map((m) => [m.room_id, m.age_group]))
  const shown = data.children.filter((c) => filter === 'all' || c.room_id === filter)
  const expected = shown.filter((c) => c.status !== 'not_booked')
  const notBooked = shown.filter((c) => c.status === 'not_booked')
  // An empty section is left out, never passed on: replaceChildren would print it as the text "null".
  app.replaceChildren(...[
    h('section', { id: 'children', class: 'cards-section', 'aria-label': 'Children' },
      expected.length
        ? h('div', { class: 'cards' }, expected.map((c) => childCard(c, groupOf)))
        : h('p', { class: 'empty' }, 'No children are expected in this room today.')),
    notBooked.length
      ? h('section', { id: 'not-booked', class: 'cards-section quiet', 'aria-labelledby': 'not-booked-title' },
        h('h2', { id: 'not-booked-title', class: 'section-title' }, 'Not booked today'),
        h('div', { class: 'cards' }, notBooked.map((c) => childCard(c, groupOf))))
      : null,
  ].filter(Boolean))
}

// ---------- the sheet ----------

async function openChild(childId, opener) {
  if (opener) opener.disabled = true
  let detail
  try {
    detail = await doorApi.child(childId)
  } catch (e) {
    if (e.status === 401) return showSetup()
    offline.textContent = e.message
    offline.hidden = false
    return
  } finally {
    if (opener?.isConnected) opener.disabled = false
  }
  openSheet(detail)
  show(() => actionStep(detail))
}

function openSheet(detail) {
  closeSheet({ reload: false })
  const c = detail.child
  const group = data?.rooms.find((m) => m.room_name === c.room_name)?.age_group
  const back = h('button', { type: 'button', id: 'back', class: 'btn-door btn-quiet', onclick: goBack }, icon('back', { size: 28 }), 'Back')
  const body = h('div', { class: 'sheet-body' })
  const el = h('section', { id: 'sheet', class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': c.name },
    h('header', { class: 'sheet-head', 'data-sticky-header': true },
      back,
      h('div', { class: 'sheet-who' },
        avatar(c.initials, group, 'lg'),
        h('div', {}, h('p', { class: 'sheet-name' }, c.name), h('p', { class: 'sheet-room' }, c.room_name || ''))),
      h('p', { class: 'sheet-centre' },
        h('span', { class: 'centre-name' }, info?.centre_name || ''),
        info?.sample === true ? h('span', { class: 'sample-badge' }, 'SAMPLE') : null)),
    body)
  const bump = () => {
    if (!sheet) return
    clearTimeout(sheet.idle)
    if (!sheet.confirming) sheet.idle = setTimeout(() => closeSheet(), IDLE_MS)
  }
  el.addEventListener('pointerdown', bump, true)
  el.addEventListener('keydown', bump, true)
  sheet = { el, body, back, steps: [], idle: null, confirmTimer: null, pad: null, confirming: false, bump }
  document.body.append(el)
  app.hidden = true
  pageHead.hidden = true
  bump()
}

// Show a step. Steps are functions, so Back can draw the previous one again.
function show(step, { push = true } = {}) {
  if (!sheet) return
  if (push) sheet.steps.push(step)
  sheet.pad?.destroy()
  sheet.pad = null
  sheet.body.replaceChildren(...[step()].flat(Infinity).filter(Boolean))
  sheet.back.hidden = sheet.confirming
  sheet.el.scrollTop = 0
  sheet.bump()
}

function goBack() {
  if (!sheet) return
  sheet.steps.pop()
  const prev = sheet.steps[sheet.steps.length - 1]
  if (prev) show(prev, { push: false })
  else closeSheet()
}

function closeSheet({ reload = true } = {}) {
  if (!sheet) return
  clearTimeout(sheet.idle)
  clearTimeout(sheet.confirmTimer)
  sheet.pad?.destroy()
  sheet.el.remove()
  sheet = null
  app.hidden = false
  pageHead.hidden = false
  // Draw the grid from the data in hand at once, so a tap never lands on a card about to be replaced; refresh() then redraws
  // only if something changed.
  app.__sig = undefined
  drawGrid()
  if (reload) refresh()
}

const errorLine = () => h('p', { class: 'sheet-error', role: 'alert', hidden: true })

// Chromium on a touch screen drops the click of a tap made within about a second of a fast stroke released on the pad
// (touch-action: none): it takes the tap as stopping a fling. Measured on the chromium-tablet project: no click at 250 and
// 500 ms after the stroke, a click at 900 ms. A parent reaches for Done faster than that, so the buttons under the pad also
// act on a touch pointerup that started on them, and the click that may follow is ignored.
function onPress(button, action) {
  let down = null
  let pressedAt = -Infinity
  button.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') down = e.pointerId })
  button.addEventListener('pointercancel', () => { down = null })
  button.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'touch' || e.pointerId !== down) return
    down = null
    const r = button.getBoundingClientRect()
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom || button.disabled) return
    pressedAt = e.timeStamp
    action()
  })
  button.addEventListener('click', (e) => {
    if (e.timeStamp - pressedAt < 800) return
    action()
  })
  return button
}

function showStepError(message) {
  const el = sheet?.body.querySelector('.sheet-error')
  if (!el) return
  el.textContent = message
  el.hidden = false
}

// (1) Sign in or Sign out, and Add a signature when a time is waiting for one.
function actionStep(d) {
  const c = d.child
  const signingOut = c.status === 'in'
  return [
    h('p', { class: 'status-line' }, h('span', { class: 'status-pill', 'data-status': c.status }, c.status_label)),
    h('div', { class: 'action-wrap' }, signingOut
      ? h('button', { type: 'button', id: 'action-out', class: 'btn-door btn-primary btn-huge', onclick: () => show(() => peopleStep(d, 'out')) }, 'Sign out')
      : h('button', { type: 'button', id: 'action-in', class: 'btn-door btn-primary btn-huge', onclick: () => show(() => peopleStep(d, 'in')) }, 'Sign in')),
    d.pending.length
      ? h('div', { class: 'pending-box' },
        h('p', { class: 'pending-text' }, h('span', { class: 'chip-sign' }, 'Signature needed'),
          d.pending.length === 1
            ? ` ${d.pending[0].which === 'in' ? 'Drop-off' : 'Pick-up'} at ${d.pending[0].time_label}, ${d.pending[0].date_label}, recorded by staff.`
            : ` ${d.pending.length} times recorded by staff.`),
        h('button', {
          type: 'button', id: 'add-signature', class: 'btn-door btn-outline',
          onclick: () => (d.pending.length === 1 ? show(() => padStep(d, { kind: 'sign', pending: d.pending[0] })) : show(() => pendingStep(d))),
        }, 'Add a signature'))
      : null,
  ]
}

// (2) Who is dropping off / picking up. Pick-up offers only the people who may pick up.
function peopleStep(d, kind) {
  const people = kind === 'out' ? d.people.filter((p) => p.may_pick_up) : d.people
  return [
    h('h2', { class: 'step-title' }, kind === 'out' ? 'Who is picking up?' : 'Who is dropping off?'),
    people.length
      ? h('div', { class: 'people' }, people.map((p) => h('button', {
        type: 'button', class: 'btn-door person', 'data-person': p.id, onclick: () => show(() => padStep(d, { kind, person: p })),
      }, h('span', { class: 'person-name' }, p.name), h('span', { class: 'person-rel' }, p.relationship))))
      : h('p', { class: 'empty' }, 'No one on the list can do this. Get the supervisor.'),
    h('button', { type: 'button', id: 'someone-else', class: 'btn-door btn-outline', onclick: () => show(() => blockStep(d, kind)) }, 'Someone else'),
  ]
}

// Someone who is not on the list: no override here, the supervisor adds people in the office.
function blockStep(d, kind) {
  return h('div', { id: 'not-on-list', class: 'block', role: 'alert' },
    h('p', { class: 'block-title' }, 'Not on the list'),
    h('p', { class: 'block-text' }, 'Get the supervisor.'),
    kind === 'out' ? h('p', { class: 'block-text' }, `Do not let ${d.child.name} leave with someone who is not on the list.`) : null)
}

function pendingStep(d) {
  return [
    h('h2', { class: 'step-title' }, 'Which time needs a signature?'),
    h('div', { class: 'people' }, d.pending.map((p) => h('button', {
      type: 'button', class: 'btn-door person pending', 'data-visit': p.visit_id, 'data-which': p.which,
      onclick: () => show(() => padStep(d, { kind: 'sign', pending: p })),
    }, h('span', { class: 'person-name' }, `${p.which === 'in' ? 'Drop-off' : 'Pick-up'} at ${p.time_label}, ${p.date_label}`),
    h('span', { class: 'person-rel' }, p.person.name)))),
  ]
}

// (3) Sign here with your finger. Done stays disabled until the ink spans 20 units.
function padStep(d, job) {
  const line = job.kind === 'sign'
    ? `${job.pending.person.name}, sign for the ${job.pending.which === 'in' ? 'drop-off' : 'pick-up'} at ${job.pending.time_label}, ${job.pending.date_label}. The time stays as it was.`
    : `${job.person.name} is signing ${d.child.name} ${job.kind === 'in' ? 'in' : 'out'}.`
  const canvas = h('canvas', { id: 'pad', class: 'pad', role: 'img', 'aria-label': 'Signature pad' })
  const done = onPress(h('button', { type: 'button', id: 'pad-done', class: 'btn-door btn-primary', disabled: true }, 'Done'), () => submit(d, job, done))
  const clear = onPress(h('button', { type: 'button', id: 'pad-clear', class: 'btn-door btn-quiet' }, 'Clear'), () => sheet?.pad?.clear())
  sheet.pad = createPad(canvas, { onChange: (ink) => { done.disabled = !ink } })
  return [
    h('h2', { class: 'step-title' }, 'Sign here with your finger'),
    h('p', { class: 'step-sub' }, line),
    h('div', { class: 'pad-frame' }, canvas),
    h('div', { class: 'pad-row' }, clear, done),
    errorLine(),
  ]
}

async function submit(d, job, btn) {
  const pad = sheet?.pad
  if (!pad || btn.disabled) return
  btn.disabled = true
  const signature = pad.signature()
  let answer
  try {
    if (job.kind === 'in') answer = await doorApi.signIn(d.child.id, job.person.id, signature)
    else if (job.kind === 'out') answer = await doorApi.signOut(d.child.id, job.person.id, signature)
    else answer = await doorApi.addSignature(job.pending.visit_id, job.pending.which, job.pending.person.id, signature)
  } catch (e) {
    if (e.status === 401) return showSetup()
    if (e.status === 409 && ['already_in', 'not_in', 'bad_state'].includes(e.code)) return restartSheet(d.child.id, e.message)
    showStepError(e.message)
    btn.disabled = !pad.hasInk()
    return
  }
  if (!sheet) return
  sheet.steps = []
  sheet.confirming = true
  clearTimeout(sheet.idle)
  show(() => confirmStep(job, answer), { push: false })
  sheet.confirmTimer = setTimeout(() => closeSheet(), CONFIRM_MS)
  refresh()
}

// The child changed on another device while this sheet was open (a 409): say so in the API's words, re-read the child and start
// again from step 1, so a refused Sign in becomes Sign out instead of the same write again.
async function restartSheet(childId, message) {
  let detail
  try {
    detail = await doorApi.child(childId)
  } catch (e) {
    if (e.status === 401) return showSetup()
    showStepError(e.message)
    return
  }
  if (!sheet) return
  sheet.steps = []
  show(() => [h('p', { id: 'sheet-notice', class: 'sheet-error', role: 'alert' }, message), ...actionStep(detail)])
  refresh()
}

function checkMark() {
  const NS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(NS, 'svg')
  for (const [k, v] of Object.entries({ viewBox: '0 0 120 120', width: '112', height: '112', class: 'check', 'aria-hidden': 'true' })) svg.setAttribute(k, v)
  const ring = document.createElementNS(NS, 'circle')
  for (const [k, v] of Object.entries({ cx: '60', cy: '60', r: '52', fill: 'none', stroke: 'currentColor', 'stroke-width': '8', opacity: '0.35' })) ring.setAttribute(k, v)
  const tick = document.createElementNS(NS, 'path')
  for (const [k, v] of Object.entries({ d: 'M34 62 L52 80 L88 42', fill: 'none', stroke: 'currentColor', 'stroke-width': '10', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) tick.setAttribute(k, v)
  svg.append(ring, tick)
  return svg
}

function overBanner(meter) {
  if (meter && meter.state === 'over') {
    return h('p', { id: 'over-banner', class: 'over-banner', role: 'alert' }, `${meter.room_name} is over the ratio. Tell the room staff.`)
  }
  return null
}

// (4) The confirmation: what happened, when, by whom, and the room's meter (red banner when the room is now over).
function confirmStep(job, answer) {
  const v = answer.visit
  const title = job.kind === 'in' ? 'Signed in' : job.kind === 'out' ? 'Signed out' : 'Signature added'
  const which = job.kind === 'sign' ? job.pending.which : job.kind
  const time = which === 'in' ? v.in_label : v.out_label
  const person = job.kind === 'sign' ? job.pending.person.name : job.person.name
  const meter = answer.meter || null
  return h('div', { id: 'confirm', class: 'confirm' },
    checkMark(),
    h('h2', { class: 'confirm-title' }, title),
    h('p', { class: 'confirm-time' }, job.kind === 'sign' ? `${which === 'in' ? 'Drop-off' : 'Pick-up'} at ${time} stays as it was.` : time),
    h('p', { class: 'confirm-by' }, `by ${person}`),
    meter
      ? h('p', { class: 'confirm-meter' }, h('span', { class: 'pill', 'data-state': meter.state }, meter.state_label), h('span', { class: 'confirm-room' }, meter.label))
      : null,
    overBanner(meter),
    h('button', { type: 'button', id: 'confirm-done', class: 'btn-door btn-primary', onclick: () => closeSheet() }, 'Done'))
}

// ---------- start ----------

document.addEventListener('visibilitychange', () => { if (!document.hidden && doorSession.token() && !keypad) refresh() })
if (doorSession.token()) refresh()
else showSetup()
