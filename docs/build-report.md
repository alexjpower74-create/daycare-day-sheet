# Daycare Day Sheet: build report (dd-lead)

Overnight build 2026-09-14. Lead `dd-lead` (Opus xhigh), slices `dd1` (Worker + door tablet) and `dd2` (room view, notes,
office), both Opus medium, run with Rig in herdr tabs. Local only: nothing deployed, nothing sent, SAMPLE people only.
Every number below was measured in a QA worktree pinned to the sha shown (`rig qa --ref <sha> --port 7809`), never in a
slice's own tree. Pass/fail comes from each command's own exit code, echoed inside the run.

## Final QA

**DONE.** One run, pinned to main `8f40b4b` (every slice round merged), nothing re-run to get green. Commits after `8f40b4b` are
documentation, screenshots and this report only. Command: `rig qa --ref 8f40b4b --port 7809 --run "bash final-stages.sh"`; every stage
runs whatever the previous one did, echoes its own exit code, and a stage with no summary lines would have printed NOT RUN.

| Suite | Command (from the QA worktree) | Passed | Failed | Skipped |
|---|---|---|---|---|
| Rules (quotes against `data/sources/`, self-test first) | `npm run rules` | 21 of 21 | 0 | |
| Worker unit | `cd worker && PORT=7809 npm test` | 32 | 0 | 0 |
| Worker on an empty D1 (before any centre row) | same run | 1 | 0 | 0 |
| Worker API (`wrangler dev --local`, `TEST_MODE`) | same run | 44 | 0 | 0 |
| Worker first setup (real centre SQL, Worker **without** `TEST_MODE`) | same run | 1 | 0 | 0 |
| Playwright door (tablet 1024×768) | `cd app && E2E_PORT=7809 npx playwright test` | 34 | 0 | 0 |
| Playwright web (room view, notes, office, register; 390 + 1280) | same run | 146 | 0 | 6 |
| Playwright journey (tablet + phone + desktop contexts) | same run | 2 | 0 | 0 |
| Worker negative controls | `cd worker && NEG_PORT=7809 npm run negative` | 14 red of 14 | | |
| Door negative controls | `cd app && npm run negative:door` | 8 red of 8 | | |
| Web negative controls | `cd app && npm run negative:web` | 8 red of 8 | | |
| Journey negative control | `cd app && npm run negative:journey` | 1 red of 1 | | |

Playwright by project: chromium-tablet 18 / 0 / 0, webkit-tablet 18 / 0 / 0, chromium-390 37 / 0 / 1, webkit-390 37 / 0 / 1,
chromium-1280 36 / 0 / 2, webkit-1280 36 / 0 / 2. The 6 skips are by width, each with a written reason: the phone tap-size sweep and the
before-setup check in the two 1280 projects, the register sweep in the two 390 projects. No 78xx port was left listening.

### Negative controls (31, each breaks a copy in `.negative/`, never the shipped code, and must go red)

- **Worker (14):** `count` (the last child signed in is not counted → the ratio moment test), `limit` (at the limit treated as over),
  `pickup` (sign-out ignores "May pick up"), `expiry` (parent link cut at UTC midnight), `expiry-never` (link never expires), `utcday`
  (visits cut at UTC midnight → the across-midnight minutes), `csvguard` (no formula guard), `ratioedit` (meter ignores the saved ratio),
  `ratelimit` (wrong PINs never counted), `openvisit` (an open visit counted up to now), `followups` (only children here now),
  `stillhere` (never still here), `info-sample` (SAMPLE badge before setup), `homeroom` (a closed home room blocks every edit).
- **Door (8):** `pickup-list` (pick-up list shows everyone), `over-banner` (no red banner), `overlay` (a cover over Sign in → hit-test),
  `tap-after-stroke` (Done ignores the finger lifting → a fast tap after signing is lost), `stale-label` (last week's open visit reads
  "In since"), `null-text` (stray "null" under the grid), `pill-wrap` (status pills back in a narrow column), `stale-sheet` (the sheet
  offers a write another device already made).
