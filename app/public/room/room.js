// Room view (staff phone). Talks only to the staff routes in docs/API.md through /api.js.
// Polls GET /api/staff/today every 5 s and after every write. A poll re-renders only the regions whose data changed, waits while a
// finger is down, and never touches an open sheet: the sheet refreshes only after the person's own write in it.
import { api, staffSession } from '/api.js'
import { h, $, $$, renderIf, whenIdle, poll, toast, hideToast, avatar, meterPill, childrenCount, showError, clearErrors, icon, applyCentre } from '/ui.js'
import { showStaffSignIn } from '/room/session.js'

const ROOM_KEY = 'daycare-day-sheet:room'
const app = $('#app')
let today = null
let poller = null
let sheet = null
let selected = null
try { selected = sessionStorage.getItem(ROOM_KEY) } catch { /* no storage */ }

const MEALS = [['breakfast', 'Breakfast'], ['am_snack', 'Morning snack'], ['lunch', 'Lunch'], ['pm_snack', 'Afternoon snack']]
/** The meal chip preselected from the centre's clock (now_local "HH:MM" from the API). */
export function mealFor(nowLocal) {
  const t = nowLocal || '12:00'
  if (t < '09:30') return 'breakfast'
  if (t < '11:00') return 'am_snack'
  if (t < '13:30') return 'lunch'
  return 'pm_snack'
}
// API.md: every time label is a bare time ("8:05 AM"); the page adds the words.
const inLabel = (l) => (l ? `In since ${l}` : '')
const sinceLabel = (l) => (l ? `Since ${l}` : '')

function select(roomId) {
  selected = roomId
  try { sessionStorage.setItem(ROOM_KEY, roomId) } catch { /* no storage */ }
}

// ---------- session ----------
$('#signout').addEventListener('click', async () => {
  poller?.stop()
  try { await api.signout() } catch { /* the token is forgotten either way */ }
  signedOut()
})

function signedOut(message) {
  poller?.stop()
  poller = null
  today = null
  closeSheet()
  $('#signout').hidden = true
  $('#me-name').textContent = ''
  api.info().then((i) => {
    applyCentre(i)
    $('#date-label').textContent = i.date_label
  }).catch(() => {})
  showStaffSignIn(app, { message, onSignedIn: start })
}

async function start() {
  app.replaceChildren(
    h('div', { class: 'room-layout' },
      h('div', { class: 'room-main' },
        h('p', { id: 'offline', class: 'notice', role: 'status', hidden: true }),
        h('nav', { id: 'room-strip', class: 'strip', 'aria-label': 'Rooms' }),
        h('div', { id: 'toast-home', class: 'status-line' }),
        h('section', { id: 'room-panel', class: 'meter-panel', 'aria-live': 'polite' }),
        h('h2', { class: 'section-title' }, 'Children here'),
        h('div', { id: 'children-grid', class: 'grid-children' })),
      h('div', { class: 'room-side', id: 'lists' })))
  $('#signout').hidden = false
  await refresh()
  poller = poll(refresh, 5000)
}

async function refresh() {
  if (!staffSession.token()) return signedOut()
  try {
    today = await api.today()
    const off = $('#offline')
    if (off) off.hidden = true
    whenIdle(render)
  } catch (e) {
    if (e.status === 401) return signedOut('Please sign in again.')
    const off = $('#offline')
    if (off) { off.textContent = e.message; off.hidden = false }
  }
}

function handleError(e, s) {
  if (e.status === 401) return signedOut('Please sign in again.')
  toast(e.message, { slot: s && sheet === s ? s.slot : undefined, error: true })
}

const findChild = (childId) => {
  for (const r of today?.rooms || []) {
    const child = r.children.find((c) => c.id === childId)
    if (child) return { child, room: r }
  }
  return null
}

// ---------- page ----------
function render() {
  if (!today || !$('#room-strip')) return
  applyCentre(today)
  $('#date-label').textContent = today.date_label
  $('#me-name').textContent = today.me?.staff?.name ? ` · ${today.me.staff.name}` : ''

  const rooms = today.rooms
  if (!rooms.some((r) => r.room.id === selected)) select(today.me?.room_id || rooms[0]?.room.id)
  const current = rooms.find((r) => r.room.id === selected)

  renderIf($('#room-strip'), { rooms: rooms.map((r) => [r.room, r.meter]), selected }, () => rooms.map(roomCard))
  if (!current) return
  const panel = $('#room-panel')
  panel.dataset.state = current.meter.state
  renderIf(panel, { room: current.room, meter: current.meter, staff: current.staff, me: today.me?.room_id, names: rooms.map((r) => r.room.name) },
    () => roomPanel(current, rooms))
  renderIf($('#children-grid'), { room: current.room, children: current.children }, () => childCards(current))
  const home = (c) => c.home_room_id === current.room.id
  const lists = {
    room: current.room,
    notIn: today.not_in_yet.filter(home),
    away: today.away.filter((a) => home(a.child)),
    gone: today.gone_home.filter(home),
  }
  renderIf($('#lists'), lists, () => listSections(lists))
}

