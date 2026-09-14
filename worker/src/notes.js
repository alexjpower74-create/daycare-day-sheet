// Quick logs (labels and validation) and the daily note built from them. Pure: rows in, JSON out.
import { durationLabel, longLabel, minutesBetween, timeLabel } from './time.js'

export const MEAL_LABELS = { breakfast: 'Breakfast', am_snack: 'Morning snack', lunch: 'Lunch', pm_snack: 'Afternoon snack' }
const MEAL_VALUES = { all: 'Ate all', some: 'Ate some', none: 'Ate none' }
const VALUE_LABELS = {
  diaper: { wet: 'Wet diaper', bm: 'BM diaper', dry: 'Dry diaper' },
  toilet: { went: 'Used the toilet', tried: 'Tried the toilet' },
  mood: { happy: 'Happy', okay: 'Okay', tired: 'Tired', upset: 'Upset' },
}
export const LOG_KINDS = ['meal', 'nap_start', 'nap_end', 'diaper', 'toilet', 'mood', 'note']
export const NOTE_MAX = 280
export const LINE_MAX = 500

export function logLabel(log) {
  if (log.kind === 'meal') return `${MEAL_LABELS[log.meal]}: ${MEAL_VALUES[log.value].toLowerCase()}`
  if (log.kind === 'nap_start') return 'Fell asleep'
  if (log.kind === 'nap_end') return 'Woke up'
  if (log.kind === 'note') return log.text
  return VALUE_LABELS[log.kind][log.value]
}

// A log body → { kind, value, meal, text }, or { field, message } when something is wrong.
export function parseLog(body) {
  const b = body && typeof body === 'object' ? body : {}
  const wrong = (field, message) => ({ field, message })
  if (!LOG_KINDS.includes(b.kind)) return wrong('kind', 'Pick what to log.')
  const out = { kind: b.kind, value: null, meal: null, text: null }
  if (b.kind === 'meal') {
    if (!Object.hasOwn(MEAL_LABELS, b.meal)) return wrong('meal', 'Pick the meal.')
    if (!Object.hasOwn(MEAL_VALUES, b.value)) return wrong('value', 'Pick how much they ate: all, some or none.')
    return { ...out, meal: b.meal, value: b.value }
  }
  if (b.kind === 'note') {
    const text = typeof b.text === 'string' ? b.text.trim() : ''
    if (text.length < 1 || text.length > NOTE_MAX) return wrong('text', `Write a note of 1 to ${NOTE_MAX} characters.`)
    return { ...out, text }
  }
  if (VALUE_LABELS[b.kind]) {
    if (!Object.hasOwn(VALUE_LABELS[b.kind], b.value)) {
      return wrong('value', { diaper: 'Pick wet, BM or dry.', toilet: 'Pick went or tried.', mood: 'Pick a mood.' }[b.kind])
    }
    return { ...out, value: b.value }
  }
  return out
}

// Logs in time order → is the child asleep (the last nap log is a start)?
export function isNapping(logs) {
  const naps = logs.filter((l) => !l.voided && (l.kind === 'nap_start' || l.kind === 'nap_end'))
  return naps.length > 0 && naps[naps.length - 1].kind === 'nap_start'
}

export function logView(log, staff) {
  const by = staff.get(log.by_staff_id)
  return {
    id: log.id, kind: log.kind, value: log.value, meal: log.meal, text: log.text, at: log.at, time_label: timeLabel(log.at),
    label: logLabel(log), by: { id: log.by_staff_id, initials: by ? by.initials : '' },
  }
}

/**
 * The daily note. visits: that child's visits of the date (in time order); logs: not voided, in time order;
 * activities: [{ room_name, text, updated_at }] for the rooms the child was placed in that day, first placement first.
 */
export function buildNote({ centre, child, room, date, visits, logs, activities, noteLine, people, staff, now }) {
  const nameOf = (id) => people.get(id)?.name ?? ''
  const first = visits[0]
  const last = visits[visits.length - 1]
  const naps = []
  let asleep = null
  for (const l of logs) {
    if (l.kind === 'nap_start') asleep = l
    if (l.kind === 'nap_end' && asleep) {
      const minutes = minutesBetween(asleep.at, l.at)
      naps.push({ label: `${timeLabel(asleep.at)} to ${timeLabel(l.at)} (${durationLabel(minutes)})`, minutes })
      asleep = null
    }
  }
  if (asleep) naps.push({ label: `Asleep since ${timeLabel(asleep.at)}`, minutes: null })
  const line = noteLine && noteLine.text ? noteLine.text : null
  const shown = activities.filter((a) => a.text)
  const changes = [
    ...visits.flatMap((v) => [v.in_at, v.out_at]), ...logs.map((l) => l.at), noteLine?.updated_at,
    ...shown.map((a) => a.updated_at),
  ].filter(Boolean).sort()
  return {
    centre_name: centre.name, sample: centre.sample === 1,
    child: { name: child.name, initials: child.initials, room_name: room.name, age_group: room.age_group },
    date, long_label: longLabel(date),
    arrived: first ? { time_label: timeLabel(first.in_at), by: nameOf(first.in_person_id) } : null,
    left: last && last.out_at ? { time_label: timeLabel(last.out_at), by: nameOf(last.out_person_id) } : null,
    meals: logs.filter((l) => l.kind === 'meal')
      .map((l) => ({ meal_label: MEAL_LABELS[l.meal], value_label: MEAL_VALUES[l.value], time_label: timeLabel(l.at) })),
    naps,
    toileting: logs.filter((l) => l.kind === 'diaper' || l.kind === 'toilet')
      .map((l) => ({ label: logLabel(l), time_label: timeLabel(l.at) })),
    moods: logs.filter((l) => l.kind === 'mood').map((l) => ({ label: logLabel(l), time_label: timeLabel(l.at) })),
    activities: shown.map((a) => ({ room_name: a.room_name, text: a.text })),
    staff_notes: logs.filter((l) => l.kind === 'note')
      .map((l) => ({ text: l.text, time_label: timeLabel(l.at), by_initials: staff.get(l.by_staff_id)?.initials ?? '' })),
    note_line: line,
    infant_record: room.age_group === 'infant',
    updated_label: `Updated ${timeLabel(changes.length ? changes[changes.length - 1] : now)}`,
  }
}
