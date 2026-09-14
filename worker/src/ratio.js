// The ratio meter (docs/API.md "Ratio rules and the meter"). Pure: counts and a rule in, a meter out.
// Cited defaults: NLR 39/17 s.54, quoted in docs/RULES.md.
export const DEFAULT_RULES = [
  { age_group: 'infant', label: 'Infant (birth up to 2 years)', per: 3, max: 6, citation: 'NLR 39/17 s.54(1)' },
  { age_group: 'toddler', label: 'Toddler (1 year 6 months up to 3 years)', per: 5, max: 10, citation: 'NLR 39/17 s.54(2)' },
  { age_group: 'preschool', label: 'Pre-school (2 years 9 months up to 5 years 9 months, not in school)', per: 8, max: 16,
    citation: 'NLR 39/17 s.54(3)' },
  { age_group: 'prek', label: 'Pre-kindergarten program (3 years 8 months up to 5 years 9 months)', per: 10, max: 20,
    citation: 'NLR 39/17 s.54(4)' },
  { age_group: 'school_age', label: 'School age (4 years 8 months up to 13 years, in school)', per: 15, max: 30,
    citation: 'NLR 39/17 s.54(5)' },
  { age_group: 'toddler_preschool', label: 'Toddlers and pre-school together', per: 7, max: 14, citation: 'NLR 39/17 s.54(10)' },
]

export const STATE_LABELS = { ok: 'OK', at_limit: 'At the limit', over: 'Over', unset: 'Not set' }
export const UNSET_LABEL = 'Ratio not set. A supervisor fills it in under Office, Rooms and ratios.'

const childrenText = (n) => (n === 1 ? '1 child' : `${n} children`)
const staffText = (n) => `${n} staff`

// room: { room_id, room_name, age_group }, counts: children and staff present, rule numbers (null = cleared).
export function meter({ room_id, room_name, age_group, children, staff, children_per_caregiver, max_children }) {
  const per = children_per_caregiver ?? null
  const max = max_children ?? null
  const unset = per === null || max === null
  const allowed = unset ? null : Math.min(staff * per, max)
  const answer = (state, label, needs_staff) => ({
    room_id, room_name, age_group, children, staff, children_per_caregiver: per, max_children: max, allowed,
    state, state_label: STATE_LABELS[state], needs_staff, label,
  })
  const C = childrenText(children)
  const S = staffText(staff)
  // First match wins, in the order of the table in docs/API.md.
  if (children === 0) return answer('ok', 'No children in the room.', 0)
  if (unset) return answer('unset', UNSET_LABEL, null)
  if (staff === 0) return answer('over', `${C} with no staff in the room.`, children <= max ? Math.ceil(children / per) : null)
  if (children > max) return answer('over', `${C}, ${S}. Over the most this room can hold (${max}).`, null)
  if (children > staff * per) {
    const k = Math.ceil(children / per) - staff
    return answer('over', `${C}, ${S}. Over the ratio: ${S} can have ${staff * per}. Needs ${k} more staff.`, k)
  }
  if (children === allowed) return answer('at_limit', `${C}, ${S}. At the limit.`, 0)
  return answer('ok', `${C}, ${S}. Room for ${allowed - children} more.`, 0)
}
