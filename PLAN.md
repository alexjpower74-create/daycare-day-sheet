# Daycare Day Sheet: build contract

One plan file. It is the contract, and it lives at the repo root so every agent reads the same copy.
Then read `docs/API.md` (the contract between slices), `docs/RULES.md` (the cited law) and `DECISIONS.md`. `BRIEF.md` is the
original brief. `AGENTS.md` has ports and hard rules.

## The brief (Onyx for Alexander, 2026-09-14)
The daily paperwork of a small licensed child care centre in Newfoundland and Labrador, on a tablet by the door and staff phones:
children signed in and out (by whom, when), which room they're in, **staff-to-child ratios by room, live**, a short daily note home
for each child (meals, naps, diapers/toileting, activities, mood), and an attendance export for the operator's funding and fee
paperwork. SAMPLE centre "SAMPLE Little Harbour Child Care (demo)" and SAMPLE people only. No real names, no photos (initials),
a PIN per staff member, parent links that expire at midnight, the minimum stored (no health numbers, no birth certificates).
Nothing is emailed or texted.

**Tests that matter:** the ratio goes red the moment one child too many is signed into a room (negative control: break the count);
sign-out by someone not authorized is blocked; attendance totals match sign-in/out pairs across midnight; the parent link stops
working the next day; journeys at tablet 1024×768 and phone 390, chromium + webkit.

## Design
Tokens are in `app/public/theme.css` (lead-owned; read it, do not edit it, style your pages in your own CSS). Alexander's approved
portfolio look: dark navy ground, tonal surfaces, hairlines, soft shadows, colour on data, pills, edges and avatars, never a loud
backdrop (`.aurora` at 0.2 is allowed on the room view, note and office, **never on the door tablet or print**). Sea-glass teal
accent. The ratio colours are the loud ones and come only from `[data-state]` in theme.css (`--state`, `--on-state`). System fonts.
No emoji as icons (inline SVG where an icon helps). Everything quiet under `prefers-reduced-motion`. Avatars are initials in a
ring coloured by age group (`--group-<age_group>`). Every screen shows the centre name with a visible `.sample-badge` SAMPLE.
Tap targets ≥ 44 px on phones and the office, **≥ 72 px on the door tablet** (64 px floor). Sticky headers carry
`data-sticky-header` (the `tap()` helper reads it). Print: white, `.no-print` on buttons and navigation.

- **Start page `/`:** centre name + SAMPLE, four large link cards: "Door tablet", "Room view", "Office", and a line "Parent notes
  open from a link the room staff make." Nothing else.
- **Door tablet `/door/` (1024×768 landscape first; must still work at 768 portrait):** solid ground, no aurora. First visit:
  "Set up this tablet" with a big keypad (0–9, "Clear", "Enter"), supervisor PIN. Then a header with the centre name, SAMPLE, the
  long date and the time (from the API, refreshed every 15 s); room filter chips ("All" + each room); a grid of child cards, 4 across
  at 1024 (≥ 120 px tall): initials avatar, name, room, a status pill ("Not in yet", "In since 8:05 AM", "Gone home at 4:30 PM",
  "Away today: Sick", "Not booked today"; not-booked children in a quieter section at the end), and a "Signature needed" chip.
  Tapping a card opens a full-screen sheet (not a small modal), step by step, each with "Back": (1) the child's name and one big
  button, **Sign in** or **Sign out** (≥ 88 px tall); (2) "Who is dropping off?" / "Who is picking up?" with one big button per
  person (name + relationship; for pick-up only people who may pick up) and an outline **Someone else**; "Someone else" opens a
  red-edged block, `role="alert"`: **Not on the list** / "Get the supervisor." and, for pick-up, "Do not let <child> leave with
  someone who is not on the list."; (3) "Sign here with your finger": a signature pad ≥ 600×200 CSS px at 1024 (`touch-action: none`,
  Pointer Events), "Clear", **Done** (disabled until there is ink); (4) the confirmation: a large inline-SVG check, "Signed in" /
  "Signed out", the time, "by <person>", the room's meter pill, and when the room is now over, a red banner `role="alert"`
  "<Room> is over the ratio. Tell the room staff."; back to the grid after 6 s or on "Done". An idle sheet returns to the grid after
  45 s. A card with a pending signature offers "Add a signature" (the recorded person signs; the time does not change).
