// Office (supervisor only): Today, Children, Rooms and ratios, Staff, Attendance. Talks only to docs/API.md through /api.js.
// Every write re-reads the tab from the API, so what the page shows after saving is what the Worker kept.
import { api, staffSession } from '/api.js'
import { h, $, $$, toast, avatar, meterPill, childrenCount, showError, clearErrors, icon } from '/ui.js'
import { createKeypad } from '/keypad.js'
import { showAttendance } from '/office/attendance.js'
import { addDays } from '/office/dates.js'

const app = $('#app')
const TAB_KEY = 'daycare-day-sheet:office-tab'
const TABS = [['today', 'Today'], ['children', 'Children'], ['rooms', 'Rooms and ratios'], ['staff', 'Staff'], ['attendance', 'Attendance']]
const DAYS = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']]
const MIXED_AGES = 'A room of other mixed ages uses the youngest child\'s group (NLR 39/17 s.54(9)).'

let info = null
let tab = 'today'
try { const saved = sessionStorage.getItem(TAB_KEY); if (TABS.some(([k]) => k === saved)) tab = saved } catch { /* no storage */ }
const attendanceState = { view: 'week', anchor: null }
const childrenState = { selected: null }
const listOf = (data, key) => (Array.isArray(data) ? data : Array.isArray(data?.[key]) ? data[key] : [])

// ---------- session ----------
$('#signout').addEventListener('click', async () => {
  try { await api.signout() } catch { /* the token is forgotten either way */ }
  signIn()
})

function closeDialogs() {
  for (const d of $$('dialog')) { if (d.open) d.close(); d.remove() }
}

async function loadInfo() {
  try {
    info = await api.info()
    if (info.centre_name) $('#centre-name').textContent = info.centre_name
  } catch { /* the header keeps its text */ }
}

function signIn(message) {
  closeDialogs()
  $('#signout').hidden = true
  $('#office-meta').textContent = 'Office'
  const wrap = h('div', { class: 'signin-wrap' })
  const pad = createKeypad({
    title: 'Office sign in',
    hint: 'The supervisor\'s PIN.',
    onSubmit: async (pin) => {
      const r = await api.signin(pin)
      pad.destroy()
      if (r.role === 'supervisor') startOffice()
      else refused()
    },
  })
  wrap.append(pad.el)
  app.replaceChildren(wrap)
  if (message) pad.showError(message)
}

function refused() {
  closeDialogs()
  $('#signout').hidden = false
  const who = staffSession.staff()
  app.replaceChildren(h('section', { class: 'panel refused' },
    h('p', { id: 'office-refused', class: 'alert', role: 'alert' }, 'Only the supervisor can open the office.'),
    who ? h('p', { class: 'muted' }, `Signed in as ${who.name}.`) : null,
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn btn-primary', onclick: async () => { try { await api.signout() } catch { /* ignore */ } signIn() } }, 'Sign out and use another PIN'),
      h('a', { class: 'btn btn-outline', href: '/room/' }, 'Go to the room view'))))
}

/** Run an API call; on failure show the API text under the named field (or in `status`) and resolve null. */
async function attempt(scope, status, work) {
  if (scope) clearErrors(scope)
  try {
    return await work()
  } catch (e) {
    if (e.status === 401) { signIn('Please sign in again.'); return null }
    if (e.status === 403 && e.code === 'forbidden') { refused(); return null }
    if (!(scope && showError(scope, e))) {
      if (status) toast(e.message, { slot: status, error: true })
      else $('#office-panel')?.prepend(h('p', { class: 'alert', role: 'alert' }, e.message))
    }
    return null
  }
}

// ---------- tabs ----------
async function startOffice() {
  $('#signout').hidden = false
  await loadInfo()
  attendanceState.anchor ??= info?.today
  $('#office-meta').textContent = info?.date_label ? `Office · ${info.date_label}` : 'Office'
  const tabs = TABS.map(([key, label]) => h('button', {
    type: 'button', role: 'tab', id: `tab-${key}`, class: 'office-tab', 'aria-controls': 'office-panel',
    'aria-selected': String(key === tab), tabindex: key === tab ? '0' : '-1', onclick: () => select(key), onkeydown: tabKeys,
  }, label))
  app.replaceChildren(h('div', { class: 'office-layout' },
    h('div', { class: 'office-tabs', role: 'tablist', 'aria-label': 'Office' }, tabs),
    h('section', { id: 'office-panel', class: 'office-panel', role: 'tabpanel', 'aria-labelledby': `tab-${tab}` })))
  await select(tab)
}

