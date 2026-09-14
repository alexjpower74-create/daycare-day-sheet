// The meter's decision table (docs/API.md), row by row, for every age group at its exact boundaries.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_RULES, meter } from '../src/ratio.js'

const ROOM = { room_id: 'r_x', room_name: 'X room', age_group: 'infant' }
const m = (children, staff, per, max) => meter({ ...ROOM, children, staff, children_per_caregiver: per, max_children: max })
const C = (n) => (n === 1 ? '1 child' : `${n} children`)
const pick = ({ state, state_label, needs_staff, label, allowed }) => ({ state, state_label, needs_staff, label, allowed })

test('the cited defaults are the six rows of NLR 39/17 s.54', () => {
  assert.deepEqual(DEFAULT_RULES.map((r) => [r.age_group, r.per, r.max, r.citation]), [
    ['infant', 3, 6, 'NLR 39/17 s.54(1)'], ['toddler', 5, 10, 'NLR 39/17 s.54(2)'], ['preschool', 8, 16, 'NLR 39/17 s.54(3)'],
    ['prek', 10, 20, 'NLR 39/17 s.54(4)'], ['school_age', 15, 30, 'NLR 39/17 s.54(5)'],
    ['toddler_preschool', 7, 14, 'NLR 39/17 s.54(10)'],
  ])
})

test('the whole meter of the worked example: infant, 1 staff, 4 children', () => {
  assert.deepEqual(meter({ room_id: 'r_infant', room_name: 'Infant room', age_group: 'infant', children: 4, staff: 1,
    children_per_caregiver: 3, max_children: 6 }), {
    room_id: 'r_infant', room_name: 'Infant room', age_group: 'infant', children: 4, staff: 1, children_per_caregiver: 3,
    max_children: 6, allowed: 3, state: 'over', state_label: 'Over', needs_staff: 1,
    label: '4 children, 1 staff. Over the ratio: 1 staff can have 3. Needs 1 more staff.',
  })
})

test('worked examples from API.md: infant 1 staff 2 → ok, 3 → at_limit, 4 → over; 2 staff 7 → row 4', () => {
  assert.deepEqual(pick(m(2, 1, 3, 6)), { state: 'ok', state_label: 'OK', needs_staff: 0, label: '2 children, 1 staff. Room for 1 more.', allowed: 3 })
  assert.deepEqual(pick(m(3, 1, 3, 6)), { state: 'at_limit', state_label: 'At the limit', needs_staff: 0, label: '3 children, 1 staff. At the limit.', allowed: 3 })
  assert.equal(m(4, 1, 3, 6).state, 'over')
  assert.deepEqual(pick(m(7, 2, 3, 6)), { state: 'over', state_label: 'Over', needs_staff: null,
    label: '7 children, 2 staff. Over the most this room can hold (6).', allowed: 6 })
})

for (const r of DEFAULT_RULES) {
  const { per, max } = r
  test(`${r.age_group} (1:${per}, at most ${max}): every row at its exact boundaries`, () => {
    // Row 1: no children, whatever the staff.
    for (const staff of [0, 1, 5]) {
      assert.deepEqual(pick(m(0, staff, per, max)), { state: 'ok', state_label: 'OK', needs_staff: 0, label: 'No children in the room.',
        allowed: Math.min(staff * per, max) })
    }
    // Rows 5, 6, 7 around allowed for every staff count that matters, and row 4 just past max.
    for (let staff = 1; staff <= Math.ceil(max / per) + 1; staff++) {
      const allowed = Math.min(staff * per, max)
      const S = `${staff} staff`
      if (allowed - 1 > 0) {
        assert.deepEqual(pick(m(allowed - 1, staff, per, max)), { state: 'ok', state_label: 'OK', needs_staff: 0,
          label: `${C(allowed - 1)}, ${S}. Room for 1 more.`, allowed }, `ok at allowed − 1, staff ${staff}`)
      }
      assert.deepEqual(pick(m(allowed, staff, per, max)), { state: 'at_limit', state_label: 'At the limit', needs_staff: 0,
        label: `${C(allowed)}, ${S}. At the limit.`, allowed }, `at_limit at allowed, staff ${staff}`)
      const one = allowed + 1
      if (one > max) {
        assert.deepEqual(pick(m(one, staff, per, max)), { state: 'over', state_label: 'Over', needs_staff: null,
          label: `${C(one)}, ${S}. Over the most this room can hold (${max}).`, allowed }, `row 4 at max + 1, staff ${staff}`)
      } else {
        const k = Math.ceil(one / per) - staff
        assert.equal(k, 1)
        assert.deepEqual(pick(m(one, staff, per, max)), { state: 'over', state_label: 'Over', needs_staff: k,
          label: `${C(one)}, ${S}. Over the ratio: ${S} can have ${staff * per}. Needs ${k} more staff.`, allowed },
        `row 5 at allowed + 1, staff ${staff}`)
      }
    }
    // Row 3: children with no staff.
    assert.deepEqual(pick(m(1, 0, per, max)), { state: 'over', state_label: 'Over', needs_staff: 1,
      label: '1 child with no staff in the room.', allowed: 0 })
    assert.deepEqual(pick(m(max, 0, per, max)), { state: 'over', state_label: 'Over', needs_staff: Math.ceil(max / per),
      label: `${max} children with no staff in the room.`, allowed: 0 })
    assert.equal(m(max + 1, 0, per, max).needs_staff, null, 'no staff and above max: needs_staff null')
    // Row 4 with plenty of staff.
    assert.deepEqual(pick(m(max + 1, 100, per, max)), { state: 'over', state_label: 'Over', needs_staff: null,
      label: `${max + 1} children, 100 staff. Over the most this room can hold (${max}).`, allowed: max })
    // Row 5 needs more than one.
    if (3 * per <= max) {
      assert.deepEqual(pick(m(3 * per, 1, per, max)), { state: 'over', state_label: 'Over', needs_staff: 2,
        label: `${3 * per} children, 1 staff. Over the ratio: 1 staff can have ${per}. Needs 2 more staff.`, allowed: per })
    }
    // Row 2: either number cleared, children present (row 1 still wins with none).
    const unset = { state: 'unset', state_label: 'Not set', needs_staff: null, allowed: null,
      label: 'Ratio not set. A supervisor fills it in under Office, Rooms and ratios.' }
    assert.deepEqual(pick(m(2, 1, null, max)), unset)
    assert.deepEqual(pick(m(2, 1, per, null)), unset)
    assert.deepEqual(pick(m(2, 0, null, null)), unset)
    assert.deepEqual(pick(m(0, 1, null, max)), { state: 'ok', state_label: 'OK', needs_staff: 0, label: 'No children in the room.', allowed: null })
  })
}

test('labels: singular child, plural children, staff never pluralised', () => {
  assert.equal(m(1, 1, 3, 6).label, '1 child, 1 staff. Room for 2 more.')
  assert.equal(m(2, 2, 3, 6).label, '2 children, 2 staff. Room for 4 more.')
  assert.equal(m(1, 0, 3, 6).label, '1 child with no staff in the room.')
  assert.equal(m(2, 0, 3, 6).label, '2 children with no staff in the room.')
})