- **Web (8):** `card-state` (every room card says ok), `over-colour` (over painted green while `data-state` still says over),
  `expiry-page` (parent page keeps the old note after a 410), `overlay` (a cover over "Ate all"), `attendance-day` (the part after
  midnight dropped), `ratio-reload` (the ratio form shows the cited default after saving), `still-here` (today's open visit flagged),
  `overnight-fix` (Fix a time uses the cell's date).
- **Journey (1):** the room view sends "some" for "Ate all" → the whole-day journey fails at the meal check.

### Real defects found (every one fixed with a test that fails without the fix)

- **By the checks:** a tap on Done less than a second after a fast signature stroke was dropped on a touch tablet (`touch-action: none`);
  the office tab bar slid under the sticky header at 390 so no tab could be tapped; WebKit sized a `<select>` to its longest cited label
  (141 px sideways scroll); a toast covered "Make parent link"; a sheet filled in after its buttons appeared so a tap landed on "Move".
- **By screenshots:** the office flagged all 15 children still in the building as "Not signed out" (lead; a contract gap); a stray "null"
  and circle-shaped pills on the door grid (dd1).
- **By cross-review (across the slice boundary):** signature SVGs with no stroke; nap state stale when a sheet opens; Undo offered on other
  educators' logs; Today blind to follow-ups for children who had gone home; a closed home room blocking every edit; Fix a time sending the
  wrong date on an overnight visit; no way to remove an absence; a failed `/api/info` leaving "Loading…"; the door keeping a refused write,
  a hard-coded centre name, and a grid that stopped on an info failure.
- **Process:** one commit went in with its own spec red (a pipe hid Playwright's exit code) and was fixed in the next; a class's `display`
  beating the `hidden` attribute is now a global rule in theme.css; the lead's "Next round" headings broke `rig guard` and were renamed.

## QA history (each milestone graded before it was merged)

| When | Pinned sha | What | Result |
|---|---|---|---|
| dd1 M1 | `7c6c534` | Worker core: register, live ratios, logs, daily note, parent links | unit 20 / 0 / 0, API 17 / 0 / 0; negative controls 5 of 5 red (count, limit, pickup, expiry, expiry-never) |
| dd2 M1 | `9370b07` | room view, staff note, parent note (against a mock) | page check PASS in chromium-390, chromium-1280, webkit-390, webkit-1280; overlay control red in all four |
| dd2 M2 | `7b6f409` | cross-review of dd1 M1 (237 route checks, 2 findings) + Playwright room/note/targets on the real Worker | web 50 / 0 / 2 skipped (tap-size sweep is phone-only); negative controls 4 of 4 red (card-state, over-colour, expiry-page, overlay) |
| dd1 M2 | `9f8efad` | every office route, attendance cut at local midnight, CSVs, fix a time, register, demo seed, first-setup tool | unit 31 / 0 / 0, API 40 / 0 / 0, setup 1 / 0 / 0 (Worker without TEST_MODE: real PIN signs in, reset 404); negative controls 10 of 10 red (+ utcday, csvguard, ratioedit, ratelimit, openvisit) |
| dd1 M3a | `8bf2c61` | contract changes: attendance `upcoming`, note `rooms_today` + activity room ids, demo seed without moving a child | unit 31 / 0 / 0, API 40 / 0 / 0, setup 1 / 0 / 0; negative controls 10 of 10 red |
| dd2 M3 | `4f84a39` | the office (Today, Children, Rooms and ratios, Staff, Attendance with CSVs) + printable register; dd1 cross-review fixes (nap state, Undo on own logs) | web 102 / 0 / 2 skipped; web negative controls 6 of 6 red (+ attendance-day, ratio-reload) |
| dd1 M3b | `bdbcaa9` | the door tablet (keypad setup, sign in/out with finger signature, not-on-the-list block, over banner, add a signature) | Worker unit 31 / 0 / 0, API 40 / 0 / 0, setup 1 / 0 / 0; door 24 / 0 / 0 (chromium + webkit tablet); door negative controls 4 of 4 red (pickup-list, over-banner, overlay, tap-after-stroke) |
| journey | main `d4ff551` | a parent signs Ava in on the tablet → Marie logs lunch and a nap on a phone → the parent link shows them → the neighbour is not offered at pick-up and "Someone else" is blocked → the grandmother signs out → office attendance shows 7 h 30 min (API 450 min) → the link works at 11:59:59 PM and is dead after midnight | 2 / 0 / 0 (chromium-tablet, webkit-tablet), first run; negative control red: a room view that sends "some" for "Ate all" fails at the meal check |
| dd1 M4 | `cfbc2aa` | `GET /api/office/follow-ups`; dated door label for a visit left open from an earlier day; two grid bugs the screenshots showed (stray "null", circle-shaped pills) | Worker unit 31 / 0 / 0, API 42 / 0 / 0, setup 1 / 0 / 0, Worker controls 11 of 11 red; door 26 / 0 / 0, door controls 6 of 6 red |
| dd2 round 4 | `c0785c3` | office + register tap-target sweep (found: tab bar unreachable under the sticky header at 390; WebKit sizing a `<select>` to its longest cited label, 141 px sideways scroll); no centre name before setup (proven red against the old pages in both engines) | web 114 / 0 / 6 skipped; web controls 6 of 6 red |
| dd1 still here | `2e15ca1` | an open visit dated today is `still_here` (JSON, CSV Note, summary counts earlier dates only); short door pills on one line | Worker unit 32 / 0 / 0, API 43 / 0 / 0, setup 1 / 0 / 0, Worker controls 12 of 12 red; door 28 / 0 / 0, door controls 7 of 7 red |
| dd1 sample flag | `d6d5dc3` | `/api/info` answers `sample: false` before the centre row exists (no SAMPLE badge on a real deployment before setup) | Worker unit 32 / 0 / 0, empty D1 1 / 0 / 0, API 43 / 0 / 0, setup 1 / 0 / 0, Worker controls 13 of 13 red; door 28 / 0 / 0, door controls 7 of 7 red |
| dd1 office cross-review | `841f82a` | dd1 read dd2's office against API.md: 7 findings (attendance and register ignore `still_here`; Today not on follow-ups; a closed home room blocked any child edit, fixed in the Worker; Fix a time sends the wrong date on an overnight visit's second day; no way to remove an absence; a failed `/api/info` leaves "Loading…") | Worker unit 32 / 0 / 0, empty D1 1 / 0 / 0, API 44 / 0 / 0, setup 1 / 0 / 0; Worker controls 14 of 14 red (+ homeroom) |
| dd2 round 5 | `6211efc` | register problems shown on the page (no browser dialog, specs fail on one); Today follow-ups from `GET /api/office/follow-ups` with day labels and Fix a time in place; "Still here" in attendance and on the register | web 134 / 0 / 6 skipped; web controls 7 of 7 red (+ still-here) |
| rehearsal | main `7a657c7` | the final QA stages on merged main (everything except dd2's and dd1's last rounds): rules, Worker, Worker controls, every Playwright project, door and journey controls (web controls skipped: dd2 was using their port, and they had just gone 7 of 7 red at `6211efc`) | rules 21 / 21; Worker unit 32, empty D1 1, API 44, setup 1, controls 14 of 14 red; Playwright 164 / 0 / 6 skipped (door 28, journey 2, web 140 lines; chromium + webkit × tablet, 390, 1280); door controls 7 of 7 red; journey control red |
| dd2 last round | `8aea852` | Fix a time uses the visit's own dates on an overnight visit; remove a mistaken absence; Attendance shows why when `/api/info` fails; cross-review of dd1's door (3 findings: stale sheet after a 409, hard-coded centre name, grid stops when `/api/info` fails) | web 146 / 0 / 6 skipped; web controls 8 of 8 red (+ overnight-fix) |
| dd1 final round | `41cfbe4` | dd2's door findings: after a 409 the sheet shows the API's message and starts again; centre name and SAMPLE badge only from `/api/info` (one commit went in with its spec red and was fixed in the next; the cause, a class `display` beating `hidden`, is now a global rule in theme.css); the grid survives a failed `/api/info` | door 34 / 0 / 0, door controls 8 of 8 red (+ stale-sheet); Worker unit 32, empty D1 1, API 44, setup 1 |

## Rules check

`npm run rules`: 21 of 21 rules verified word for word against `data/sources/`; the self-test proves a one-letter change is
caught before the real check runs.

## Lead's own findings

- `rig qa <sha>` pins main unless the sha is passed as `--ref` (reported to Onyx; LEAD-RULES fixed).
- A QA run that writes tracked files (the negative-control log, screenshots) leaves the QA worktree dirty and the next re-pin
  fails; the lead restores the QA worktree after each run.

## Known gaps (what the app does not do, or cannot know yet)

- **Whether an electronic daily register counts.** The Policy and Standards Manual describes a bound, numbered, pen-written register
  (ELCD-2017-L2 1). Whether a tablet register with finger signatures is accepted is Unknown until the Department of Education (Early
  Learning and Child Care) says so; Alexander decided on 2026-09-15 to proceed as if it is (DECISIONS.md 36). The office prints the register per homeroom so a centre can keep paper as well.
- **Group size counts children present, not children assigned.** s.53(3) limits the children *assigned* to a homeroom; the meter counts
  who is in the room now. The office does not yet warn when more registered children are assigned to a room than its maximum.
- **Ages are not checked against the room.** A child whose age has moved out of the room's range is not flagged; the operator picks the
  age group per room (and the youngest group for a mixed room, s.54(9)).
- **Certification is not checked** (s.54(6)–(8)): the meter counts staff, not their certificates.
- **Staff presence is what staff tap.** "I'm in this room" is self-reported; there is no shift clock or break tracking.
- **The door tablet needs a connection.** There is no offline queue on the door; a tablet without Wi-Fi cannot sign anyone in.
- **Parent links are capability links.** Anyone with today's link sees that child's note until midnight; there are no parent accounts,
  and nothing is emailed or texted (by design).
- **One centre per deployment, Newfoundland time only.**
- **No backups of its own.** D1 Time Travel covers 30 days; registers must be kept 7 years (s.45(3)), so a deployment needs exports.
- **Tested in Playwright's Chromium and WebKit** at tablet 1024×768, phone 390 and desktop 1280, not on a physical iPad or phone.