function tabKeys(e) {
  const keys = TABS.map(([k]) => k)
  const i = keys.indexOf(tab)
  const next = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
  if (!next) return
  e.preventDefault()
  const key = keys[(i + next + keys.length) % keys.length]
  select(key).then(() => $(`#tab-${key}`)?.focus())
}

let renderSeq = 0
const refresh = () => select(tab, { refresh: true })

async function select(key, { refresh: again = false } = {}) {
  closeDialogs()
  tab = key
  try { sessionStorage.setItem(TAB_KEY, key) } catch { /* no storage */ }
  for (const b of $$('.office-tab')) {
    const on = b.id === `tab-${key}`
    b.setAttribute('aria-selected', String(on))
    b.tabIndex = on ? 0 : -1
  }
  const panel = $('#office-panel')
  if (!panel) return
  panel.setAttribute('aria-labelledby', `tab-${key}`)
  const seq = ++renderSeq
  if (!again) panel.replaceChildren(h('p', { class: 'empty' }, 'Loading…'))
  const builders = {
    today: showToday,
    children: showChildren,
    rooms: showRooms,
    staff: showStaff,
    attendance: () => showAttendance({ today: info?.today, state: attendanceState, attempt, refresh }),
  }
  const nodes = await builders[key]()
  if (seq !== renderSeq || nodes == null || !$('#office-panel')) return
  $('#office-panel').replaceChildren(...[nodes].flat(Infinity).filter(Boolean))
}

const title = (text, sub) => h('div', { class: 'office-head' }, h('h1', { class: 'office-title' }, text), sub ? h('p', { class: 'muted' }, sub) : null)
const status = (id) => h('div', { class: 'status-line', id })
const field = (label, input, hint) => h('div', { class: 'field' }, h('label', { for: input.id }, label), input, hint ? h('p', { class: 'faint small' }, hint) : null)
function input(id, name, type, value, extra = {}) {
  const el = h('input', { id, name, type, ...extra })
  if (value !== null && value !== undefined) el.value = value
  return el
}
const switchInput = (id, name, label, checked, extra = {}) => h('label', { class: `switch switch-${name}`, for: id },
  h('input', { id, type: 'checkbox', role: 'switch', name, class: 'switch-input', checked: !!checked, ...extra }), h('span', {}, label))

// ---------- Today ----------
async function showToday() {
  const today = await attempt(null, null, () => api.today())
  if (!today) return null
  const attendance = await attempt(null, null, () => api.attendance(addDays(today.date, -13), today.date))
  const inNow = today.rooms.reduce((n, r) => n + r.children.length, 0)
  const signatureNeeded = today.rooms.flatMap((r) => r.children.filter((c) => c.awaiting_signature).map((c) => ({ child: c, room: r.room })))
  const notSignedOut = []
  for (const c of attendance?.children || []) {
    for (const d of attendance.dates) if (d < today.date && c.days[d]?.open) notSignedOut.push({ child: c, date: d })
  }
  const count = (label, n, id) => h('div', { class: 'count-card', id }, h('span', { class: 'count-number' }, String(n)), h('span', { class: 'count-label' }, label))
  const listCard = (heading, rows, empty) => h('section', { class: 'panel' }, h('h2', { class: 'panel-title' }, heading), rows.length ? h('ul', { class: 'row-list' }, rows) : h('p', { class: 'empty' }, empty))

  return [
    title('Today', today.date_label),
    h('div', { class: 'count-grid' },
      count('In now', inNow, 'count-in'), count('Not in yet', today.not_in_yet.length, 'count-not-in'),
      count('Away', today.away.length, 'count-away'), count('Gone home', today.gone_home.length, 'count-gone')),
    h('h2', { class: 'section-title' }, 'Rooms'),
    h('div', { class: 'meter-grid' }, today.rooms.map((r) => h('article', { class: 'meter-card', 'data-room-card': r.room.id, 'data-state': r.meter.state },
      h('div', { class: 'meter-head' }, h('h3', {}, r.room.name), meterPill(r.meter)),
      h('p', { class: 'meter-label' }, r.meter.label),
      h('p', { class: 'muted small' }, `${childrenCount(r.meter.children)} · ${r.meter.staff} staff`),
      h('a', { class: 'btn btn-outline print-register', 'data-room': r.room.id, href: `/office/register/?date=${encodeURIComponent(today.date)}&room=${encodeURIComponent(r.room.id)}` },
        icon('print'), 'Print the daily register')))),
    h('div', { class: 'two-col' },
      listCard('Signature needed', signatureNeeded.map(({ child, room }) => h('li', { class: 'list-row' },
        avatar(child.initials, room.age_group, 'sm'), h('span', { class: 'grow' }, child.name, h('span', { class: 'muted small block' }, `${room.name} · in since ${child.in_label}`)))),
      'No signatures are waiting.'),
      listCard('Not signed out', notSignedOut.map(({ child, date }) => h('li', { class: 'list-row' },
        h('span', { class: 'grow' }, child.name, h('span', { class: 'muted small block' }, date)),
        h('button', { type: 'button', class: 'btn btn-quiet', onclick: () => { attendanceState.view = 'week'; attendanceState.anchor = date; select('attendance') } }, 'Fix a time'))),
      'Every visit in the last two weeks is signed out.')),
  ]
}

