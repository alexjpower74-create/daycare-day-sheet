# Daycare Day Sheet: API contract (v1)

The contract between the Worker (dd1) and the pages (dd1 for the door tablet, dd2 for the room view, daily note and office).
If the code and this file disagree, this file wins until the lead changes it. Written by dd-lead 2026-09-14. Questions go in
your build report; do not invent a different contract.

One Worker `daycare-day-sheet` serves the API under `/api/*` and the static app from `app/public/` (same origin, no CORS).
One deployment = one centre. Local only tonight: `wrangler dev --local`.

JSON in, JSON out. Errors are always
`{ "error": "<plain English for a Newfoundland parent or educator>", "code": "<machine code>", "field"?: "<input name>" }`.

| code | HTTP | when |
|---|---|---|
| `bad_request` | 400 | validation; `field` names the input |
| `unauthorized` | 401 | missing/expired token, or wrong PIN (`field: "pin"`) |
| `forbidden` | 403 | the token's role may not use this route |
| `not_on_list` | 403 | the person is not on this child's list, or may not pick this child up |
| `not_found` | 404 | unknown child, person, room, staff, log, visit, absence, or note token |
| `already_in` | 409 | sign in while the child is already signed in |
| `not_in` | 409 | sign out, move, or log for a child who is not signed in |
| `already_napping` / `not_napping` | 409 | nap start while asleep / nap end while awake |
| `pin_taken` | 409 | another staff member already has that PIN (`field: "pin"`) |
| `bad_state` | 409 | anything else not allowed from the current state (inactive child, absence on a day the child came) |
| `link_expired` | 410 | a parent note link after midnight of its day |
| `rate_limited` | 429 | too many PIN tries |

## Time and test clock

- The centre's zone is `America/St_Johns` (Newfoundland time, DST on the second Sunday of March and the first Sunday of
  November at 2:00 AM). Every `date` is centre-local `YYYY-MM-DD`. Labels: `date_label` `"Mon Sep 14"`, `long_label`
  `"Monday, September 14"`, `time_label` `"8:05 AM"`. Every `*_label` for a time (`in_label`, `out_label`, `since_label`, `time_label`)
  is the bare time (`"8:05 AM"`); pages add words such as "In since". Instants in JSON are ISO strings in UTC (`"2026-09-14T11:35:00.000Z"`).
- Pages never use the browser clock for dates or times. They take `today`, `now` and `now_local` (`"09:00"`) from the API.
- Timestamps are stored to the second. **Minutes** of any span = `floor(end_ms / 60000) − floor(start_ms / 60000)`, so the
  parts of a span always add up to the whole span.
- Only when the Worker runs with var `TEST_MODE=1` (never in `wrangler.toml`): header `X-Test-Now: <ISO instant>` replaces
  "now" and `X-Test-IP: <string>` replaces the client IP. Without `TEST_MODE=1` both headers are ignored.
- Test routes exist only under `TEST_MODE=1` (404 otherwise): `POST /api/test/reset` (wipe everything, then the SAMPLE centre
  below with no visits, logs, absences, presence or links) and `POST /api/test/seed { "scenario": "demo" }` (M2, see the end).

## Auth

- `Authorization: Bearer <token>`. Tokens are 32 random bytes, base64url; the Worker stores only their SHA-256.
- Roles: `supervisor` (every staff and office route), `educator` (staff routes only), `door` (door routes only).
  A token on a route its role may not use → 403 `forbidden`. No token or an expired one → 401 `unauthorized`.
- PINs are 4 to 6 digits, unique per centre, stored as PBKDF2-SHA-256 (100 000 iterations) + a per-staff salt.
- Rate guard: 5 wrong PINs from one IP within 15 minutes → 429 `rate_limited` for the rest of that window, even for the right PIN,
  on both `POST /api/signin` and `POST /api/door/unlock`. Message: `"Too many tries. Wait 15 minutes, then try again."`