function roomCard(r) {
  const { room, meter } = r
  const pct = meter.children === 0 ? 0 : !meter.allowed ? (meter.allowed === 0 ? 100 : 0) : Math.min(100, Math.round((meter.children / meter.allowed) * 100))
  return h('button', {
    type: 'button', class: 'room', 'data-room': room.id, 'data-state': meter.state, 'aria-pressed': String(room.id === selected),
    onclick: () => { select(room.id); render() },
  },
  h('span', { class: 'room-name' }, room.name),
  meterPill(meter),
  h('span', { class: 'room-count' }, `${childrenCount(meter.children)} · ${meter.staff} staff`),
  h('span', { class: 'bar', 'aria-hidden': 'true' }, h('span', { class: 'bar-fill', style: `width: ${pct}%` })))
}

function roomPanel(cur, rooms) {
  const mine = today.me?.room_id || null
  const inHere = mine === cur.room.id
  const other = rooms.find((r) => r.room.id === mine)
  return [
    h('div', { class: 'meter-head' }, h('h2', {}, cur.room.name), meterPill(cur.meter)),
    h('p', { id: 'room-label' }, cur.meter.label),
    h('button', {
      type: 'button', id: 'presence', class: `btn btn-block ${inHere ? 'btn-outline' : 'btn-primary'}`,
      onclick: (e) => setPresence(inHere ? null : cur.room.id, e.currentTarget),
    }, inHere ? 'I\'m leaving this room' : 'I\'m in this room'),
    h('p', { class: 'hint' }, inHere ? `You are counted in ${cur.room.name}.`
      : other ? `You are counted in ${other.room.name}. This moves you here.` : 'You are not counted in any room.'),
    h('div', { class: 'staff-chips', role: 'list', 'aria-label': 'Staff in this room' },
      cur.staff.length
        ? cur.staff.map((s) => h('span', { class: 'staff-chip', role: 'listitem' }, avatar(s.initials, null, 'sm'), h('span', {}, s.name),
          s.since_label ? h('span', { class: 'faint' }, sinceLabel(s.since_label)) : null))
        : h('span', { class: 'empty' }, 'No staff in this room.')),
  ]
}

async function setPresence(roomId, btn) {
  btn.disabled = true
  try {
    await api.presence(roomId)
    await refresh()
  } catch (e) {
    handleError(e)
  } finally {
    if (btn.isConnected) btn.disabled = false
  }
}

function childCards(cur) {
  if (!cur.children.length) return h('p', { class: 'empty' }, 'No children signed in to this room.')
  return cur.children.map((c) => h('button', {
    type: 'button', class: 'child', 'data-child': c.id, onclick: (e) => openChild(c.id, e.currentTarget),
  },
  h('span', { class: 'child-top' }, avatar(c.initials, cur.room.age_group), h('span', { class: 'child-name' }, c.name)),
  h('span', { class: 'child-sub' }, inLabel(c.in_label)),
  c.last_meal_label ? h('span', { class: 'child-sub' }, c.last_meal_label) : null,
  c.napping || c.awaiting_signature
    ? h('span', { class: 'chips-inline' },
      c.napping ? h('span', { class: 'chip chip-asleep' }, icon('moon', { size: 13 }), 'Asleep') : null,
      c.awaiting_signature ? h('span', { class: 'chip chip-sign' }, 'Signature needed') : null)
    : null))
}

function listSections({ room, notIn, away, gone }) {
  const row = (c, ...rest) => h('li', { class: 'list-row' }, avatar(c.initials, room.age_group, 'sm'), h('span', { class: 'grow' }, c.name), ...rest)
  return [
    h('h2', { class: 'section-title' }, 'Not in yet'),
    notIn.length
      ? h('ul', { class: 'list', id: 'not-in-yet' }, notIn.map((c) => row(c,
        h('button', { type: 'button', class: 'btn btn-quiet record', 'data-child': c.id, onclick: (e) => openRecord(c, e.currentTarget) },
          icon('pen', { size: 18 }), 'Record without a signature'))))
      : h('p', { class: 'empty' }, 'No one else is expected in this room today.'),
    h('h2', { class: 'section-title' }, 'Away today'),
    away.length
      ? h('ul', { class: 'list' }, away.map((a) => row(a.child, h('span', { class: 'chip chip-away' }, a.reason_label))))
      : h('p', { class: 'empty' }, 'No one is away today.'),
    gone.length ? [h('h2', { class: 'section-title' }, 'Gone home'), h('ul', { class: 'list' }, gone.map((c) => row(c)))] : null,
  ]
}