// ---------- Children ----------
async function showChildren() {
  const [data, roomsData] = await Promise.all([attempt(null, null, () => api.officeChildren()), attempt(null, null, () => api.rooms())])
  if (!data || !roomsData) return null
  const rooms = listOf(roomsData, 'rooms')
  const children = data.children
  const selected = childrenState.selected === 'new' ? null : children.find((c) => c.id === childrenState.selected)
  const roomOf = (c) => rooms.find((r) => r.id === c.home_room_id)
  const row = (c) => h('button', {
    type: 'button', class: 'row-btn', 'data-child-row': c.id, 'aria-pressed': String(c.id === childrenState.selected),
    onclick: () => { childrenState.selected = c.id; refresh().then(showDetail) },
  },
  avatar(c.initials, roomOf(c)?.age_group, 'sm'),
  h('span', { class: 'grow' }, h('span', { class: 'row-title' }, c.name), h('span', { class: 'muted small block' }, `${roomOf(c)?.name || ''} · ${c.age_label}`)),
  c.active ? null : h('span', { class: 'chip' }, 'No longer registered'))

  const active = children.filter((c) => c.active)
  const gone = children.filter((c) => !c.active)
  const detail = childrenState.selected === 'new'
    ? childForm(null, rooms)
    : selected ? [childForm(selected, rooms), peopleSection(selected)] : h('p', { class: 'empty' }, 'Pick a child, or add one.')
  return [
    title('Children', `${active.length} registered`),
    h('div', { class: 'split' },
      h('div', { class: 'office-list' },
        h('div', { class: 'btn-row' }, h('button', { type: 'button', id: 'add-child', class: 'btn btn-primary', onclick: () => { childrenState.selected = 'new'; refresh().then(showDetail) } }, 'Add a child')),
        h('div', { class: 'row-list' }, active.map(row)),
        gone.length ? [h('h2', { class: 'section-title' }, 'No longer registered'), h('div', { class: 'row-list' }, gone.map(row))] : null),
      h('div', { class: 'detail', id: 'child-detail' }, detail)),
  ]
}

/** On a narrow screen the detail sits under the list; bring it up after picking a child. */
function showDetail() {
  if (matchMedia('(max-width: 959px)').matches) $('#child-detail')?.scrollIntoView({ block: 'start' })
}

