// Staff daily note: /room/note/?child=<id>&date=<YYYY-MM-DD optional>.
// The note exactly as a parent sees it (note/render.js), then "A line from your educator", "What we did today" per room, the parent
// link (today only) and Print. Nothing is sent from here: the link is copied or the note is printed.
import { api, staffSession } from '/api.js'
import { h, $, renderIf, showError, clearErrors, toast, icon } from '/ui.js'
import { renderNote } from '/note/render.js'
import { showStaffSignIn } from '/room/session.js'

const params = new URLSearchParams(location.search)
const childId = params.get('child')
const date = params.get('date') || undefined
const app = $('#app')

function reauth() {
  showStaffSignIn(app, { message: 'Please sign in again.', onSignedIn: load })
}

async function load() {
  app.replaceChildren(h('p', { class: 'empty' }, 'Loading the note…'))
  try {
    const [note, today, detail] = await Promise.all([api.note(childId, date), api.today(), api.child(childId)])
    build(note, today, detail)
  } catch (e) {
    if (e.status === 401) return reauth()
    app.replaceChildren(h('p', { id: 'page-error', class: 'alert', role: 'alert' }, e.message))
  }
}

function build(note, today, detail) {
  const isToday = note.date === today.date
  $('#centre-name').textContent = note.centre_name
  document.title = `Daily note: ${note.child.name}`

  const noteEl = h('article', { id: 'note', class: 'note' })
  renderIf(noteEl, note, renderNote)

  // A line from your educator
  const line = h('textarea', { id: 'note-line', name: 'text', maxlength: '500', rows: '3' }, note.note_line || '')
  const lineSection = h('section', { class: 'panel no-print' },
    h('h2', { class: 'panel-title' }, h('label', { for: 'note-line' }, 'A line from your educator')),
    line,
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', id: 'save-line', class: 'btn btn-primary', onclick: (e) => saveLine(lineSection, line, e.currentTarget) }, 'Save')))

  // What we did today: the rooms in the note, plus the room the child is in now
  const byName = new Map(today.rooms.map((r) => [r.room.name, r.room]))
  const roomIds = new Set()
  for (const a of note.activities || []) { const r = byName.get(a.room_name); if (r) roomIds.add(r.id) }
  if (detail.child.room_id) roomIds.add(detail.child.room_id)
  if (!roomIds.size && detail.child.home_room_id) roomIds.add(detail.child.home_room_id)
  const activitySection = isToday
    ? h('section', { class: 'panel no-print' },
      h('h2', { class: 'panel-title' }, 'What we did today'),
      h('p', { class: 'faint small' }, 'One line for the whole room. It shows on the note of every child in that room today.'),
      [...roomIds].map((rid) => {
        const room = today.rooms.find((r) => r.room.id === rid)?.room
        if (!room) return null
        const text = (note.activities || []).find((a) => a.room_name === room.name)?.text || ''
        const ta = h('textarea', { id: `activity-${rid}`, class: 'activity', 'data-room': rid, name: 'text', maxlength: '500', rows: '2' }, text)
        const field = h('div', { class: 'field' },
          h('label', { for: ta.id }, room.name),
          ta,
          h('div', { class: 'btn-row' },
            h('button', { type: 'button', class: 'btn btn-primary save-activity', 'data-room': rid, onclick: (e) => saveActivity(field, rid, ta, e.currentTarget) }, 'Save')))
        return field
      }))
    : null

  // Parent link (today only)
  const linkBox = h('div', { id: 'link-box', class: 'link-box', hidden: true })
  const linkSection = h('section', { class: 'panel no-print' },
    h('h2', { class: 'panel-title' }, 'Parent link'),
    isToday
      ? [
        h('p', { class: 'muted' }, 'Nothing is sent from here. Copy the link and share it the way your centre does, or print the note.'),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', id: 'make-link', class: 'btn btn-primary', onclick: (e) => makeLink(linkSection, linkBox, e.currentTarget) }, icon('link'), 'Make parent link')),
        linkBox,
      ]
      : h('p', { class: 'muted' }, 'Parent links are for today only.'))

  app.replaceChildren(h('div', { class: 'staff-note-layout' },
    h('div', {}, noteEl),
    h('div', { class: 'staff-note-tools' },
      lineSection,
      activitySection,
      linkSection,
      h('div', { class: 'btn-row no-print' },
        h('button', { type: 'button', id: 'print', class: 'btn btn-outline no-print', onclick: () => window.print() }, icon('print'), 'Print')))))
}

const redrawNote = (note) => { const el = $('#note'); if (el) renderIf(el, note, renderNote) }

async function saveLine(section, textarea, btn) {
  clearErrors(section)
  btn.disabled = true
  try {
    redrawNote(await api.saveLine(childId, textarea.value, date))
    toast('Saved: A line from your educator')
  } catch (e) {
    if (e.status === 401) return reauth()
    if (!showError(section, e)) toast(e.message, { error: true })
  } finally {
    btn.disabled = false
  }
}

async function saveActivity(field, roomId, textarea, btn) {
  clearErrors(field)
  btn.disabled = true
  try {
    await api.activity(roomId, textarea.value)
    redrawNote(await api.note(childId, date))
    toast('Saved: What we did today')
  } catch (e) {
    if (e.status === 401) return reauth()
    if (!showError(field, e)) toast(e.message, { error: true })
  } finally {
    btn.disabled = false
  }
}

async function makeLink(section, box, btn) {
  btn.disabled = true
  try {
    const r = await api.makeLink(childId)
    const input = h('input', { id: 'note-link', type: 'text', readonly: true, 'aria-label': 'Parent link', spellcheck: 'false' })
    input.value = new URL(r.url, location.origin).href
    const label = h('span', {}, 'Copy link')
    const copy = h('button', { type: 'button', id: 'copy-link', class: 'btn btn-outline', onclick: () => copyLink(input, label) }, icon('copy'), label)
    box.replaceChildren(input, h('div', { class: 'btn-row' }, copy), h('p', { class: 'expires' }, r.expires_label))
    box.hidden = false
  } catch (e) {
    if (e.status === 401) return reauth()
    toast(e.message, { error: true })
  } finally {
    btn.disabled = false
  }
}

async function copyLink(input, label) {
  let ok = false
  try {
    await navigator.clipboard.writeText(input.value)
    ok = true
  } catch {
    input.focus()
    input.select()
    try { ok = document.execCommand('copy') } catch { ok = false }
  }
  label.textContent = ok ? 'Copied' : 'Select the link and copy it'
  clearTimeout(label.__timer)
  label.__timer = setTimeout(() => { label.textContent = 'Copy link' }, 5000)
}

if (!childId) {
  app.replaceChildren(h('p', { class: 'alert', role: 'alert' }, 'Open a child in the room view, then tap Daily note.'))
} else if (!staffSession.token()) {
  showStaffSignIn(app, { onSignedIn: load })
} else {
  load()
}
