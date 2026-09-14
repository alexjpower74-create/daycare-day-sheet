// The SAMPLE centre that POST /api/test/reset writes (docs/API.md "SAMPLE centre"). Every person is fictional and labelled
// SAMPLE; phones are in the fictional 709-555-01xx range. No addresses, no health numbers.
import { DEFAULT_RULES } from './ratio.js'

export const SAMPLE_CENTRE = { name: 'SAMPLE Little Harbour Child Care (demo)', sample: true, phone: '709-555-0100' }

export const SAMPLE_ROOMS = [
  { id: 'r_infant', name: 'Infant room', age_group: 'infant', sort: 1 },
  { id: 'r_toddler', name: 'Toddler room', age_group: 'toddler', sort: 2 },
  { id: 'r_preschool', name: 'Preschool room', age_group: 'preschool', sort: 3 },
]

export const SAMPLE_STAFF = [
  { id: 's_dana', name: 'Dana K. (SAMPLE)', role: 'supervisor', pin: '4826' },
  { id: 's_marie', name: 'Marie T. (SAMPLE)', role: 'educator', pin: '1593' },
  { id: 's_kevin', name: 'Kevin O. (SAMPLE)', role: 'educator', pin: '2604' },
  { id: 's_priya', name: 'Priya S. (SAMPLE)', role: 'educator', pin: '3715' },
]

const FULL = ['mon', 'tue', 'wed', 'thu', 'fri']

// [id, name, home room, dob, mother, father]. Dates of birth sit inside the room's age range on 2026-09-14.
const KIDS = [
  ['c_ava', 'Ava M.', 'r_infant', '2025-03-02', 'Sarah M.', 'Tom M.'],
  ['c_liam', 'Liam K.', 'r_infant', '2025-06-20', 'Jenna K.', 'Mark K.'],
  ['c_nora', 'Nora B.', 'r_infant', '2025-01-15', 'Kate B.', 'Chris B.'],
  ['c_owen', 'Owen P.', 'r_infant', '2025-08-01', 'Megan P.', 'Paul P.'],
  ['c_isla', 'Isla R.', 'r_infant', '2024-11-10', 'Laura R.', 'Jason R.'],
  ['c_jack', 'Jack W.', 'r_toddler', '2024-02-12', 'Amy W.', 'Ryan W.'],
  ['c_emma', 'Emma L.', 'r_toddler', '2024-06-03', 'Nicole L.', 'Adam L.'],
  ['c_leo', 'Leo F.', 'r_toddler', '2023-12-20', 'Holly F.', 'Scott F.'],
  ['c_chloe', 'Chloe H.', 'r_toddler', '2024-09-01', 'Erin H.', 'Mike H.'],
  ['c_finn', 'Finn D.', 'r_toddler', '2024-04-22', 'Dawn D.', 'Brian D.'],
  ['c_maya', 'Maya S.', 'r_toddler', '2023-11-30', 'Tara S.', 'Derek S.'],
  ['c_ben', 'Ben C.', 'r_preschool', '2022-05-14', 'Kelly C.', 'Greg C.'],
  ['c_lucy', 'Lucy G.', 'r_preschool', '2021-12-01', 'Robyn G.', 'Shawn G.'],
  ['c_sam', 'Sam N.', 'r_preschool', '2023-03-10', 'Heather N.', 'Neil N.'],
  ['c_grace', 'Grace V.', 'r_preschool', '2022-09-09', 'Lisa V.', 'Craig V.'],
  ['c_eli', 'Eli J.', 'r_preschool', '2021-06-18', 'Andrea J.', 'Wade J.'],
  ['c_zoe', 'Zoe A.', 'r_preschool', '2022-01-25', 'Beth A.', 'Glen A.'],
  ['c_max', 'Max T.', 'r_preschool', '2023-01-05', 'Carla T.', 'Trevor T.'],
  ['c_ruby', 'Ruby E.', 'r_preschool', '2021-03-01', 'Diane E.', 'Colin E.'],
]

const sample = (n) => `${n} (SAMPLE)`

// Initials from the first letters of the first two words: "Ava M. (SAMPLE)" → "AM".
// Letters and digits only, so a name like "=SUM(A1) (SAMPLE)" still gets plain initials ("SS").
export const initialsOf = (name) => name.trim().split(/\s+/).slice(0, 2).map((w) => (w.match(/[\p{L}\p{N}]/u) || ['?'])[0].toUpperCase()).join('')

export const SAMPLE_CHILDREN = KIDS.map(([id, name, room, dob]) => ({
  id, name: sample(name), initials: initialsOf(name), dob, home_room_id: room,
  schedule: id === 'c_owen' || id === 'c_isla' ? 'part_time' : 'full_time',
  days: id === 'c_owen' ? ['mon', 'wed', 'fri'] : id === 'c_isla' ? ['tue', 'thu'] : FULL,
  start_date: '2026-01-05', end_date: null,
}))

let phone = 100
const nextPhone = () => `709-555-${String(++phone).padStart(4, '0')}`

export const SAMPLE_PEOPLE = KIDS.flatMap(([id, , , , mother, father]) => {
  const key = id.slice(2)
  const list = [
    { id: `p_${key}_mother`, child_id: id, name: sample(mother), relationship: 'Mother', may_pick_up: true, emergency_contact: true },
    { id: `p_${key}_father`, child_id: id, name: sample(father), relationship: 'Father', may_pick_up: true, emergency_contact: false },
  ]
  if (id === 'c_ava') {
    list.push(
      { id: 'p_ava_gran', child_id: id, name: sample('Joan M.'), relationship: 'Grandmother', may_pick_up: true, emergency_contact: false },
      { id: 'p_ava_neighbour', child_id: id, name: sample('Rick D.'), relationship: 'Neighbour', may_pick_up: false, emergency_contact: false },
    )
  }
  return list.map((p, i) => ({ ...p, phone: nextPhone(), active: true, sort: i + 1 }))
})

export const SAMPLE_RULES = DEFAULT_RULES.map((r, i) => ({ ...r, sort: i + 1 }))