| method + path | who | body → answer |
|---|---|---|
| `POST /api/signin` | anyone | `{ pin }` → 200 `{ token, role, staff: { id, name, initials }, expires_at }` (12 hours). Wrong PIN → 401 `"That PIN is not right."` `field: "pin"`. |
| `POST /api/door/unlock` | anyone | `{ pin }` → 200 `{ token, role: "door", expires_at }` (30 days). Wrong PIN → 401 as above; an educator's PIN → 403 `forbidden` `"Only the supervisor can set up this tablet."` |
| `POST /api/signout` | any token | → 200 `{ ok: true }`; the token stops working. |
| `GET /api/info` | anyone | → `{ centre_name, sample, phone, zone, today, date_label, long_label, now, now_local, time_label }`. Before the centre row exists (a migrated, empty D1 before first setup or `POST /api/test/reset`), `centre_name` and `phone` are `""`; pages then show no centre name rather than a guessed one. |

## SAMPLE centre (what `POST /api/test/reset` creates; tests rely on these ids)

- Centre: `centre_name` `"SAMPLE Little Harbour Child Care (demo)"`, `sample: true`, `phone` `"709-555-0100"`.
- Staff: `s_dana` "Dana K. (SAMPLE)" supervisor PIN `4826`; educators `s_marie` "Marie T. (SAMPLE)" `1593`, `s_kevin`
  "Kevin O. (SAMPLE)" `2604`, `s_priya` "Priya S. (SAMPLE)" `3715`.
- Rooms: `r_infant` "Infant room" (`infant`), `r_toddler` "Toddler room" (`toddler`), `r_preschool` "Preschool room" (`preschool`).
- Children (every name ends in "(SAMPLE)"; initials from the first letters of the first two words): infant room `c_ava` Ava M.,
  `c_liam` Liam K., `c_nora` Nora B., `c_owen` Owen P., `c_isla` Isla R.; toddler room `c_jack` Jack W., `c_emma` Emma L.,
  `c_leo` Leo F., `c_chloe` Chloe H., `c_finn` Finn D., `c_maya` Maya S.; preschool room `c_ben` Ben C., `c_lucy` Lucy G.,
  `c_sam` Sam N., `c_grace` Grace V., `c_eli` Eli J., `c_zoe` Zoe A., `c_max` Max T., `c_ruby` Ruby E. Dates of birth inside
  their room's age range on 2026-09-14. All `full_time` Mon–Fri from 2026-01-05, except `c_owen` `part_time` Mon/Wed/Fri and
  `c_isla` `part_time` Tue/Thu (so Isla is **not booked** on Monday September 14).
- People: every child has a mother and a father (`p_<child>_mother`, `p_<child>_father`, both `may_pick_up: true`, the mother is
  the `emergency_contact`). Ava also has `p_ava_gran` "Joan M. (SAMPLE)" Grandmother `may_pick_up: true` and `p_ava_neighbour`
  "Rick D. (SAMPLE)" Neighbour **`may_pick_up: false`** (drop-off only). Ava's mother is "Sarah M. (SAMPLE)", father "Tom M. (SAMPLE)".
  Phones are `709-555-01xx` (a fictional range). No addresses, no health numbers.
- Ratio rules: the six below with their cited values, none edited.

## Ratio rules and the meter (dd1 implements it once in `worker/src/ratio.js`, pure)

Cited in docs/RULES.md (NLR 39/17 s.54). The operator can edit both numbers ("your licence may differ") or clear them.

| `age_group` | `label` | `children_per_caregiver` | `max_children` | `citation` |
|---|---|---|---|---|
| `infant` | `Infant (birth up to 2 years)` | 3 | 6 | `NLR 39/17 s.54(1)` |
| `toddler` | `Toddler (1 year 6 months up to 3 years)` | 5 | 10 | `NLR 39/17 s.54(2)` |
| `preschool` | `Pre-school (2 years 9 months up to 5 years 9 months, not in school)` | 8 | 16 | `NLR 39/17 s.54(3)` |
| `prek` | `Pre-kindergarten program (3 years 8 months up to 5 years 9 months)` | 10 | 20 | `NLR 39/17 s.54(4)` |
| `school_age` | `School age (4 years 8 months up to 13 years, in school)` | 15 | 30 | `NLR 39/17 s.54(5)` |
| `toddler_preschool` | `Toddlers and pre-school together` | 7 | 14 | `NLR 39/17 s.54(10)` |