- **Room view `/room/` (phone 390 first):** "Staff sign in" keypad (same component look as the door, 64 px keys). Header: centre +
  SAMPLE, date, staff name, "Sign out". A room strip: one card per room with a coloured left edge and pill from `data-state`, the
  room name, "4 children · 1 staff", a thin bar of children against `allowed`; tapping selects it (`aria-pressed`). The selected
  room: the meter `label` in full, **I'm in this room** (primary) or **I'm leaving this room** (outline) for the signed-in staff
  member, staff chips, a 2-across grid of children present (initials, name, "In since 8:05 AM", an "Asleep" chip), then "Not in yet"
  and "Away today" lists. Tapping a child opens a bottom sheet (full height at 390): name + room; **Meals** (chips "Breakfast",
  "Morning snack", "Lunch", "Afternoon snack", preselected from `now_local`: before 09:30 breakfast, before 11:00 morning snack,
  before 13:30 lunch, else afternoon snack; then "Ate all", "Ate some", "Ate none"); **Sleep** ("Nap start" or "Nap end", one at a
  time); **Diapers and toilet** ("Wet diaper", "BM diaper", "Dry diaper", "Used the toilet", "Tried the toilet"); **Mood** ("Happy",
  "Okay", "Tired", "Upset"); **Note** (textarea + "Save note"); **Move to another room** (each room with its meter pill); **Today**
  (the logs, newest first, each with "Undo"); "Daily note". After each log a short toast "Saved: <label>" with "Undo". Children
  under "Not in yet" offer "Record without a signature" (pick the person, then it is recorded with the staff member's initials).
- **Staff daily note `/room/note/?child=<id>` (`&date=` optional):** the note exactly as a parent sees it, then "A line from your
  educator" (text + "Save"), "What we did today" for each room the child was in today (text + "Save"), **Make parent link** → a
  read-only field with the link, "Copy link" (says "Copied"), "Works until midnight tonight.", and "Print".
- **Parent note `/note/?t=<token>` (phone 390 first, prints cleanly):** centre + SAMPLE; the child (initials avatar, name, room);
  the long date; "Arrived 8:05 AM with Sarah M. (SAMPLE)" and "Went home …" when known; sections Meals, Sleep, Diapers and toilet
  (titled "Daily record of sleeping, eating and toileting" when `infant_record`), Mood, What we did today, Notes from staff, A line
  from your educator; "Updated 2:07 PM"; "Print". A 404 or 410 shows the API's `error` text in `role="alert"` and nothing else of
  the child. Polls every 60 s while open.
- **Office `/office/` (1280: left rail; 390: top tab bar that scrolls):** supervisor keypad sign-in (an educator's PIN signs in but
  shows "Only the supervisor can open the office."). Tabs: **Today** (counts In now / Not in yet / Away / Gone home, the room meter
  cards, "Print the daily register" per room, lists "Signature needed" and "Not signed out"), **Children** (list; a child form;
  the people list with "May pick up" and "Emergency contact" switches; "Add a person"; "No longer registered" by end date), **Rooms
  and ratios** (rooms list and form with the age group picker and the s.54(9) line; the ratio table: group label, citation, the
  cited default, two number inputs, "Save", "Back to the cited number", "Your licence may differ." at the top, and a "Not set"
  warning row where a number is empty), **Staff** (list, add, role, set PIN, active), **Attendance** (Day / Week / Month and
  previous/next; a table of children × dates with "7 h 25 min", "Away: Sick", "Not signed out" chips, a total column and a total
  row; "Mark away" (child, date, reason, note); "Fix a time" (dialog: date/time inputs + reason); "Download CSV" and "Download
  summary CSV"). Printable daily register `/office/register/?date=&room=`: one homeroom, a table with Child, Date of birth,
  Emergency contact, In (time, by, signature), Out (time, by, signature), Moves, Notes ("Recorded by MT, signature needed",
  "Changed by DK: <reason>"), and the `kept_note`.

**Words (use exactly; tests read them):** "Set up this tablet", "Enter", "Clear", "That PIN is not right.", "Sign in", "Sign out",
"Who is dropping off?", "Who is picking up?", "Someone else", "Not on the list", "Get the supervisor.", "Sign here with your finger",
"Done", "Back", "Signed in", "Signed out", "Not in yet", "Not booked today", "Signature needed", "Add a signature", "Staff sign in",
"I'm in this room", "I'm leaving this room", "Breakfast", "Morning snack", "Lunch", "Afternoon snack", "Ate all", "Ate some",
"Ate none", "Nap start", "Nap end", "Wet diaper", "BM diaper", "Dry diaper", "Used the toilet", "Tried the toilet", "Happy",
"Okay", "Tired", "Upset", "Save note", "Undo", "Move to another room", "Daily note", "Record without a signature", "Make parent link",
"Copy link", "Copied", "Works until midnight tonight.", "Print", "Today", "Children", "Rooms and ratios", "Staff", "Attendance",
"Your licence may differ.", "Back to the cited number", "Not set", "Mark away", "Fix a time", "Download CSV",
"Download summary CSV", "Print the daily register", "Only the supervisor can open the office."

**Hooks the lead's journey test relies on (keep these ids/attributes):**
keypads everywhere: `button.key[data-key="0".."9"]`, `#pin-enter`, errors in `#pin-error` (`role="alert"`).
`/door/`: child cards `button.child[data-child="<id>"]` with `data-status`, `#action-in`, `#action-out`, `button.person[data-person="<id>"]`,
`#someone-else`, `#not-on-list` (`role="alert"`), `#pad` (the drawing surface), `#pad-clear`, `#pad-done`, `#confirm`, `#over-banner`,
`#back`, `#add-signature`.
`/room/`: room cards `button.room[data-room="<id>"]` with `data-state`, `#room-label`, `#presence`, children `button.child[data-child="<id>"]`,
`#child-sheet`, meal chips `button.meal[data-meal]`, log buttons `button.log[data-kind][data-value]` (nap: `data-kind="nap_start"` /
`"nap_end"`, no value), `#note-text`, `#save-note`, `button.move[data-room]`, log rows `[data-log="<id>"]` with `button.undo`, `#open-note`,
`#toast`.
`/room/note/`: `#note-line`, `#save-line`, `#make-link`, `#note-link` (read-only input), `#copy-link`, `#print`.
`/note/`: `#note`, `#note-error` (`role="alert"`), `#print`; inside `#note`: `[data-section="meals|sleep|toileting|mood|activities|staff-notes|line"]`.
`/office/`: tabs `role="tab"` named as above, `[data-child-row="<id>"]`, `#attendance-table`, `[data-cell="<child id>:<date>"]`,
`[data-total="<child id>"]`, `#attendance-total`, `#download-csv`, `#download-summary`, `input[name="per-<age_group>"]`,
`input[name="max-<age_group>"]`, `button.save-ratio[data-group]`, `button.reset-ratio[data-group]`, person rows `[data-person-row="<id>"]`.

## Stack
- `worker/`: Cloudflare Worker, plain JS ESM, no build, **no npm dependencies** (use the `wrangler` on PATH, 4.131+).
  `worker/wrangler.toml`: name `daycare-day-sheet`, `main = "src/index.js"`, `compatibility_date = "2026-09-01"`, D1 binding `DB`
  (`database_name = "daycare-day-sheet"`, `database_id = "00000000-0000-0000-0000-000000000000"` with a comment that deploy replaces
  it, `migrations_dir = "migrations"`), `[assets] directory = "../app/public"`, `binding = "ASSETS"`, `run_worker_first = ["/api/*"]`.
  **No `TEST_MODE` in `[vars]`, ever.**
- `app/public/`: plain HTML/JS/CSS served by the same Worker. No frameworks, no CDN, nothing loaded from another host.
- `app/tests/`: Playwright 1.63; `app/node_modules` is installed on main and the lead symlinks it into your worktree. Config
  (projects `chromium|webkit` × `tablet|390|1280`: `door/**` and `journey/**` run on tablet; `web/**` on 390 and 1280), helpers
  (`fresh`, `newContext(browser, 'tablet'|'phone'|'desktop')`, `setNow`, `at`, `tap`, `type`, `keypad`, `drawSignature`,
  `expectTapTarget`, `contrastOf`, `stateColour` + `STATE_RGB`, `api`, `bearer`, `staffToken`, `supervisorToken`, `doorToken`,
  `sampleSignature`, `signInViaApi`, `signOutViaApi`, `presenceViaApi`, `shot`, `assertNoThirdParty`) and `start-worker.mjs` are
  lead-owned: import them; ask in your report for changes. Every spec calls `fresh(context, request)` first and
  `assertNoThirdParty(context)` last. Real input only: taps and clicks through `tap()`, typing through `type()`, PINs through
  `keypad()`, signatures through `drawSignature()`, downloads through a real tap and `page.waitForEvent('download')`; never set app
  state with `evaluate`. Native `<select>` and date/time inputs may use `selectOption` / `fill`.
- Local dev everywhere: `wrangler dev --local --port <p> --inspector-port <p+10> --persist-to <dir>`; tests add `--var TEST_MODE:1`.
  Migrations: `wrangler d1 migrations apply daycare-day-sheet --local --persist-to <dir>` (from `worker/`).
- **Reference, read only:** `~/Projects/Firewood Orders` is a finished sibling build with the same shape. Its
  `worker/tests/run.mjs`, `worker/tests/negative-lib.mjs` + `negative-*.mjs` (copy-the-worker-and-break-it controls) and
  `app/tests/web/negative-*.mjs` are good patterns to copy and adapt. Never write in that folder, never run anything from it.
- **Ports (never use another):** dd1 Worker 7802 (inspector 7812), dd1 door e2e 7804 (7814), dd1 negative copies 7805 (7815) and
  7806 (7816). dd2 dev Worker 7801 (7811), dd2 e2e 7803 (7813), dd2 negative copy 7807 (7817). Lead 7808 (7818), QA 7809 (7819).
  Other crews run wrangler on this machine and hold the default inspector port 9229.

## Rules
- You own the files listed under your id and **nothing else**. If you need a change in someone else's file, say so in your report;
  do not reach in. `rig guard` enforces this. The lead owns `docs/API.md`: if the contract is wrong or unclear, write the question in
  your report and end your turn; do not invent a different contract.
- Verify, then commit, then report. Never leave a verified step uncommitted: a usage-limit pause lands mid-task with no warning.
- Your report goes in `docs/build-report-<your id>.md`, committed with your work: tests passed/failed/skipped, every negative control
  with the exact break and the red output, known gaps, and anything you want the lead to decide.
- Commit only your own paths: `git commit -- <paths>`. Never grade the shared tree; the lead's numbers come from `rig qa`.
- A check that cannot fail measured nothing. Every task below names its negative controls: make each red once, record it, restore.
  Controls break a **copy** (in `.negative/`, git-ignored), never the shipped code, and the shipped code has no switch that turns a guard
  off. A Worker copy keeps the relative `../app/public` (copy or symlink it beside the copied `worker/`).
- **Milestones.** Finish the milestone, commit, update your report, and end your turn with a one-paragraph summary. The lead merges,
  sends a cross-review, then prompts you for the next milestone. Do not start the next one before that prompt.
- Local only: no deploy, no `--remote`, no `d1 create`, no `secret put`. Nothing is sent anywhere. If auto mode denies something,
  do not work around it; note it in your report and carry on.
- SAMPLE people only, every name ends "(SAMPLE)". No devils or demons, no emoji icons, no real people or businesses, no photos,
  no addresses, no health numbers.
- No request to a third-party host from any page or test (the helpers fail a test on anything but 127.0.0.1).
- Keep scratch files inside your own worktree; never `/tmp`. Stop every server you start before you end a turn.

## Agents

### dd1 — Worker, D1, ratios, register, notes, attendance; the door tablet
Owns:
- worker/**
- app/public/door/**
- app/tests/door/**
- docs/build-report-dd1.md

Report: docs/build-report-dd1.md

Task:
Implement `docs/API.md` exactly in `worker/src/` (suggested split: `index.js` router, `http.js` JSON/errors, `clock.js` now/IP with the
TEST_MODE rule, `time.js` NL local dates, labels and midnight cuts via `Intl`, `auth.js` PBKDF2 PINs, tokens, rate guard, `ratio.js`
the pure meter, `signature.js` validation + SVG, `notes.js`, `attendance.js` pure splitting and sums, `csv.js`, `sample.js` the SAMPLE
centre, `seed.js` the demo). `npm test` = `node tests/run.mjs` (adapt Firewood's): pure unit tests first, then wipe
`worker/.state-<PORT>`, apply migrations there, start `wrangler dev --local --var TEST_MODE:1` on `PORT` (default 7802, inspector +10)
if nothing answers, run the API tests with `node --test`, stop what it started. `npm run negative` runs every negative control; each
appends its output to `tests/negative-control.log` and exits 0 only if its check went red. `npm run dev` = migrate + wrangler dev on 7802.

**M1 (Worker core; commit as soon as it is green, then stop):** `wrangler.toml`; `migrations/0001_init.sql` (centre single row,
ratio_rules, rooms, staff with PIN hash + salt, children, people, visits with both signatures and `*_recorded_by`, placements,
presence, logs with `voided`, room_activity, note_lines, note_links with `token_hash`, sessions with `token_hash`, pin_attempts,
absences, visit_edits); the SAMPLE centre written by `POST /api/test/reset` from `sample.js` (a migration may seed the same; say which).
Routes: `GET /api/info`, `POST /api/signin`, `POST /api/door/unlock`, `POST /api/signout`; every **door** route; every **staff** route;
`GET /api/note/:token`; `POST /api/test/reset`.
M1 unit tests: `tests/ratio.test.mjs` (every row of the decision table for every age group at its exact boundaries: 0 children with 0
staff is ok; `allowed − 1` ok, `allowed` at_limit, `allowed + 1` over with the right `needs_staff`; 0 staff with children; above
`max_children` with plenty of staff → row 4; either number null → unset; every `label` string exactly as API.md, singular and plural);
`tests/time.test.mjs` (labels; local date at 11:59 PM and 12:00 AM NDT; the midnight that ends a date on a DST-change day, Nov 1 2026
and Mar 8 2026; `minutes` truncation); `tests/signature.test.mjs` (valid, empty, one point, a dot under 20 units, out of the box,
non-integers, odd length, too many strokes and points; the SVG path contains only `M`, `L`, digits and spaces).
M1 API tests (`tests/api.test.mjs`): info shape; sign-in wrong PIN 401 `field: "pin"`; roles (door token on a staff route → 403,
educator on an office route → 403 (route may 404 until M2; then 403), no token → 401); unlock with an educator PIN → 403; 5 wrong PINs
→ 429 then even the right one 429 (a different `X-Test-IP` still works); `GET /api/door/children` statuses on Mon Sep 14 (Isla
`not_booked`, everyone else `not_in_yet`); **the ratio moment**: Marie into the infant room, sign in Ava, Liam, Nora → the third answer's
meter is `at_limit`; sign in Owen → **that very answer's meter** is `over` with `needs_staff` 1 and the exact label, and
`GET /api/staff/today` agrees; Kevin also into the infant room → `ok` ("4 children, 2 staff. Room for 2 more."); Marie out → over; **the move**: moving a child from
the infant room to the toddler room changes both meters in one answer; 0 staff with one child → over; a ratio rule edited to null
through a test-only path you document (or `PUT /api/office/ratios` once M2 lands) → `unset`; **authorized pick-up**: sign out Ava by
`p_ava_neighbour` → 403 `not_on_list` with the exact message and the visit is still open (`GET /api/door/children/c_ava` status `in`);
by `p_liam_mother` (another child's person) → 403; by an unknown id → 403 with "That person"; by `p_ava_gran` → 200; drop-off by
`p_ava_neighbour` → 201 (drop-off is allowed); `already_in` and `not_in`; an inactive person → 403; bad signature → 400
`field: "signature"`; staff-recorded in/out set `*_recorded_by` and `awaiting_signature`, and `POST /api/door/visits/:id/sign` by the
recorded person clears it without changing the time, by someone else → 403; **logs**: every kind and its label, `already_napping`,
`not_napping`, `not_in`, a log voided by its author and by the supervisor, another educator → 403; the **note** built from those logs
(meals, naps with `"12:40 PM to 2:05 PM (1 h 25 min)"`, toileting, moods, activities of both rooms after a move, staff notes, the line,
`infant_record` true for Ava and false for Ben, voided logs absent, arrived/left); **the parent link**: token is 43 base64url chars;
the database holds only its SHA-256 (read through `wrangler d1 execute daycare-day-sheet --local --persist-to $STATE_DIR` and document
it); GET at 11:59:59 PM NDT that night → 200 and a log added after the link was made shows; at 12:00:00 AM NDT the next day → 410
`link_expired` with the exact message; an unknown token → 404; a link for another child's token never returns this child.
M1 negative controls: (a) `negative:count` — the copy's present-children count leaves out the most recently signed-in child → the
ratio-moment test goes red; (b) `negative:limit` — the copy's meter treats `children = allowed` as over (`>=`) → the at_limit test
goes red; (c) `negative:pickup` — the copy's sign-out ignores `may_pick_up` → the neighbour test goes red; (d) `negative:expiry` — the
copy cuts the link at UTC midnight instead of local midnight → the 11:59 PM test goes red (link made at 9:00 PM NDT); (e)
`negative:expiry-never` — the copy never checks `expires_at` → the next-day test goes red.

**M2 (Worker, the rest; after the lead's prompt):** every **office** route; `POST /api/test/seed { scenario: "demo" }` per API.md.
Tests (`tests/api-m2.test.mjs` + `tests/attendance.test.mjs` pure): children validation one test per field; people add/edit/deactivate
and `emergency_contact` moving; rooms (inactive with children in → 409); ratios PUT/reset/`edited` and the next meter uses the new
numbers (edit infant to 1:4 → 4 infants with 1 staff is `at_limit`); staff CRUD, `pin_taken`, last supervisor guard; absences (reasons,
duplicate 409, signed-in day 409); **attendance across midnight**: Ava in at 10:30 PM NDT Sep 14, out 1:15 AM Sep 15 → Sep 14 part 90
minutes, Sep 15 part 75, child `minutes` 165, `days_present` 2, CSV two rows with "Continues past midnight" / "Continued from the day
before" and `" Sep 15"` / `" Sep 14"` on the other-date ends; a normal day pair; a visit on the DST fall-back night (Nov 1 2026, 11:00 PM
Oct 31 → 3:00 AM Nov 1) counts its real elapsed minutes; **property**: 300 seeded random visits (1 minute to 30 hours, some across
midnight, some on DST nights) → per child Σ of day parts = Σ of `(out − in)` minutes, no part negative, every part inside its date;
open visits → present, 0 minutes, `Not signed out`, and summary counts; `missing` vs `not_booked` vs `away`; summary CSV header exact and
the Total row equals the column sums; CSV CRLF, quoting of `Smith, "Junior"`, formula guard on a child named `=SUM(A1) (SAMPLE)`,
filename; **fix a time**: reason required, out before in → 400, future → 400, the edit is listed with who and why and the old times,
and the CSV uses the fixed time; register rows (dob, emergency contact, both signatures as SVG, moves label, recorded-by, edited);
the demo seed gives non-empty attendance for the last 15 weekdays and today's three meters `at_limit` (infant) / `over` (toddler) / `ok` (preschool).
**First setup for a real centre** (added by the lead): `worker/tools/first-setup.mjs --centre "<name>" --phone "<709…>" --supervisor
"<name>" --pin <4–6 digits>` (no network, no SAMPLE rows) writes `worker/first-setup.sql` (git-ignored): the centre row with
`sample = 0`, the six cited ratio rules, and one supervisor with a PBKDF2 hash + salt made exactly as `auth.js` does. It is what
docs/DEPLOY.md runs with `wrangler d1 execute daycare-day-sheet --remote --file` at deploy time (not tonight). Test: apply the
migrations and that SQL to a fresh local D1, start the Worker **without** `TEST_MODE`, sign in with that PIN → 200 supervisor,
`GET /api/info` shows the name with `sample: false`, and `/api/test/reset` → 404.
M2 negative controls: (f) `negative:utcday` — the copy cuts visits at UTC midnight → the across-midnight test goes red; (g)
`negative:csvguard` — no formula guard → the CSV test goes red; (h) `negative:ratioedit` — the meter reads the cited defaults instead of
the saved rule → the edit test goes red; (i) `negative:ratelimit` — the copy never counts wrong PINs → the 429 test goes red; (j)
`negative:openvisit` — the copy counts an open visit up to now → the open-visit minutes test goes red.

**M3 (the door tablet; after the lead's prompt, `git rebase main` first):** `app/public/door/` per Design, talking only to docs/API.md
through `door/door-api.js`. Token in `localStorage` `daycare-day-sheet:door-token` (a 401 later shows "Set up this tablet" again). Poll
`GET /api/door/children` every 15 s and after every write. The pad: Pointer Events, `setPointerCapture`, strokes scaled to the API's
600×200 integers, "Done" disabled until the ink spans 20 units. Idle and auto-return timers as in Design.
Playwright in `app/tests/door/` (run `E2E_PORT=7804 npx playwright test tests/door`): `door.spec.mjs` (wrong PIN "That PIN is not right."
**and** the unlock response is 401 via `waitForResponse`; an educator PIN shows "Only the supervisor can set up this tablet."; the grid
shows every SAMPLE child with the right status and Isla under not booked; **sign in by real taps + a drawn signature** → the card says
"In since 9:00 AM" and `GET /api/door/children/c_ava` agrees, and the register (M2 route, or the visit in the answer) holds a non-empty
signature; **the ratio moment on the tablet**: with Marie in the infant room and three infants signed in via API, sign in Owen on the
tablet → `#over-banner` "Infant room is over the ratio. Tell the room staff." and the meter pill's `stateColour` is `STATE_RGB.over`;
**not on the list**: Ava signed in; Sign out → the pick-up list does not contain Rick D. (neighbour) but the drop-off list does;
"Someone else" → `#not-on-list` "Not on the list" / "Get the supervisor." and "Do not let Ava M. (SAMPLE) leave…"; the API still says
`in`; sign out by Joan M. → "Signed out" and the card says "Gone home at 9:00 AM"; **Add a signature** for a staff-recorded drop-off;
"Done" is disabled until ink; "Back" at every step), `targets.spec.mjs` (every door button and key ≥ 72 px and hit-tests to itself at
1024×768 in both engines; the pad ≥ 600×200; SAMPLE visible; no horizontal scroll; `#action-in` contrast ≥ 4.5; the sheet still fits at
768×1024 portrait). Screenshots (setup keypad, grid, sheet steps, block, pad, confirmation with the over banner) via
`shot(page, testInfo, 'door', name)`.
M3 negative controls (`app/tests/door/negative-*.mjs`, copies in `app/.negative/`, E2E_PORT 7806 with `E2E_WORKER_DIR`): (k) the copy's
pick-up list shows every person (ignores `may_pick_up`) → the "does not contain Rick D." check goes red; (l) the copy's confirmation
never shows the over banner → the tablet ratio-moment test goes red; (m) a transparent overlay over `#action-in` → the `tap()` hit-test
goes red. Exit 0 only if red; append to `app/tests/door/negative-control.log`.

### dd2 — Room view, daily note (staff + parent), office, Playwright for them
Owns:
- app/public/index.html
- app/public/style.css
- app/public/ui.js
- app/public/api.js
- app/public/keypad.js
- app/public/room/**
- app/public/note/**
- app/public/office/**
- app/tests/web/**
- docs/build-report-dd2.md

Report: docs/build-report-dd2.md

Task:
Build the pages per the brief and Design, talking only to docs/API.md through `app/public/api.js` (same-origin `fetch('/api/…')`;
errors surface the API's `error` text as is, placed under the input named by `field`). Time and dates come from the API, never the
browser clock. `app/public/keypad.js` is a small shared PIN keypad module (the door page is dd1's and may import it read-only, or build
its own; say which in your report). Until dd1's M1 is merged into your branch you may develop against a mock of your own
(`app/public/api.mock.js`, `?mock=1`, same shapes as API.md), but **every Playwright test runs against the real Worker**.

**M1 (pages; commit when green, then stop):** `style.css`, `ui.js`, `api.js`, `keypad.js`; the start page `/`; the room view `/room/`
(sign-in, room strip with meters from `data-state`, presence button, children grid, the child sheet with every quick log, Undo, move,
Record without a signature; polls `GET /api/staff/today` every 5 s and after every write, never re-rendering an open sheet under the
person's finger); the staff note `/room/note/`; the parent note `/note/`. Screenshots of each at 390 and 1280 into
`app/tests/web/shots/` via `pwshot` or `shot()`.

**M2 (after the lead's prompt; `git rebase main` first, dd1 M1 is merged by then):** Playwright in `app/tests/web/` (run
`E2E_PORT=7803 npx playwright test tests/web`): `room.spec.mjs` (wrong PIN "That PIN is not right." **and** 401 via `waitForResponse`;
tap "I'm in this room" for the infant room → its card reads 1 staff; with three infants signed in via API the card is `at_limit` —
`data-state` **and** `stateColour` = `STATE_RGB.at_limit` — and `#room-label` is the API's label; sign in a fourth via API → within one
poll the card is `over` (both checks) with "Needs 1 more staff."; tap "I'm leaving this room" → still over with "with no staff in the
room"; **move** a child to the toddler room through the sheet → both cards change; every quick log by real taps shows in Today and in
`GET /api/staff/children/:id` with the exact label; the meal chip preselected at 9:00 AM is Breakfast and at 12:00 PM Lunch
(`setNow`); Nap start → the card shows "Asleep" → Nap end; Undo removes a log from the page and the API; Record without a signature
→ the child moves to the room grid and the API visit has `awaiting_signature: "in"`), `note.spec.mjs` (after logs via the page, the
staff note shows each section; save "A line from your educator" and a room activity; **Make parent link** → Copy link (clipboard read
in chromium with permissions granted; in webkit assert "Copied" and skip only the read, with a written reason) → open the link in a new
**phone** context → every section matches the API note, SAMPLE is visible, no staff phone numbers anywhere; add a log on the staff
page → the parent page shows it after its next poll; `setNow` to 11:59 PM NDT → still works; `setNow` to 12:00 AM NDT next day and
reload → `#note-error` shows the API's 410 text and no child section is on the page; an unknown token → the 404 text; print media
(`page.emulateMedia({ media: 'print' })`) hides `#print` and every `.no-print`, and the note sections are still visible),
`targets.spec.mjs` (SAMPLE badge on `/`, `/room/`, `/room/note/`, `/note/`, `/office/`; every button ≥ 44 px and hit-tests to itself at
390; no horizontal scroll at 390; the primary button contrast ≥ 4.5; the open child sheet never has a control under the sticky header or
the toast: hit-test "Ate all" right after a log's toast appears).
M2 negative controls (`app/tests/web/negative-*.mjs`, copies in `app/.negative/`, E2E_PORT 7807 with `E2E_WORKER_DIR`): (a) the copy's
room card renders `data-state="ok"` whatever the meter says → the over check goes red; (b) the copy's theme maps over to the ok colour
(override `[data-state="over"]` in the copy's CSS) → the `stateColour` check goes red while `data-state` still says over (proves the
colour check is not just re-reading the attribute); (c) the copy's parent page keeps showing the last note on a 410 → the expiry check
goes red; (d) a transparent overlay over "Ate all" in the copy → the `tap()` hit-test goes red.

**M3 (after the lead's prompt; rebase on main, dd1 M2 merged):** the office `/office/` with every tab per Design and the printable
register `/office/register/`. Specs: `office.spec.mjs` (educator PIN shows "Only the supervisor can open the office."; add a child and a
person with "May pick up" off → `GET /api/door/children/:id` lists them with `may_pick_up: false`; switch it on → true; edit the infant
ratio to 1:4 in Rooms and ratios → with 4 infants and 1 staff (API setup) the room view card turns `at_limit` in a second context; clear
the number → the Today tab shows "Not set"; "Back to the cited number" → 3 and 6 again; staff add with a taken PIN shows the API's message
under the PIN field), `attendance.spec.mjs` (with visits set up via API with `X-Test-Now` — a normal day, Ava 10:30 PM Sep 14 → 1:15 AM
Sep 15, an open visit, an absence — the Week view cell for Ava Sep 14 reads "1 h 30 min", Sep 15 "1 h 15 min", `[data-total="c_ava"]`
equals the API's minutes formatted, and `#attendance-total` equals the API totals; "Not signed out" shows and "Fix a time" with a reason
changes the cell and the API; "Mark away" with a reason shows "Away: Sick"; **Download CSV** by a real tap → the downloaded file's text
equals `GET /api/office/attendance.csv` for the same range byte for byte, and the same for the summary), `register.spec.mjs` (the
printable register for the infant room lists the children with an SVG signature per visit, the moves line and the kept note; print media
hides the navigation). M3 negative controls: (e) the copy's attendance page sums a visit's minutes into its sign-in date only (drops the
part after midnight from Sep 15) → the Sep 15 cell check goes red; (f) the copy's ratio form shows the cited default instead of the saved
value after reload → the edit check goes red. Final screenshots of every screen at 390 and 1280 into `app/tests/web/shots/`.

## Main (dd-lead, not a slice)
Owns PLAN.md, AGENTS.md, DECISIONS.md, BRIEF.md, docs/API.md, docs/RULES.md, docs/DEPLOY.md, docs/build-report.md, docs/shots/**,
data/**, tools/**, README.md, package.json, demo.mjs, .gitignore, app/package.json, app/package-lock.json, app/playwright.config.mjs,
app/tests/helpers.mjs, app/tests/start-worker.mjs, app/tests/journey/**, app/public/theme.css. Merges each milestone after reading the diff,
sends cross-reviews (dd2 reviews dd1's M1 against API.md before building M2; dd1 reviews dd2's M2 API calls read-only before M3; dd2
reviews dd1's door page against API.md in M3), keeps `npm run rules` green (it proves it can fail first), writes
`app/tests/journey/journey.spec.mjs` (a parent signs Ava in on the tablet → an educator on a phone goes into the infant room, logs lunch
and a nap → the note link opens on a parent phone with those logs → the neighbour is refused at pick-up on the tablet → the grandmother
signs Ava out → the office attendance shows the pair → the next day the link is dead; chromium + webkit), runs `rig qa <sha>` on 7809 for
the Worker suite, every negative control and the whole Playwright suite, takes `pwshot` screenshots into `docs/shots/` from `npm run demo`,
writes README / DEPLOY / build report, pushes the private repo, closes the slice tabs by id, removes worktrees, writes the status file.

## Next round (queued by the lead; each slice gets it in its next prompt)

### dd1
1. `GET /api/office/follow-ups` and the dated door label for a visit left open from an earlier day (M4, already prompted).
2. **Still here** (API.md, 6ab3353): an open visit dated today has `still_here: true` in attendance, no "Not signed out" flag; the
   attendance CSV Note reads `Still here`; the summary's `Not signed out` counts only earlier dates. Tests, and a negative control
   whose copy flags today's open visit as not signed out.
3. Door card status pills stay on one line at 1024×768 ("In since 7:40 AM" wraps today).

### dd2
1. Replace both `alert()` calls in `office/register/register.js` with an on-page `role="alert"` message; a spec opens the register
   with no room and sees it.
2. Today tab: "Signature needed" and "Not signed out" from `GET /api/office/follow-ups` once "Merge dd1 M4" is on main; show dates
   as labels ("Fri Sep 4"), never ISO.
3. **Still here** display: attendance cells for today's open visits show "Still here" with no flag and no "Fix a time"; the register
   reads "Still here" for today and "Not signed out" for an earlier date.
4. Office tap-size sweep and the empty centre name (already prompted).

## Open questions
None blocking. Anything that needs Alexander goes under NEEDS ALEXANDER in the status file.