function childForm(c, rooms) {
  const isNew = !c
  const days = c?.days || ['mon', 'tue', 'wed', 'thu', 'fri']
  const room = h('select', { id: 'child-home_room_id', name: 'home_room_id' },
    rooms.filter((r) => r.active || r.id === c?.home_room_id).map((r) => h('option', { value: r.id, selected: r.id === c?.home_room_id }, r.name)))
  const schedule = h('select', { id: 'child-schedule', name: 'schedule' },
    [['full_time', 'Full time'], ['part_time', 'Part time']].map(([v, l]) => h('option', { value: v, selected: (c?.schedule || 'full_time') === v }, l)))
  const form = h('form', { id: 'child-form', class: 'panel', novalidate: true },
    h('h2', { class: 'panel-title' }, isNew ? 'Add a child' : c.name),
    !isNew && !c.active ? h('p', { class: 'chip' }, 'No longer registered') : null,
    field('Name', input('child-name', 'name', 'text', c?.name, { autocomplete: 'off', maxlength: '60' })),
    field('Date of birth', input('child-dob', 'dob', 'date', c?.dob)),
    field('Home room', room),
    field('Schedule', schedule),
    h('fieldset', { class: 'days', 'data-field': 'days' }, h('legend', {}, 'Days'),
      DAYS.map(([v, l]) => h('label', { class: 'day-chip' }, h('input', { type: 'checkbox', name: 'day', value: v, checked: days.includes(v) }), h('span', {}, l)))),
    field('First day', input('child-start_date', 'start_date', 'date', c?.start_date)),
    field('Last day', input('child-end_date', 'end_date', 'date', c?.end_date), 'Leave empty while the child is registered. A last day in the past marks them No longer registered.'),
    h('div', { class: 'btn-row' }, h('button', { type: 'submit', id: 'save-child', class: 'btn btn-primary' }, isNew ? 'Add child' : 'Save child')),
    status('child-status'))
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const v = (name) => form.elements.namedItem(name).value
    const body = {
      name: v('name'), dob: v('dob'), home_room_id: v('home_room_id'), schedule: v('schedule'),
      days: [...form.querySelectorAll('input[name="day"]:checked')].map((i) => i.value),
      start_date: v('start_date'), end_date: v('end_date') || null,
    }
    const r = await attempt(form, $('#child-status', form), () => (isNew ? api.addChild(body) : api.saveChild(c.id, body)))
    if (!r) return
    childrenState.selected = r.child.id
    await refresh()
    toast(isNew ? `Added ${r.child.name}.` : `Saved ${r.child.name}.`, { slot: $('#child-status') })
  })
  return form
}

function peopleSection(c) {
  const people = [...c.people].sort((a, b) => Number(b.active) - Number(a.active))
  return h('section', { class: 'panel', 'aria-label': 'People' },
    h('h2', { class: 'panel-title' }, 'People'),
    h('p', { class: 'muted small' }, 'Anyone on the list may drop off. Only people marked May pick up can sign the child out at the door.'),
    people.length ? h('ul', { class: 'row-list' }, people.map((p) => personRow(p))) : h('p', { class: 'empty' }, 'No one is on the list yet.'),
    status('people-status'),
    addPersonForm(c))
}

function personRow(p) {
  const flag = (name, label) => switchInput(`person-${p.id}-${name}`, name, label, p[name], {
    onchange: async (e) => {
      const el = e.currentTarget
      el.disabled = true
      const r = await attempt(null, $('#people-status'), () => api.savePerson(p.id, { [name]: el.checked }))
      if (!r) { el.checked = !el.checked; el.disabled = false; return }
      await refresh()
      toast(`Saved ${r.person.name}: ${label} ${r.person[name] ? 'on' : 'off'}.`, { slot: $('#people-status') })
    },
  })
  return h('li', { class: `person-row${p.active ? '' : ' is-inactive'}`, 'data-person-row': p.id },
    h('div', { class: 'grow' },
      h('span', { class: 'row-title' }, p.name),
      h('span', { class: 'muted small block' }, [p.relationship, p.phone].filter(Boolean).join(' · ')),
      p.active ? null : h('span', { class: 'chip' }, 'Removed')),
    p.active
      ? h('div', { class: 'person-actions' },
        flag('may_pick_up', 'May pick up'),
        flag('emergency_contact', 'Emergency contact'),
        h('button', {
          type: 'button', class: 'btn btn-quiet remove-person',
          onclick: async () => {
            const r = await attempt(null, $('#people-status'), () => api.removePerson(p.id))
            if (!r) return
            await refresh()
            toast(`${p.name} is off the list. The history keeps the name.`, { slot: $('#people-status') })
          },
        }, 'Remove'))
      : null)
}