A room of other mixed ages uses the youngest child's group (s.54(9)); the office page says so beside the age group picker.

**Who counts.** `children` = children with an open visit (signed in, not out) whose open placement is this room.
`staff` = staff with an open presence in this room. Counts change the instant the write that changes them commits.

**Meter** for one room:
```
{ "room_id": "r_infant", "room_name": "Infant room", "age_group": "infant",
  "children": 4, "staff": 1, "children_per_caregiver": 3, "max_children": 6,
  "allowed": 3, "state": "over", "state_label": "Over", "needs_staff": 1,
  "label": "4 children, 1 staff. Over the ratio: 1 staff can have 3. Needs 1 more staff." }
```
`allowed` = `min(staff × children_per_caregiver, max_children)` (null when unset). Decide in this order (first match wins);
`{C}` = `"1 child"` / `"N children"`, `{S}` = `"N staff"`:

| # | when | `state` | `state_label` | `label` | `needs_staff` |
|---|---|---|---|---|---|
| 1 | `children = 0` | `ok` | `OK` | `No children in the room.` | 0 |
| 2 | either number is null | `unset` | `Not set` | `Ratio not set. A supervisor fills it in under Office, Rooms and ratios.` | null |
| 3 | `staff = 0` | `over` | `Over` | `{C} with no staff in the room.` | `ceil(children / per)` if `children ≤ max`, else null |
| 4 | `children > max_children` | `over` | `Over` | `{C}, {S}. Over the most this room can hold ({max_children}).` | null |
| 5 | `children > staff × per` | `over` | `Over` | `{C}, {S}. Over the ratio: {S} can have {staff × per}. Needs {k} more staff.` | `k = ceil(children / per) − staff` |
| 6 | `children = allowed` | `at_limit` | `At the limit` | `{C}, {S}. At the limit.` | 0 |
| 7 | otherwise | `ok` | `OK` | `{C}, {S}. Room for {allowed − children} more.` | 0 |

Worked: infant, 1 staff: 2 children → ok "Room for 1 more."; 3 → at_limit; **4 → over, needs 1**. Infant, 2 staff, 7 → row 4.

**The register tells the truth:** a sign-in or a move is never refused because of the ratio. The answer carries the new meter;
the pages show red at once.

## Shapes

- **Child (staff)**: `{ id, name, initials, dob, age_label ("1 year 6 months"), home_room_id, room_id (current placement or
  null), room_name, schedule ("full_time"|"part_time"), days (["mon",…]), start_date, end_date|null, active }`
- **Person**: `{ id, child_id, name, relationship, may_pick_up, emergency_contact, active }` (+ `phone` on office routes only)
- **Room**: `{ id, name, age_group, active, sort }`
- **Ratio rule**: `{ age_group, label, children_per_caregiver|null, max_children|null, default_children_per_caregiver,
  default_max_children, citation, edited }`
- **Staff**: `{ id, name, initials, role, active }` (never the PIN or its hash)
- **Signature** (in): `{ "w": 600, "h": 200, "strokes": [[x0, y0, x1, y1, …], …] }`, integers inside the box, 1–50 strokes,
  each at least 2 points (4 numbers, even length), 4 000 points in all at most, and the ink must span at least 20 units across
  or down. Otherwise 400 `field: "signature"` `"Please sign with your finger."`. Out: `signature_svg`, a string the Worker builds
  from the integers only: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200"><path d="M… L…" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  (the attributes are part of the contract, so a signature draws as ink with no page CSS and prints in the text colour).
