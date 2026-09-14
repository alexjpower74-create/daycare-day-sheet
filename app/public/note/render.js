// The daily note as a parent sees it, built from the API's **note** shape (docs/API.md). Shared by /note/ (parent link) and
// /room/note/ (staff). Text only, never markup from data. Sections carry data-section for the tests.
import { h, avatar } from '/ui.js'

const empty = (text = 'Nothing recorded yet.') => h('p', { class: 'empty' }, text)
const item = (label, time) => h('li', {}, h('span', { class: 'note-item-label' }, label), time ? h('span', { class: 'time' }, time) : null)
const items = (list, row) => (list && list.length ? h('ul', { class: 'note-items' }, list.map(row)) : empty())
const section = (key, title, content, level = 'h2') =>
  h('section', { class: 'note-card', 'data-section': key }, h(level, { class: 'note-card-title' }, title), content)

export function renderNote(note) {
  const infant = !!note.infant_record
  const inner = infant ? 'h3' : 'h2'
  const meals = section('meals', 'Meals', items(note.meals, (m) => item(`${m.meal_label}: ${m.value_label}`, m.time_label)), inner)
  const sleep = section('sleep', 'Sleep', items(note.naps, (n) => item(n.label)), inner)
  const toileting = section('toileting', 'Diapers and toilet', items(note.toileting, (t) => item(t.label, t.time_label)), inner)
  const activities = (note.activities || []).filter((a) => a.text)

  return [
    h('header', { class: 'note-head' },
      avatar(note.child.initials, note.child.age_group, 'lg'),
      h('div', {},
        h('h1', { class: 'note-child-name' }, note.child.name),
        h('p', { class: 'muted' }, note.child.room_name),
        h('p', { class: 'note-date' }, note.long_label))),
    note.arrived || note.left
      ? h('div', { class: 'note-card note-times', 'data-section': 'times' },
        note.arrived ? h('p', {}, `Arrived ${note.arrived.time_label} with ${note.arrived.by}`) : null,
        note.left ? h('p', {}, `Went home ${note.left.time_label} with ${note.left.by}`) : null)
      : null,
    infant
      ? h('div', { class: 'note-group' }, h('h2', { class: 'note-group-title' }, 'Daily record of sleeping, eating and toileting'), meals, sleep, toileting)
      : [meals, sleep, toileting],
    section('mood', 'Mood', items(note.moods, (m) => item(m.label, m.time_label))),
    section('activities', 'What we did today', activities.length
      ? h('ul', { class: 'note-items' }, activities.map((a) => item(a.text, a.room_name)))
      : empty()),
    section('staff-notes', 'Notes from staff', items(note.staff_notes, (n) => item(n.text, `${n.time_label} · ${n.by_initials}`))),
    section('line', 'A line from your educator', note.note_line ? h('p', { class: 'note-line-text' }, note.note_line) : empty('Nothing yet.')),
    h('p', { class: 'faint note-updated' }, note.updated_label),
  ]
}