// ---------- sheets ----------
function openSheet({ id, title, subtitle, initials, ageGroup, opener }) {
  closeSheet()
  // A page message belongs to the page; toasts in a sheet use the sheet's own reserved slot.
  hideToast()
  const statusText = h('span', { class: 'sheet-status-text' }, subtitle || '')
  const slot = h('div', { class: 'sheet-status' }, statusText)
  const body = h('div', { class: 'sheet-body' })
  const titleEl = h('h2', { id: `${id}-title`, class: 'sheet-title' }, title)
  const avatarHost = h('span', { class: 'sheet-avatar' }, initials ? avatar(initials, ageGroup, 'md') : null)
  const close = h('button', { type: 'button', class: 'btn btn-quiet sheet-close', 'aria-label': 'Close', onclick: () => closeSheet() }, icon('close', { size: 22 }))
  const el = h('section', { id, class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleEl.id },
    h('header', { class: 'sheet-head', 'data-sticky-header': true },
      h('div', { class: 'sheet-title-row' }, avatarHost, h('div', { class: 'grow' }, titleEl), close),
      slot),
    body)
  const backdrop = h('div', { class: 'backdrop', onclick: () => closeSheet() })
  document.body.append(backdrop, el)
  document.documentElement.classList.add('sheet-open')
  sheet = { id, el, backdrop, body, slot, statusText, titleEl, opener }
  close.focus({ preventScroll: true })
  return sheet
}

function closeSheet() {
  if (!sheet) return
  const s = sheet
  sheet = null
  hideToast()
  const t = document.getElementById('toast')
  const home = $('#toast-home')
  if (t && home) home.append(t)
  s.el.remove()
  s.backdrop.remove()
  document.documentElement.classList.remove('sheet-open')
  const back = s.opener?.isConnected ? s.opener : s.childId ? $(`button.child[data-child="${CSS.escape(s.childId)}"]`) : null
  back?.focus({ preventScroll: true })
  whenIdle(render)
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheet) closeSheet() })

async function openChild(childId, opener) {
  const found = findChild(childId)
  const s = openSheet({
    id: 'child-sheet',
    title: found?.child.name || 'Child',
    subtitle: found ? `${found.room.room.name} · ${inLabel(found.child.in_label)}` : '',
    initials: found?.child.initials,
    ageGroup: found?.room.room.age_group,
    opener,
  })
  s.childId = childId
  s.meal = mealFor(today?.now_local)
  // No control is on the sheet until the child's data is in, so nothing moves under a finger while it loads.
  s.body.append(h('p', { class: 'empty sheet-loading' }, 'Loading…'))
  const sections = childSections(s)
  if (await refreshSheet(s)) s.body.replaceChildren(...sections)
}