- **Visit**: `{ id, child_id, date, in_at, in_label, in_by: {id, name, relationship}, in_signature_svg|null, in_recorded_by|null,
  out_at|null, out_label|null, out_by|null, out_signature_svg|null, out_recorded_by|null, awaiting_signature ("in"|"out"|null),
  edited, edits: [{ at_label, by, reason, what }] }` — `*_recorded_by` is `{ id, initials }` of the staff member who recorded it
  when the parent did not sign (Policy ELCD-2017-L2 2(iv)).

## Door routes (role `door`)

| method + path | body → answer |
|---|---|
| `GET /api/door/children` | → `{ date, date_label, now_local, centre_name, sample, rooms: [meter…], children: [{ id, name, initials, room_id, room_name, status, status_label, awaiting_signature }] }` sorted by room sort then name. `status`: `not_in_yet` "Not in yet" · `in` "In since 8:05 AM" · `gone_home` "Gone home at 4:30 PM" · `away` "Away today: Sick" · `not_booked` "Not booked today". `awaiting_signature` is true when any of this child's visits in the last 14 days has one pending. |
| `GET /api/door/children/:id` | → `{ child: {id, name, initials, room_name, status, status_label}, visit|null (today's open visit, else the last one today), people: [{ id, name, relationship, may_pick_up }] (active only, no phones), pending: [{ visit_id, which, date_label, time_label, person: {id, name} }] }` |
| `POST /api/door/children/:id/in` | `{ person_id, signature }` → 201 `{ visit, meter, message: "Ava M. (SAMPLE) signed in at 9:00 AM by Sarah M. (SAMPLE)." }`. Any active person on this child's list may drop off. 409 `already_in`; 403 `not_on_list` `"That person is not on Ava M. (SAMPLE)'s list. Get the supervisor."` (unknown id, inactive, or another child's person); 409 `bad_state` inactive child; 400 signature. Opens a placement in the home room. |
| `POST /api/door/children/:id/out` | `{ person_id, signature }` → 200 `{ visit, meter, message: "… signed out at 4:30 PM by Tom M. (SAMPLE)." }`. Only an active person on this child's list **with `may_pick_up: true`**. 403 `not_on_list` `"Rick D. (SAMPLE) is not on the pickup list for Ava M. (SAMPLE). Get the supervisor. Do not let Ava M. (SAMPLE) leave."` (for an unknown person use `"That person"`). The visit stays open after a refusal. 409 `not_in`. Closes the open placement. |
| `POST /api/door/visits/:id/sign` | `{ which: "in"|"out", person_id, signature }` → 200 `{ visit }`. Adds the parent's signature to a time a staff member recorded. `person_id` must be the recorded person (403 `not_on_list` otherwise); nothing pending → 409 `bad_state`. The times do not change. |

## Staff routes (roles `educator`, `supervisor`)