function addPersonForm(c) {
  const form = h('form', { id: 'add-person', class: 'sub-form', novalidate: true },
    h('h3', {}, 'Add a person'),
    field('Name', input('person-name', 'name', 'text', '', { autocomplete: 'off' })),
    field('Relationship', input('person-relationship', 'relationship', 'text', '', { autocomplete: 'off', placeholder: 'Mother, Grandfather, Neighbour…' })),
    field('Phone', input('person-phone', 'phone', 'tel', '', { inputmode: 'tel', autocomplete: 'off' }), 'Optional. 10 digits. Shown in the office only.'),
    h('div', { class: 'switch-row' },
      switchInput('person-may_pick_up', 'may_pick_up', 'May pick up', false),
      switchInput('person-emergency_contact', 'emergency_contact', 'Emergency contact', false)),
    h('div', { class: 'btn-row' }, h('button', { type: 'submit', id: 'save-person', class: 'btn btn-primary' }, 'Add a person')),
    status('add-person-status'))
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const v = (name) => form.elements.namedItem(name)
    const body = { name: v('name').value, relationship: v('relationship').value, may_pick_up: v('may_pick_up').checked, emergency_contact: v('emergency_contact').checked }
    if (v('phone').value.trim()) body.phone = v('phone').value.trim()
    const r = await attempt(form, $('#add-person-status', form), () => api.addPerson(c.id, body))
    if (!r) return
    await refresh()
    toast(`Added ${r.person.name}.`, { slot: $('#people-status') })
  })
  return form
}

// ---------- Rooms and ratios ----------
async function showRooms() {
  const [ratios, roomsData] = await Promise.all([attempt(null, null, () => api.ratios()), attempt(null, null, () => api.rooms())])
  if (!ratios || !roomsData) return null
  return [
    title('Rooms and ratios'),
    h('p', { class: 'notice licence' }, h('strong', {}, 'Your licence may differ.'), ' ', ratios.note),
    h('section', { 'aria-label': 'Ratios' },
      h('h2', { class: 'section-title' }, 'Ratios'),
      h('div', { class: 'ratio-grid' }, ratios.rules.map(ratioCard))),
    roomsSection(listOf(roomsData, 'rooms'), ratios.rules),
  ]
}

function ratioCard(rule) {
  const g = rule.age_group
  const number = (kind, apiField, value, max, label) => h('div', { class: 'field' },
    h('label', { for: `${kind}-${g}` }, label),
    input(`${kind}-${g}`, `${kind}-${g}`, 'number', value ?? '', { 'data-field': apiField, inputmode: 'numeric', min: '1', max: String(max), step: '1' }))
  const unset = rule.children_per_caregiver === null || rule.max_children === null
  const card = h('article', { class: `ratio-card${unset ? ' is-unset' : ''}`, 'data-rule': g },
    h('h3', {}, rule.label),
    h('p', { class: 'muted small' }, `${rule.citation} · the cited number: 1 staff for ${rule.default_children_per_caregiver} children, at most ${rule.default_max_children} in the room`),
    h('div', { class: 'ratio-inputs' },
      number('per', 'children_per_caregiver', rule.children_per_caregiver, 50, 'Children per staff'),
      number('max', 'max_children', rule.max_children, 60, 'Most in the room')),
    unset ? h('p', { class: 'not-set-row', 'data-not-set': g }, h('strong', {}, 'Not set.'), ' Rooms of this age group show Not set until both numbers are filled in.') : null,
    rule.edited && !unset ? h('p', { class: 'edited-note' }, 'Changed from the cited number.') : null,
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn btn-primary save-ratio', 'data-group': g, onclick: () => saveRatio(card, g) }, 'Save'),
      h('button', { type: 'button', class: 'btn btn-outline reset-ratio', 'data-group': g, onclick: () => resetRatio(g) }, 'Back to the cited number')),
    status(`ratio-status-${g}`))
  return card
}

async function saveRatio(card, g) {
  const read = (kind) => { const v = card.querySelector(`[name="${kind}-${g}"]`).value.trim(); return v === '' ? null : Number(v) }
  const r = await attempt(card, $(`#ratio-status-${g}`), () => api.saveRatio(g, { children_per_caregiver: read('per'), max_children: read('max') }))
  if (!r) return
  await refresh()
  toast('Saved. The room view uses it now.', { slot: $(`#ratio-status-${g}`) })
}

async function resetRatio(g) {
  const r = await attempt(null, $(`#ratio-status-${g}`), () => api.resetRatio(g))
  if (!r) return
  await refresh()
  toast('Back to the cited number.', { slot: $(`#ratio-status-${g}`) })
}

function ageGroupSelect(id, rules, value) {
  return h('select', { id, name: 'age_group' }, rules.map((rule) => h('option', { value: rule.age_group, selected: rule.age_group === value }, rule.label)))
}