function childSections(s) {
  const logBtn = (kind, value, label, extra) => h('button', {
    type: 'button', class: 'btn log', 'data-kind': kind, 'data-value': value,
    onclick: (e) => doLog(s, { kind, ...(value ? { value } : {}), ...(extra ? extra() : {}) }, e.currentTarget),
  }, label)
  const mealChips = MEALS.map(([key, label]) => h('button', {
    type: 'button', class: 'meal', 'data-meal': key, 'aria-pressed': String(key === s.meal),
    onclick: () => {
      s.meal = key
      for (const b of $$('button.meal', s.el)) b.setAttribute('aria-pressed', String(b.dataset.meal === key))
    },
  }, label))
  const meal = () => ({ meal: s.meal })

  s.sleep = h('div', { class: 'btn-row' })
  s.moves = h('div', { class: 'move-list' })
  s.logs = h('ul', { class: 'list', id: 'today-logs' })

  const noteText = h('textarea', { id: 'note-text', name: 'text', maxlength: '280', rows: '3' })
  const noteSection = h('section', { class: 'sheet-section' },
    h('h3', {}, h('label', { for: 'note-text' }, 'Note')),
    noteText,
    h('p', { class: 'faint small' }, 'Up to 280 characters. It shows in the daily note under Notes from staff.'),
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', id: 'save-note', class: 'btn btn-primary', onclick: (e) => saveNote(s, noteSection, noteText, e.currentTarget) }, 'Save note')))

  return [
    h('section', { class: 'sheet-section', 'aria-label': 'Meals' },
      h('h3', {}, 'Meals'),
      h('div', { class: 'chips', role: 'group', 'aria-label': 'Which meal' }, mealChips),
      h('div', { class: 'log-grid' },
        logBtn('meal', 'all', 'Ate all', meal), logBtn('meal', 'some', 'Ate some', meal), logBtn('meal', 'none', 'Ate none', meal))),
    h('section', { class: 'sheet-section', 'aria-label': 'Sleep' }, h('h3', {}, 'Sleep'), s.sleep),
    h('section', { class: 'sheet-section', 'aria-label': 'Diapers and toilet' },
      h('h3', {}, 'Diapers and toilet'),
      h('div', { class: 'log-grid' },
        logBtn('diaper', 'wet', 'Wet diaper'), logBtn('diaper', 'bm', 'BM diaper'), logBtn('diaper', 'dry', 'Dry diaper'),
        logBtn('toilet', 'went', 'Used the toilet'), logBtn('toilet', 'tried', 'Tried the toilet'))),
    h('section', { class: 'sheet-section', 'aria-label': 'Mood' },
      h('h3', {}, 'Mood'),
      h('div', { class: 'log-grid' },
        logBtn('mood', 'happy', 'Happy'), logBtn('mood', 'okay', 'Okay'), logBtn('mood', 'tired', 'Tired'), logBtn('mood', 'upset', 'Upset'))),
    noteSection,
    h('section', { class: 'sheet-section', 'aria-label': 'Move to another room' }, h('h3', {}, 'Move to another room'), s.moves),
    // Daily note sits above Today: Today grows with every log, and anything below it would slide under a finger.
    h('section', { class: 'sheet-section' },
      h('a', { id: 'open-note', class: 'btn btn-outline btn-block', href: `/room/note/?child=${encodeURIComponent(s.childId)}` }, icon('note'), 'Daily note')),
    h('section', { class: 'sheet-section', 'aria-label': 'Today' }, h('h3', {}, 'Today'), s.logs),
  ]
}

/** Re-read this child and redraw the parts of the sheet that can change. Only called on open and after a write in the sheet.
 *  Resolves true when the sheet is still open and drawn. */
async function refreshSheet(s) {
  let d
  try {
    d = await api.child(s.childId)
  } catch (e) {
    handleError(e, s)
    return false
  }
  if (sheet !== s) return false
  s.data = d
  const logs = [...d.logs].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
  // Nap state comes from this fresh answer, never from the last 5-second poll: another phone may have started the nap since.
  let napping = false
  for (const l of logs) { if (l.kind === 'nap_start') napping = true; if (l.kind === 'nap_end') napping = false }

  s.titleEl.textContent = d.child.name
  const open = d.visit && !d.visit.out_at
  s.statusText.textContent = open ? `${d.child.room_name} · ${inLabel(d.visit.in_label)}` : 'Not signed in right now.'

  renderIf(s.sleep, { napping }, () => h('button', {
    type: 'button', class: 'btn log', 'data-kind': napping ? 'nap_end' : 'nap_start',
    onclick: (e) => doLog(s, { kind: napping ? 'nap_end' : 'nap_start' }, e.currentTarget),
  }, icon('moon', { size: 18 }), napping ? 'Nap end' : 'Nap start'))

  const rooms = today?.rooms || []
  renderIf(s.moves, { at: d.child.room_id, rooms: rooms.map((r) => [r.room, r.meter]) }, () => {
    if (!d.child.room_id) return h('p', { class: 'empty' }, 'Sign the child in first.')
    return rooms.filter((r) => r.room.id !== d.child.room_id).map((r) => h('button', {
      type: 'button', class: 'btn move', 'data-room': r.room.id, onclick: (e) => doMove(s, e.currentTarget),
    },
    h('span', { class: 'move-name' }, r.room.name, h('span', { class: 'faint move-count' }, `${childrenCount(r.meter.children)} · ${r.meter.staff} staff`)),
    meterPill(r.meter)))
  })

  // The Worker lets an educator void only their own logs and the supervisor any; the page offers Undo only where it will work.
  const me = staffSession.staff()
  const canUndo = (log) => !!me && (me.role === 'supervisor' || log.by?.id === me.id)
  renderIf(s.logs, { logs, me: me?.id }, () => {
    if (!logs.length) return h('li', { class: 'empty' }, 'Nothing logged yet today.')
    return [...logs].reverse().map((log) => h('li', { class: 'list-row', 'data-log': log.id },
      h('span', { class: 'grow' }, h('span', { class: 'log-label' }, log.label),
        h('span', { class: 'faint log-meta' }, `${log.time_label}${log.by?.initials ? ` · ${log.by.initials}` : ''}`)),
      canUndo(log) ? h('button', { type: 'button', class: 'btn btn-quiet undo', onclick: (e) => undoLog(s, log, e.currentTarget) }, 'Undo') : null))
  })
  return true
}

async function afterWrite(s) {
  await refresh()
  if (sheet === s) await refreshSheet(s)
}

async function doLog(s, body, btn) {
  if (btn.disabled) return
  btn.disabled = true
  let log
  try {
    ({ log } = await api.log(s.childId, body))
  } catch (e) {
    btn.disabled = false
    if ((e.code === 'already_napping' || e.code === 'not_napping') && sheet === s) {
      // Someone else changed the nap: redraw the sheet from the server, then say what the API said.
      await afterWrite(s)
      if (sheet === s) toast(e.message, { slot: s.slot, error: true })
      return
    }
    return handleError(e, s)
  } finally {
    if (btn.isConnected) btn.disabled = false
  }
  if (sheet === s) toast(`Saved: ${log.label}`, { slot: s.slot, action: 'Undo', onAction: () => undoLog(s, log) })
  await afterWrite(s)
}

async function undoLog(s, log, btn) {
  if (btn) btn.disabled = true
  try {
    await api.undo(log.id)
    if (sheet === s) toast(`Removed: ${log.label}`, { slot: s.slot })
    await afterWrite(s)
  } catch (e) {
    handleError(e, s)
    if (btn?.isConnected) btn.disabled = false
  }
}

async function saveNote(s, section, textarea, btn) {
  clearErrors(section)
  btn.disabled = true
  try {
    const { log } = await api.log(s.childId, { kind: 'note', text: textarea.value })
    textarea.value = ''
    if (sheet === s) toast(`Saved: ${log.label}`, { slot: s.slot, action: 'Undo', onAction: () => undoLog(s, log) })
    await afterWrite(s)
  } catch (e) {
    if (e.status === 401) return signedOut('Please sign in again.')
    if (!showError(section, e)) handleError(e, s)
  } finally {
    btn.disabled = false
  }
}

async function doMove(s, btn) {
  btn.disabled = true
  try {
    const r = await api.move(s.childId, btn.dataset.room)
    if (sheet === s) toast(r.message, { slot: s.slot })
    await afterWrite(s)
  } catch (e) {
    handleError(e, s)
    if (btn.isConnected) btn.disabled = false
  }
}

async function openRecord(child, opener) {
  const home = today?.rooms.find((r) => r.room.id === child.home_room_id)
  const s = openSheet({ id: 'record-sheet', title: 'Record without a signature', subtitle: child.name, initials: child.initials, ageGroup: home?.room.age_group, opener })
  s.childId = child.id
  const question = `Who dropped off ${child.name}?`
  const list = h('div', { class: 'person-list', role: 'group', 'aria-label': question }, h('p', { class: 'empty' }, 'Loading the list…'))
  const error = h('p', { class: 'field-error', role: 'alert', hidden: true })
  s.body.append(h('section', { class: 'sheet-section' },
    h('h3', {}, question),
    list,
    error,
    h('p', { class: 'faint small' }, 'The time is kept with your initials and the drop-off shows "Signature needed". The parent can add a signature at the door later.')))
  try {
    const d = await api.child(child.id)
    if (sheet !== s) return
    list.replaceChildren(...(d.people.length
      ? d.people.map((p) => h('button', {
        type: 'button', class: 'btn person', 'data-person': p.id, onclick: (e) => record(s, p, e.currentTarget, error),
      }, h('span', {}, p.name), h('span', { class: 'faint' }, p.relationship)))
      : [h('p', { class: 'empty' }, 'No one is on this child\'s list. The supervisor adds people in the office.')]))
  } catch (e) {
    handleError(e, s)
  }
}

async function record(s, person, btn, error) {
  btn.disabled = true
  error.hidden = true
  try {
    const r = await api.recordIn(s.childId, person.id)
    closeSheet()
    toast(r.message)
    await refresh()
  } catch (e) {
    if (e.status === 401) return signedOut('Please sign in again.')
    error.textContent = e.message
    error.hidden = false
    btn.disabled = false
  }
}

// ---------- boot ----------
if (staffSession.token()) start()
else signedOut()