| method + path | body → answer |
|---|---|
| `GET /api/staff/today` | → `{ date, date_label, now, now_local, centre_name, sample, me: { staff, room_id|null }, rooms: [{ room, meter, children: [{ id, name, initials, in_label, napping, last_meal_label|null, awaiting_signature }], staff: [{ id, name, initials, since_label }] }], not_in_yet: [child…], away: [{ child, reason_label }], gone_home: [child…] }` |
| `POST /api/staff/presence` | `{ room_id: "r_infant" | null, staff_id? }` → 200 `{ rooms: [meter…] }` (every room). Moves the staff member into the room, closing any other open presence; `null` = out of every room. `staff_id` for someone else: supervisor only (403 otherwise). |
| `POST /api/staff/children/:id/move` | `{ room_id }` → 200 `{ from: meter, to: meter, message: "Ava M. (SAMPLE) moved to Toddler room." }`. 409 `not_in`; 400 `field: "room_id"` for the same room or an inactive one. Closes the placement, opens one in the new room (Policy ELCD-2017-L2 7). |
| `GET /api/staff/children/:id` | → `{ child, visit|null, logs: [log…] (today, not voided), people: [{ id, name, relationship, may_pick_up }] }` |
| `POST /api/staff/children/:id/logs` | `{ kind, value?, meal?, text? }` → 201 `{ log }`. `log` = `{ id, kind, value, meal, text, at, time_label, label, by: { id, initials } }`. 409 `not_in` unless signed in. Kinds: `meal` (`value` `all`/`some`/`none`, `meal` `breakfast`/`am_snack`/`lunch`/`pm_snack`; label `"Lunch: ate all"`); `nap_start` (409 `already_napping`; label `"Fell asleep"`); `nap_end` (409 `not_napping`; label `"Woke up"`); `diaper` (`wet`/`bm`/`dry`; `"Wet diaper"`, `"BM diaper"`, `"Dry diaper"`); `toilet` (`went`/`tried`; `"Used the toilet"`, `"Tried the toilet"`); `mood` (`happy`/`okay`/`tired`/`upset`; `"Happy"`…); `note` (`text` 1–280 chars; label is the text). |
| `DELETE /api/staff/logs/:id` | → 200 `{ ok: true }`. Voids the log (kept, never shown). Only today's; an educator only their own (403), a supervisor any. |
| `POST /api/staff/children/:id/in` | `{ person_id }` → 201 `{ visit, meter, message }`. Staff record a drop-off the parent did not sign: same list rule as the door, `in_recorded_by` = this staff member, `awaiting_signature: "in"`. |
| `POST /api/staff/children/:id/out` | `{ person_id }` → 200 `{ visit, meter, message }`. Same pickup rule as the door (403 `not_on_list`), `out_recorded_by`, `awaiting_signature: "out"`. |
| `PUT /api/staff/rooms/:id/activity` | `{ text }` (0–500 chars; empty clears) → 200 `{ date, room_id, text }`. Today's "What we did today" line for the room. |
| `GET /api/staff/children/:id/note?date=` | → **note** (below). `date` defaults to today; any past date is allowed for staff. |
| `PUT /api/staff/children/:id/note` | `{ text, date? }` (0–500 chars) → 200 **note**. The "A line from your educator" text. |
| `POST /api/staff/children/:id/note/link` | → 201 `{ token, url: "/note/?t=<token>", date, expires_at, expires_label: "Works until midnight tonight." }`. Today only. A new link each call; older links for today keep working until midnight. |