function roomsSection(rooms, rules) {
  const sorted = [...rooms].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
  return h('section', { 'aria-label': 'Rooms' },
    h('h2', { class: 'section-title' }, 'Rooms'),
    h('p', { class: 'muted small mixed-ages' }, MIXED_AGES),
    h('div', { class: 'room-forms' }, sorted.map((room) => roomForm(room, rules)), roomForm(null, rules)))
}

function roomForm(room, rules) {
  const isNew = !room
  const key = room?.id || 'new'
  const form = h('form', { class: 'panel room-form', 'data-room-form': key, novalidate: true },
    h('h3', {}, isNew ? 'Add a room' : room.name),
    field('Name', input(`room-${key}-name`, 'name', 'text', room?.name, { autocomplete: 'off' })),
    field('Age group', ageGroupSelect(`room-${key}-age_group`, rules, room?.age_group || 'preschool'), isNew ? MIXED_AGES : null),
    field('Order on the screens', input(`room-${key}-sort`, 'sort', 'number', room?.sort ?? 10, { inputmode: 'numeric', min: '0', step: '1' })),
    isNew ? null : switchInput(`room-${key}-active`, 'active', 'Open', room.active),
    h('div', { class: 'btn-row' }, h('button', { type: 'submit', class: 'btn btn-primary' }, isNew ? 'Add room' : 'Save room')),
    status(`room-status-${key}`))
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const v = (name) => form.elements.namedItem(name)
    const body = { name: v('name').value, age_group: v('age_group').value, sort: Number(v('sort').value || 0) }
    if (!isNew) body.active = v('active').checked
    const r = await attempt(form, $(`#room-status-${key}`, form), () => (isNew ? api.addRoom(body) : api.saveRoom(room.id, body)))
    if (!r) return
    await refresh()
    toast(isNew ? `Added ${r.room.name}.` : `Saved ${r.room.name}.`, { slot: $(`#room-status-${r.room.id}`) || $('#room-status-new') })
  })
  return form
}

// ---------- Staff ----------
async function showStaff() {
  const data = await attempt(null, null, () => api.staffList())
  if (!data) return null
  const staff = listOf(data, 'staff')
  return [
    title('Staff', 'PINs are never shown. Set a new one to change it.'),
    h('div', { class: 'room-forms' }, staff.map((s) => staffForm(s)), staffForm(null)),
  ]
}

function staffForm(s) {
  const isNew = !s
  const key = s?.id || 'new'
  const role = h('select', { id: `staff-${key}-role`, name: 'role' },
    [['educator', 'Educator'], ['supervisor', 'Supervisor']].map(([v, l]) => h('option', { value: v, selected: (s?.role || 'educator') === v }, l)))
  const form = h('form', { class: `panel staff-form${s && !s.active ? ' is-inactive' : ''}`, 'data-staff-form': key, novalidate: true },
    h('div', { class: 'staff-head' }, s ? avatar(s.initials, null, 'sm') : null, h('h3', {}, isNew ? 'Add staff' : s.name)),
    field('Name', input(`staff-${key}-name`, 'name', 'text', s?.name, { autocomplete: 'off' })),
    field('Role', role),
    field(isNew ? 'PIN' : 'New PIN', input(`staff-${key}-pin`, 'pin', 'password', '', { inputmode: 'numeric', autocomplete: 'new-password', maxlength: '6' }),
      isNew ? '4 to 6 digits. Every staff member has their own.' : 'Leave empty to keep the current PIN.'),
    isNew ? null : switchInput(`staff-${key}-active`, 'active', 'Active', s.active),
    h('div', { class: 'btn-row' }, h('button', { type: 'submit', class: 'btn btn-primary' }, isNew ? 'Add staff' : 'Save')),
    status(`staff-status-${key}`))
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const v = (name) => form.elements.namedItem(name)
    const body = { name: v('name').value, role: v('role').value }
    if (isNew) { body.active = true; body.pin = v('pin').value } else {
      body.active = v('active').checked
      if (v('pin').value) body.pin = v('pin').value
    }
    const r = await attempt(form, $(`#staff-status-${key}`, form), () => (isNew ? api.addStaff(body) : api.saveStaff(s.id, body)))
    if (!r) return
    await refresh()
    toast(isNew ? `Added ${r.staff.name}.` : `Saved ${r.staff.name}.`, { slot: $(`#staff-status-${r.staff.id}`) })
  })
  return form
}

// ---------- boot ----------
loadInfo()
if (!staffSession.token()) signIn()
else if (staffSession.role() !== 'supervisor') refused()
else startOffice()