**Note** (the daily note, also the parent's view):
```
{ "centre_name": "SAMPLE Little Harbour Child Care (demo)", "sample": true,
  "child": { "name": "Ava M. (SAMPLE)", "initials": "AM", "room_name": "Infant room", "age_group": "infant" },
  "date": "2026-09-14", "long_label": "Monday, September 14",
  "arrived": { "time_label": "8:05 AM", "by": "Sarah M. (SAMPLE)" } | null,
  "left": { "time_label": "4:30 PM", "by": "Tom M. (SAMPLE)" } | null,
  "meals": [{ "meal_label": "Lunch", "value_label": "Ate all", "time_label": "11:45 AM" }],
  "naps": [{ "label": "12:40 PM to 2:05 PM (1 h 25 min)", "minutes": 85 } | { "label": "Asleep since 12:40 PM", "minutes": null }],
  "toileting": [{ "label": "Wet diaper", "time_label": "10:10 AM" }],
  "moods": [{ "label": "Happy", "time_label": "9:30 AM" }],
  "activities": [{ "room_id": "r_infant", "room_name": "Infant room", "text": "Sensory bins and a walk to the harbour." }],
  "rooms_today": [{ "room_id": "r_infant", "room_name": "Infant room" }],
  "staff_notes": [{ "text": "Loved the water table.", "time_label": "10:30 AM", "by_initials": "MT" }],
  "note_line": "A great day." | null,
  "infant_record": true,
  "updated_label": "Updated 2:07 PM" }
```
Lists are oldest first; voided logs are left out. `activities` are the rooms the child was placed in that day whose line is not empty. `rooms_today` lists every room the child was
placed in that day, in order, so the staff note can offer a "What we did today" line for a room that has no text yet. `infant_record` is true
for the `infant` group (the page then titles it "Daily record of sleeping, eating and toileting", NLR 39/17 s.26(3)).

## Parent link (public)

| method + path | answer |
|---|---|
| `GET /api/note/:token` | 200 **note** for the link's date, live (logs added after the link was made show). Unknown token → 404 `"We couldn't find that note. Ask the centre for a new link."`. At or after **local midnight that ends the link's date** → 410 `link_expired` `"This link was for Monday, September 14 and stopped working at midnight. Ask the centre for today's note."` |

The link is `/note/?t=<token>`: 32 random bytes (43 base64url characters), stored as SHA-256 only, never guessable, today only.

## Office routes (role `supervisor`)

| method + path | body → answer |
|---|---|
| `GET /api/office/children` | → `{ children: [child + { people: [person…], emergency: person|null }] }` (active first, then inactive) |
| `POST /api/office/children` · `PUT /api/office/children/:id` | `{ name, dob, home_room_id, schedule, days, start_date, end_date }` (PUT partial) → 201/200 `{ child }`. Validation one field at a time: `name` 1–60 · `dob` a real date not in the future · `home_room_id` an active room · `schedule` · `days` 1–7 of `mon…sun`, no repeats · `start_date` · `end_date` null or ≥ start. `end_date` in the past = no longer registered (`active: false`). |
| `POST /api/office/children/:id/people` · `PUT /api/office/people/:pid` · `DELETE /api/office/people/:pid` | `{ name, relationship, phone, may_pick_up, emergency_contact }` → 201/200 `{ person }`. `phone` optional, 10 digits when given. DELETE sets `active: false` (history keeps the name). Setting `emergency_contact` clears it on the child's other people. |
| `GET /api/office/rooms` · `POST /api/office/rooms` · `PUT /api/office/rooms/:id` | `{ name, age_group, active, sort }` → `{ room }`. A room with children signed in cannot be made inactive (409 `bad_state`). |
| `GET /api/office/ratios` | → `{ rules: [rule…], note: "Numbers from the Child Care Regulations, NLR 39/17 section 54. Your licence may differ. Check it and change them here." }` |
| `PUT /api/office/ratios/:age_group` | `{ children_per_caregiver: 1–50 | null, max_children: 1–60 | null }` → 200 `{ rule }` (`edited: true` when either differs from the default). The next meter uses it. |
| `POST /api/office/ratios/:age_group/reset` | → 200 `{ rule }` back to the cited values. |
| `GET /api/office/staff` · `POST /api/office/staff` · `PUT /api/office/staff/:id` | `{ name, role, active, pin }` (pin write-only, 4–6 digits) → `{ staff }`. 409 `pin_taken`. Making the last active supervisor inactive or an educator → 409 `bad_state`. |
| `POST /api/office/absences` | `{ child_id, date, reason, note }` → 201 `{ absence: { id, child_id, date, reason, reason_label, note } }`. `reason`: `sick` "Sick" · `holiday` "Holiday" · `appointment` "Appointment" · `family` "Family reasons" · `other` "Other". One per child per date (409 `bad_state`); a date the child was signed in → 409 `bad_state` `"Ava M. (SAMPLE) was signed in that day."` |
| `DELETE /api/office/absences/:id` | → 200 `{ ok: true }` |
| `PUT /api/office/visits/:id` | `{ in_date?, in_time?, out_date?, out_time?, reason }` (`HH:MM` 24-hour centre time) → 200 `{ visit }`. Fixes a time (a forgotten sign-out). `reason` 3–200 chars required; out after in; nothing in the future. The old and new times, who and why go into `edits`; the register shows `edited`. Closing an open visit also closes its placement at that time. |
| `GET /api/office/attendance?from=&to=` | → **attendance** (below). `from ≤ to`, at most 92 days. |
| `GET /api/office/attendance.csv?from=&to=` | → `text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="attendance-<from>-to-<to>.csv"`. |
| `GET /api/office/attendance-summary.csv?from=&to=` | → as above, `filename="attendance-summary-<from>-to-<to>.csv"`. |
| `GET /api/office/register?date=&room_id=` | → **register** for the printed daily register of one homeroom (NLR 39/17 s.45). |

**Attendance.** Each visit is cut at every local midnight it crosses; each part belongs to its local date. For every child and
date in range: `status` is `present` (a part with minutes, or an open visit), `away` (an absence), `not_booked` (not a booked day),
`missing` (booked, on or before today, no visit, no absence), or `upcoming` (booked, after today, nothing recorded yet). An **open** visit (never signed out) counts as present with 0 minutes and a
`"Not signed out"` flag until a supervisor fixes the time.
```
{ "from": "2026-09-14", "to": "2026-09-20", "dates": ["2026-09-14", …],
  "children": [{ "id": "c_ava", "name": "Ava M. (SAMPLE)", "room_name": "Infant room",
    "days": { "2026-09-14": { "status": "present", "minutes": 90, "open": false, "absence": null,
      "parts": [{ "visit_id": "…", "in_label": "10:30 PM", "out_label": "1:15 AM Sep 15", "minutes": 90, "continues": true, "continued": false }] } },
    "minutes": 165, "days_present": 2, "days_away": 0, "away_by_reason": { "sick": 0, "holiday": 0, "appointment": 0, "family": 0, "other": 0 }, "not_signed_out": 0 }],
  "totals": { "minutes": 165, "child_days": 2 } }
```
Invariant the tests hold: for every child, `minutes` = Σ of that child's visits' `(out − in)` minutes for visits wholly inside
the range, and Σ over dates of `days[date].minutes` = `minutes`.

**attendance.csv** header exactly
`Date,Child,Room,In,Dropped off by,Out,Picked up by,Minutes,Hours,Away,Note` — one row per visit part and per absence, ordered by
date, room sort, child name, time. `In`/`Out` are time labels, with `" Sep 15"` added when that end is on another date. A part that
goes past midnight has Note `Continues past midnight`; the next date's part has `Continued from the day before`. An open visit has
Out empty, Minutes `0` and Note `Not signed out`. An absence row has In/Out/people empty, Minutes `0`, Away = the reason label,
Note = its note. `Hours` = minutes / 60 with 2 decimals. Lines end CRLF; a cell with a comma, quote or line break is quoted with
quotes doubled; a cell starting with `=`, `+`, `-`, `@`, tab or CR gets a leading `'` (formula guard).

**attendance-summary.csv** header exactly
`Child,Room,Days present,Minutes,Hours,Days away,Sick,Holiday,Appointment,Family reasons,Other,Not signed out` — one row per child
who was registered on any date in the range, then a last row `Total,,<child days>,<minutes>,<hours>,<days away>,…`.

**Register** (one homeroom, one date):
```
{ "centre_name", "sample", "date", "long_label", "room": { "id", "name" },
  "rows": [{ "child": { "name", "dob" }, "emergency": { "name", "relationship", "phone" } | null,
    "visits": [visit…], "moves": [{ "label": "Went to Toddler room 10:00 AM, back 10:40 AM" }] }],
  "kept_note": "Daily registers are kept for at least 7 years (NLR 39/17 s.45(3))." }
```
Rows are the children with a visit or a placement in that room that day.

## Demo seed (`POST /api/test/seed { "scenario": "demo" }`, M2)

Reset, then around `today` (from `X-Test-Now` or the clock): the last 15 weekdays of attendance for every booked child (arrivals
7:30–9:15 AM, pickups 3:45–5:30 PM, generated scribble signatures, each person from the child's list), 4 absences with different
reasons, one visit last week never signed out, one staff-recorded drop-off awaiting a signature; today by 9:00 AM: Marie in the
infant room with 3 infants signed in (at the limit), Kevin in the toddler room with all 6 toddlers (over, needs 1 more staff), Priya in the preschool
room with 6 pre-schoolers (ok); no child is moved out of their own room, meals, a nap, diapers, moods and one activity line per room. Answers
`{ today, note_url }` (a parent link for Ava today).
