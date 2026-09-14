# Build report — dd1 (Worker, D1, ratios, register, notes, attendance; the door tablet)

A record, not a queue. Newest milestone at the top.

## Next round item 4 — `sample: false` before the centre row exists — DONE

- **Change (`index.js`).** With no centre row, `/api/info` now answers `sample: false` (with `centre_name` and `phone` still `""`), so a real deployment shows no SAMPLE badge before first setup.
- **Empty-D1 test.** `tests/api-empty.test.mjs` runs first, on the migrated D1 the run just started, before any reset or first setup. It checks `centre_name` `""`, `phone` `""`, `sample` false, then that `POST /api/test/reset` gives the SAMPLE centre with `sample: true`. `tests/run.mjs` runs it only on a Worker it started, never on a reused one.
- **After first setup.** The setup stage still asserts `sample: false`.
- **Control `negative:info-sample`.** The copy answers `true` with no centre row. It went red: `+ true` / `- false`.
- **Verified.** `npm test` exit 0: unit 32, empty-D1 1, API 43, setup 1.

## Next round — Still here (item 2) and door pills (item 3) — DONE

### The M4 commits, guard-checked after the fact (lead's request)

- **`rig guard --agent dd1 --base bdbcaa9` refused.** It listed PLAN.md, DECISIONS.md, README.md, dd2's office, room and note pages, their specs and shots, docs/shots, tools/docs-shots.mjs and more. Every one of those came into rig/dd1 through the merges of main since bdbcaa9 (other owners' commits); that base compares the whole branch, merges included.
- **Scoped to what this branch adds, it passes:** `rig guard --agent dd1 --base main` → `ok dd1: 26 file(s), all inside slice (vs main)`.
- **Per commit** (`git show --name-only`), files outside dd1's Owns: 6501c93 → 0, 3814615 → 0, cfbc2aa → 0.
- **So 3814615 and cfbc2aa are guard-clean.** The hand check in M4 matched.

### Item 2 — Still here (Worker) — commit 5172f12

- **The change (`attendance.js`).** One helper, `isStillHere(part)`, true for an open visit dated today.
  - That day carries `still_here: true` (every day object now has `still_here`).
  - Its CSV row's Note reads `Still here`.
  - It is not counted in `not_signed_out`, so the summary's `Not signed out` column counts only open visits dated before today.
  - `open: true` stays, as API.md says.
- **Tests.**
  - The API test reads Ava, signed in at 9:00 AM and never out, over Sep 14–15. At 11:00 AM on Sep 14: `still_here: true`, `not_signed_out: 0`, Note `Still here`, summary 0 (Ava and Total). At 10:00 AM on Sep 15: `still_here: false`, `not_signed_out: 1`, Note `Not signed out`, summary 1.
  - A unit test does the same in `buildAttendance`.
  - The existing across-midnight and last-week open-visit tests gained `still_here: false`.
  - The `=SUM(A1)` CSV test's open visit is read on its own day, so its Note is now `Still here`.
- **`negative:stillhere`** (the copy never treats a visit as still here) went red: `+ still_here: false` / `- still_here: true`.
- **`npm test`:** exit 0 (unit 32, API 43, setup 1).

### Item 3 — door status pills on one line

- **The cause.** At 1024×768 a card is about 232 px wide, but the pill sat in the text column beside the 56 px avatar, about 120 px. "In since 12:45 PM" and "Gone home at 12:45 PM" wrapped there.
- **The fix.** The pill and the "Signature needed" chip now sit under the avatar across the card's full width (`grid-column: 1 / -1`), at 14 px text with a set line height. The long "Still signed in from …" label still wraps, as the rounded box from M4.
- **Door spec** (`status pills: …`, both engines, 1024×768).
  - Setup: Ava in at 12:45 PM, Liam gone home at 12:45 PM, Nora not in yet, Isla not booked, and Ruby's open visit from Tue Sep 8.
  - Each short pill has the exact text, `scrollWidth ≤ clientWidth`, one line of text (height inside padding and border ÷ line height), and its right edge inside its card.
  - Ruby's long pill hides nothing and stays inside its card.
  - Screenshot: `8-status-pills`.
- **Control (q) `negative-pill-wrap`** (the copy puts the pill back in column 2 beside the avatar) went red: `In since 12:45 PM stays on one line — Expected: 1, Received: 2`. `npm run negative:door` now runs 7 controls.
- **Door suite:** 28/28 on chromium-tablet and webkit-tablet.

## M4 — follow-ups (a) and the "Still signed in" door label (b) — DONE

### (a) `GET /api/office/follow-ups` — commit 6501c93

- **What it lists.** `pending_signatures` are staff-recorded in or out times still waiting for the parent's signature, on visits dated in the last 14 dates (today included), newest first, whether or not the child is here now. `not_signed_out` is every open visit dated before today, oldest first. Supervisor only (every `/api/office/*` path already is).
- **API test** (`follow-ups: …`):
  - Ava's recorded drop-off at 8:05 AM today, after she went home at 4:30 PM, is listed with `recorded_by` MT.
  - Nora's from Tue Sep 1 (the 14th date) is listed; Liam's from Mon Aug 31 (the 15th) is not.
  - Ruby's open visit from Tue Sep 8 and Finn's from Thu Sep 10 are listed in that order; Ben, signed in today, is not.
  - Ava signing at the door removes her item; an educator gets 403.
- **`negative:followups`:** the copy keeps only visits still open, so only children signed in now. Red on that test: Ava and Nora dropped out of the list.

### (b) The door label for a visit left open from an earlier day — commit below

- **Worker (`db.js`).** An open visit whose date is before today reads `Still signed in from Tue Sep 8, 8:05 AM. Not signed out.` (the visit's own date and time); one opened today still reads `In since 8:05 AM`. Status stays `in`, so the door still offers Sign out.
- **Door page.** No change needed: the card and the sheet show the API's `status_label` as it is.
- **API test** (`door: a visit left open from an earlier day …`):
  - Ruby's visit reads `In since 8:05 AM` on Sep 8 itself, and the new label on Mon Sep 14, in both the list and the detail.
  - Ben, signed in today, reads `In since 9:00 AM`.
  - Signing Ruby out makes her `Gone home at 9:30 AM`.
- **Door spec** (`a visit left open from last week: …`, both engines), set up like the demo seed: Ruby signed in Tue Sep 8 and never out.
  - Her card has `data-status="in"` and the exact label, and does not contain "In since".
  - Ben's card still reads `In since 9:00 AM`.
  - The sheet's status line shows the same label, and `#action-out` is there.
  - Screenshot: `7-still-signed-in-from-last-week`.
- **Control (o) `negative-stale-label`, red once in a copy.** It needs a Worker patch, so `negative-lib.mjs` can now patch `worker/…` files as well as `app/public/…`. The copy's `db.js` labels every open visit "In since …". The door check went red: `Expected substring: "Still signed in from Tue Sep 8, 8:05 AM. Not signed out."` against `Received string: "RERuby E. (SAMPLE)Preschool roomIn since 8:05 AM"`. It is part of `npm run negative:door`, which now runs 5 controls.

### Two page bugs the new screenshot showed (fixed in the (b) commit)

The first `7-still-signed-in-from-last-week` shot missed Ruby's card, which was below the fold. The spec now taps the Preschool room chip before the shot. The shot then showed two bugs that no test had caught:

1. **A stray "null" under the grid.** Whenever a room filter leaves no not-booked children, `drawGrid` handed `replaceChildren` a `null`, which prints as text. It showed on the Toddler room and Preschool room chips; the grid test filtered to the toddler room and never looked for it.
   - Fix: empty sections are left out.
   - Test: the grid spec asserts `#app` has no `null` or `undefined` after filtering.
   - **Control (p) `negative-null-text`:** the copy passes the `null` again; red with `Received string: "…Maya S. (SAMPLE)Toddler roomNot in yetnull"`.
2. **A long status label drew as a circle.** The 999 px radius turned the wrapped "Still signed in from Tue Sep 8, 8:05 AM. Not signed out." into an ellipse, with the text spilling outside it. `.status-pill` now has a 14 px radius (still a pill on one line, a rounded box when it wraps) and `max-width: 100%`. This one has no test; the screenshot is the check.

`npm run negative:door` now runs 6 controls.

### Verified at the (b) commit

- `cd worker && npm test`: exit 0 (unit 31, API 42, setup 1).
- `cd app && E2E_PORT=7804 npx playwright test tests/door`: 26/26 (13 on chromium-tablet, 13 on webkit-tablet), after both screenshot fixes.
- `negative:followups` red at (a); door controls (o) and (p) red at (b).
- Every server started for these runs was stopped, and ports 7802, 7804, 7805 and 7806 are free.

### Needs from the lead (M4)

- **`rig guard` is blocked by PLAN.md on main.** Commit ee56300 added "## Next round" with `### dd1` and `### dd2` headings, and rig reads
  those as a second pair of agent ids: `Duplicate agent id "dd1" in the plan. Ids are addresses; they must be unique.` The guard
  stops before it checks any file. I committed M4b (3814615) and this note without it, after checking every staged path by hand
  against dd1's Owns (`worker/**`, `app/public/door/**`, `app/tests/door/**`, `docs/build-report-dd1.md`). Renaming those headings
  (for example `#### dd1 next`) should bring the guard back.
- **Status pills on one line.** Your queued item 3 wants status pills to stay on one line at 1024×768. M4b gave the pill a 14 px
  radius so a wrapped label is a rounded box instead of a circle; that stops the shape breaking, but it is not the one-line layout
  you asked for. Not started, since it is next round.

## M3 — Worker changes (a) and the door tablet (b) — DONE

### (a) Worker changes from the lead's M2 answers — commit 8bf2c61, on its own so dd2 can merge it

- **`upcoming`:** a booked date after today with nothing recorded. `missing` now means today or earlier only. `buildAttendance` takes `today`.
  - Unit test: the same range seen from Sep 15 and from Sep 16, where today itself is `missing`.
  - API test: Sep 14–20 seen on Monday (`upcoming` from Sep 16), then seen on Thursday (Sep 16 and 17 now `missing`, Sep 18 still `upcoming`).
- **Note `rooms_today` and `activities[].room_id`:** the note test first reads Ava's note after her move, when only the infant room has a line. `activities` lists that one room and `rooms_today` lists both. It then checks the full note with both lines, Ben's single room, and `[]` for a day with no placements.
- **Demo seed:** Marie with 3 infants (`at_limit`), Kevin with all 6 toddlers (`over`, needs 1), Priya with 6 pre-schoolers (`ok`), nobody moved. The test checks those meters and that the toddler room holds exactly the six toddlers.
  - The visit never signed out moved from Finn to **Ruby**, who is not signed in today. Finn is now one of today's toddlers, and the database allows only one open visit per child, so his old open visit would have blocked his sign-in.
- **Verified:** `npm test` exit 0 (unit 31, API 40, setup 1), and all 10 Worker negative controls red again before the commit.

### (b) The door tablet — what was built

`app/public/door/`:
- **`index.html`:** a solid ground with no aurora, and a sticky header with the centre name, SAMPLE, the long date and the time, all from `/api/info`.
- **`door.css`:** the door's own styles. It does **not** load dd2's `style.css`; tokens come from theme.css only, and ratio colours only through `[data-state]`.
- **`door-api.js`:** the page's only way to the API. The token is kept in `localStorage` under `daycare-day-sheet:door-token`, and a 401 forgets it, so "Set up this tablet" comes back.
- **`pad.js`:** Pointer Events, `setPointerCapture`, and integer strokes in the API's 600×200 box whatever the pad's size on screen. Strokes of 1 point are dropped, 50 strokes and 4 000 points are the most kept, and Done stays disabled until the usable ink spans 20 units.
- **`door.js`:**
  - **Setup:** dd2's `/keypad.js` and `/ui.js` imported read-only (`h`, `avatar`, `icon`, `whenIdle`), as PLAN allows.
  - **Grid:** room chips, cards 4 across at 1024 and at least 132 px tall, not-booked children in a quieter `#not-booked` section, and a "Signature needed" chip.
  - **Full-screen sheet, step by step, with `#back` at every step:**
    1. `#action-in` / `#action-out`, plus `#add-signature` when a recorded time is waiting.
    2. The people list; pick-up offers only `may_pick_up`. `#someone-else` opens `#not-on-list` (`role="alert"`).
    3. The pad, with `#pad-clear` and `#pad-done`.
    4. `#confirm` with a check, the time, "by …", the meter pill and its label, `#over-banner` (`role="alert"`) when the room is now over, and `#confirm-done`.
  - **Timers:** polls every 15 s and after every write; a sheet left alone closes after 45 s; a confirmation closes after 6 s or on Done.

Every hook and word from PLAN.md's Design section is used. The only ids not in PLAN's hook list are `#confirm-done` (the "Done" on the confirmation), `#date-line`, `#time-line`, `#children` and `#not-booked`.

### Verified, and how it could have failed

`E2E_PORT=7804 npx playwright test tests/door`: **24/24 passed** (chromium-tablet and webkit-tablet, 12 each).

`door.spec.mjs`:
- **Setup:** the wrong-PIN text **and** the 401 via `waitForResponse`; the educator's 403 text; the supervisor PIN opens the grid, and it stays set up after a reload.
- **Grid:** all 19 cards with the API's `data-status` and label, Isla alone under Not booked today, the header date and time, and chips filtering the grid.
- **Sign in by real taps and a drawn signature:** "In since 9:00 AM" on the card, the door API agrees, and the office register holds the drawn stroke (more than 6 `L` segments).
- **The ratio moment:** the banner text, `role="alert"`, the pill's `stateColour` equals `STATE_RGB.over`, and the meter label.
- **Not on the list:** the neighbour is on the drop-off list but not the pick-up list; the block has all three lines and the API still says `in`; Joan signs Ava out and the card reads "Gone home at 9:00 AM".
- **Add a signature:** the time and `in_recorded_by` stay, `awaiting_signature` clears, and the chip goes.
- **Back and Done:** Back at every step; Done disabled before ink, after a single tap (a dot) and after Clear; going back never signs anyone in.
- **Timers:** using `page.clock`, the sheet is open at 44 s and closed at 46 s; the confirmation is shown at 5 s and gone at 7 s.
- **Dead token:** after `POST /api/signout` with the tablet's own token, the next tap shows "Set up this tablet" and the token is gone.

`targets.spec.mjs`:
- Every visible button and key on the keypad, grid, each sheet step, the block, the pad and the confirmation is at least 72 px and passes `expectTapTarget`'s `elementFromPoint` hit-test.
- The pad is at least 600×200 at 1024; SAMPLE is visible on every screen; there is no horizontal scroll.
- `#action-in` contrast is at least 4.5.
- At 768×1024 portrait the same checks pass, and the pad is 600+ px wide and fully on screen.

Screenshots of both engines are in `app/tests/door/shots/` (22). I looked at the setup keypad, grid, signed pad, over-banner confirmation and not-on-the-list block: all readable, nothing empty.

**Door negative controls:** `NEG_PORT=7806 node tests/door/negative-all.mjs` — **all 4 red**, logged in `app/tests/door/negative-control.log` with no home-folder paths.

| control | break in the copy | red test and what it saw |
|---|---|---|
| (k) `negative-pickup-list` | `peopleStep` offers every person at pick-up | not on the list: "the pick-up list does not contain Rick D." — expected 0, received 1 |
| (l) `negative-over-banner` | `overBanner` never draws `#over-banner` | the ratio moment: "the over banner" — element not found |
| (m) `negative-overlay` | a transparent `::after` layer over `.action-wrap` | sign in: `tap(Sign in) hit-test at 512,225: something else is on top`, received the `.action-wrap` div |
| (n, added) `negative-tap-after-stroke` | Done and Clear act on click only | sign in: `page.waitForResponse: Test timeout` (the Done tap is lost) |

### A real bug the first run found: Chromium drops the tap on Done right after a fast stroke

- **What happened.** In the first run, every chromium-tablet flow that signs failed, while WebKit passed. Done and Clear did nothing after the helper's touch drag.
- **What throwaway probes showed** (not committed):
  - Pointer events fire normally, and the finger lifts at the end of the drag.
  - Chromium sends no `click` for the next tap. It sends none at 250 or 500 ms after the stroke, and does at 900 ms or after a slow stroke that holds still.
  - The same fast drag on the step title does not do it. The pad with `touch-action: auto` does not do it. Disabling pointer capture changes nothing.
  - So it is Chromium treating that tap as stopping a fling after a fast release on a `touch-action: none` element.
- **Why the page fixes it.** A parent reaches for Done well inside 900 ms, so this would lose real taps on a Chromium tablet. The pad must keep `touch-action: none`, or a finger pans the page.
- **The fix.** Done and Clear (`onPress` in door.js) also act on a touch `pointerup` that started on the button and ended inside it, and ignore the click that may follow within 800 ms. Keyboard and mouse still go through `click`.
- **Proof.** Control (n) puts back click-only and the Chromium sign-in test goes red again.
- **Two things that are not the cause.** I first removed `preventDefault()` from the pad's pointer handlers; the probe showed it made no difference, and the removal stays because it isn't needed with `touch-action: none`.

The first run also showed a page bug in WebKit: closing the sheet left the old grid showing until the refresh came back, so a tap could land on a card about to be replaced. `closeSheet` now draws the grid from the data in hand at once.

### The lead's journey spec against this page

`E2E_PORT=7805 npx playwright test tests/journey --project chromium-tablet` (run once, output not kept):
- The door, room view, parent note, refused pick-up and the grandmother's sign-out all pass.
- It stops at `journey.spec.mjs:123`, `keypad(desk, SUPERVISOR_PIN, …)` on `/office/`. That page is dd2's M3 and not built yet; nothing on the door side is wrong.
- The run wrote `app/tests/journey/shots/`, which is the lead's path. I deleted it and did not commit it.

### Housekeeping

- Scratch output (probe specs, run logs, WebKit results) lived only in `app/tests/door/` and was deleted before the commit.
- `m2-run.txt` has not come back.

### Needs from the lead

- **`app/package.json` is yours:** a script such as `"test:door:negative": "node tests/door/negative-all.mjs"` would make the door controls part of `rig qa`.
- **`helpers.mjs` `drawSignature` (yours):** on Chromium it lifts with no pause, so the first tap after it is dropped unless the page handles `pointerup` as the door page now does. Any other page with a pad would need the same `onPress`, or the helper could hold still for ~100 ms before `touchEnd`. The door page is fine either way.

## Cross-review of dd2 M1 — DONE (read only, branch `rig/dd2` at 9370b07)

Read: `api.js`, `room/room.js`, `room/session.js`, `room/note/staff-note.js`, `note/note.js`, `note/render.js`, `keypad.js`. Each call was checked against docs/API.md and against what my Worker actually answers.

**Nothing will break against the real Worker.** These all match:
- Every path and method.
- Every request body: `{ pin }`, `{ room_id }`, `{ person_id }`, log bodies, `{ text }`, `{ text, date }`, and the link POST with no body.
- Every field the pages read, including `me.room_id`, `me.staff.name`, `not_in_yet[].home_room_id`, `away[].child` / `reason_label` and `gone_home`.
- On rooms and children: `rooms[].room` / `meter` / `children` / `staff`, the children's `napping`, `last_meal_label`, `awaiting_signature` and `in_label`, and `since_label`.
- On the staff child view: `visit.out_at`, `child.room_id` / `room_name`, `logs[].at` / `label` / `time_label` / `by.initials` and `people`.
- The whole note shape, and the link's `url` / `expires_label`.
- Error handling: a 401 forgets the token; the parent page drops the note on 404 and 410 and shows the API's text; an error with a `field` lands under `[name=field]`, and the textareas are named `text` as the API's `field: "text"` expects.

Findings, none blocking. dd2 or the lead decide:
1. **Stale nap button (low).** `room.js` `refreshSheet` works out nap state from the fresh `d.logs`, then overrides it with `today`, which can be up to 5 s old. If another phone logged a nap start in that window, the sheet offers "Nap start". Tapping it gets 409 `already_napping`, which is shown as a toast. Suggest trusting `d.logs`, or the API's `napping` after `refresh()`.
2. **Undo shown on other people's logs (low, UX).** Every row in Today shows "Undo", but an educator can only void their own log: the Worker answers 403 "Only the person who logged it, or the supervisor, can undo it." The page handles it with a toast. It could hide Undo unless `log.by.id` is the signed-in staff member or the role is supervisor.
3. **DONE (lead added `rooms_today` and `activities[].room_id`; built in M3a).** **"What we did today" can miss a room (medium, contract question for the lead).** `staff-note.js` builds its room list from `note.activities` plus the child's current room. API.md now lists only rooms whose line is not empty, so a child moved out of a room whose line is still empty never gets that room's box on this page. No field in the API says which rooms a child was in today. Options: show every active room from `today.rooms`, or add `placed_room_ids` to the note or staff child view.
4. **Mock data in a real page (low, lead decides).** `room/api.mock.js` ships in `app/public`, and `?mock=1` is remembered for the tab. Anyone opening `/room/?mock=1` on a real phone sees made-up data that looks live. Suggest refusing mock mode off `127.0.0.1`/`localhost`, or not shipping it.
5. **For dd2's M3.** `api.js` `call()` parses every answer as JSON. The CSV downloads are `text/csv`, so they need a real link (`<a href download>` with the token passed another way) or `fetch` + blob, not `call()`.
6. **For information only.** The keypad refuses fewer than 4 digits with its own message before calling the API, so `#pin-error` shows "Enter your 4 to 6 digit PIN." rather than the API's text. The room spec's wrong-PIN test uses 4 digits, so it is unaffected.

## M2 — Worker, the rest — DONE

### What was built

| file | what |
|---|---|
| `src/office.js` | Every office route: children (list, POST, PUT partial; one field at a time in API.md order), people (POST, PUT, DELETE → inactive; setting the emergency contact clears it on the child's others), rooms (list, POST, PUT; closing a room with children signed in → 409), ratios (list with the note, PUT, reset, `edited`), staff (list, POST, PUT; `pin_taken`; always one active supervisor), absences (POST, DELETE), `PUT /api/office/visits/:id` (fix a time). |
| `src/attendance.js` | Pure. `splitVisit` cuts at every local midnight; an open visit is one 0-minute part. `buildAttendance` gives the JSON, the attendance.csv rows and the summary rows. `movesLabels` builds the register's moves line. |
| `src/csv.js` | Pure. CRLF lines, quoting, the formula guard, hours to 2 decimals. |
| `src/reports.js` | `GET /api/office/attendance`, `attendance.csv`, `attendance-summary.csv`, `register`. |
| `src/seed.js` | `resetSample` (moved out of index.js) and `POST /api/test/seed { scenario: "demo" }`. |
| `tools/first-setup.mjs` | The lead's first-setup tool: `--centre --phone --supervisor --pin [--out]`. No network. The SQL has the centre with `sample = 0`, the six cited rules and one supervisor hashed exactly as `auth.js` does. File mode 600, quotes doubled, and a bad argument exits 2 without writing. `npm run first-setup -- …` also works. |
| `tests/run.mjs` | New third stage, "setup". After the API suites it frees the port, applies migrations plus the tool's SQL to a fresh D1, and starts the Worker **without** `TEST_MODE` on the same port. Then it runs `tests/api-setup.test.mjs`, stops the Worker and removes the state. The stage is skipped with `--grep`, and skipped with a loud message if the port belonged to a Worker the run did not start. Any failure anywhere, including a Worker that will not start, exits 1. |
| `tests/negative-lib.mjs` | `NEG_PORT` overrides the port (default 7805). |

### Verified, and how it could have failed

`cd worker && npm test` exits 0 with three stages:
- **unit** 31/31;
- **api** 40/40 (the 17 M1 tests plus 23 M2 tests);
- **setup** 1/1.

The unit tests added in M2:
- **`tests/attendance.test.mjs`**:
  - 90 + 75 across midnight.
  - Both DST nights: 300 minutes on fall-back, 180 on spring-forward.
  - A 3-part visit.
  - Open visit; missing, not booked, away and not yet registered.
  - **Property:** 300 seeded visits, 1 minute to 30 hours, over both DST weeks, a third starting at 11 PM. Per child, Σ day parts = Σ (out − in) minutes; no part is negative; every part starts on its own date and ends by that date's local midnight. The test also requires more than 100 of them to cross midnight, so it cannot pass on easy data.
  - Moves labels, CSV cells.
- **`tests/first-setup.test.mjs`**: the SQL shape; the hash verifies with `hashPin` and a wrong PIN does not; no "SAMPLE" and never the PIN; a new salt each run; bad input refused; the CLI exits 2 and writes nothing.

`tests/api-m2.test.mjs` has every test in the M2 list:
- One test per child field.
- People, rooms, staff and absences.
- **Ratios:** infant at 1:4 → 4 infants with 1 staff `at_limit`, then max 3 → row 4, then reset → over, needs 1.
- **Across midnight:** the JSON parts and the two exact CSV rows.
- **A normal day:** 450 minutes, the number the journey test expects.
- **DST fall-back:** 60 + 240 = 300.
- **Open visit:** JSON, CSV row and summary.
- **Missing vs not booked vs away**, including a child who starts later, the 92-day limit and `to` before `from`.
- **Summary CSV:** exact header, 19 rows plus Total, and every numeric column sums to the Total row.
- **CSV:** CRLF, `"Smith, ""Junior"" (SAMPLE)"`, `'=SUM(A1) (SAMPLE)`, a `'-5 …` note guarded and quoted, both filenames.
- **Fix a time:** every refusal, both edits with who, why and the old time, the door and meter after closing, the CSV using 8:45 AM to 4:30 PM, and an overlap refused.
- **Register:** infant and toddler rooms, dob, emergency contact with phone, both signature SVGs, moves both ways, recorded-by, edited.
- **Demo seed:** 15 weekdays with at least 15 children present each and none on weekends, 4 different absence reasons, 1 visit never signed out, a signature waiting, today's meters `at_limit` 3/1, `ok` 4/1, `over` 9 needing 1, and a live note link.

`tests/api-setup.test.mjs`, against the Worker **without** `TEST_MODE`, checks:
- The tool's PIN signs in as supervisor.
- `/api/info` shows the made-up check centre with `sample: false`, and ignores `X-Test-Now`.
- The SAMPLE PIN 4826 is 401.
- The six rules are the cited, unedited numbers; there are no children and no rooms.
- `/api/test/reset` and `/api/test/seed` are 404.

**Negative controls: all 10 red** (`npm run negative`, exit 0). Output is in `worker/tests/negative-control.log`.

| control | break in the copy | red test and what it saw |
|---|---|---|
| (f) `negative:utcday` | `splitVisit` cuts at the next UTC midnight | across midnight: one part with `minutes: 165` where `90` was expected |
| (g) `negative:csvguard` | `cell()` drops the `'` prefix | CSV: the file held `2026-09-14,=SUM(A1) (SAMPLE),…` and `"-5 with the wind chill…"` |
| (h) `negative:ratioedit` | `loadMeters` reads `default_children_per_caregiver` / `default_max_children` | ratios: `['over',3,3,1,'…Needs 1 more staff.']` where `['at_limit',4,4,0,'4 children, 1 staff. At the limit.']` was expected |
| (i) `negative:ratelimit` | `checkPin` no longer calls `recordWrongPin` | PIN guard: `401 !== 429` on the sixth wrong PIN |
| (j) `negative:openvisit` | `splitVisit` ends an open visit at the real clock | open visits: `minutes: 900, open: false` where `0, true` was expected |

The five M1 controls went red again in the same run.

**`NEG_PORT` and exit codes:**
- `NEG_PORT=7806 node tests/negative-csvguard.mjs` ran on 7806 and went red (exit 0).
- With 7806 held by another process, the same control exited **1**. The log shows `REFUSED — something already answers` and `STAYED GREEN`, so a control that cannot run never passes quietly. That one log entry is this deliberate check.
- `npm test` exits 1 on failure: each control's inner run in the log reports `exit 1`.

### Choices made where API.md left room (lead: overrule any)

1. **DONE (lead: new status `upcoming` for booked dates after today; built in M3a).** **Present, missing, children in range.** `present` = the child has any part that date, even a 0-minute one. `missing` is literal: a booked date with no visit and no absence, **future dates included**. The office page may want to grey dates after `today`. Attendance lists every child registered on any date in the range, plus anyone with a part or absence in it, sorted by home room, then name.
2. **CSV Room and notes.** `Room` is the home room. A part that is both continued and continues (a visit over 2 midnights) gets `Continued from the day before; Continues past midnight`.
3. **Absences and sign-ins.** An absence is refused if a visit touches that date (an open visit counts only on its own date). Signing a child in after an absence was recorded is allowed: the day is `present` and the CSV still has the absence row. An unknown `child_id` on POST absences is 400 `field: "child_id"`, not 404, because it is a body field.
4. **Fix a time.**
   - A missing date or time falls back to the stored value; for an open visit's out, the date falls back to the in date.
   - A time in the spring-forward gap is 400.
   - The new times must not overlap another visit of the child, nor cross a room move.
   - Closing an open visit leaves `out_by` null, because nobody picked up on the record. **Accepted by the lead.**
   - `edits[].what` reads `"Out not signed out changed to 4:30 PM Mon Sep 14"` / `"In 9:00 AM Mon Sep 14 changed to 8:45 AM Mon Sep 14"`, and `at_label` is `"Mon Sep 14, 5:00 PM"`.
5. **Register.** Rows are the children with a placement in that room that day, whatever their home room. Moves read from that room's side: `"Went to Toddler room 10:00 AM, back 10:40 AM"` for a child who left and came back, `"Came from Infant room 10:00 AM, left 10:40 AM"` for a visitor.
6. **Rooms and staff.** Closing a room also ends staff presence in it, and making a staff member inactive ends theirs. PIN uniqueness is checked against every staff member, inactive ones included. The last-supervisor guard covers both a role change and going inactive. A staff member's role is read from the staff row on every request, so a role change applies at once.
7. **Initials** use the first letter or digit of each of the first two words. `=SUM(A1) (SAMPLE)` gets `SS`; every SAMPLE name is unchanged.
8. **DONE (lead: don't move Maya; built in M3a, see above).** **Demo seed.** The SAMPLE centre has only 8 pre-schoolers, so Maya S. (2 years 9 months, in the pre-school range) is signed into the toddler room and moved to the preschool room at 8:30. That makes the preschool room 9, over, and leaves the toddler room at 4, ok.
   - The visit never signed out is Finn's, 5 weekdays ago. Its placement ends, so it does not skew today's meters, but the door honestly shows Finn as in until a supervisor fixes it.
   - The waiting signature is Leo's, on the last weekday, recorded by Kevin.
   - Absences: Liam sick, Emma holiday, Sam appointment, Zoe family.
   - Today's times are held to no later than now, and times are drawn from a generator seeded by the date.

### Left undone

- **M3:** the door tablet, waiting for your prompt.
- **No screenshot:** M2 has nothing visible (the office page is dd2's).

## M1 — Worker core — DONE

### What was built

`worker/` is plain JS ESM with no npm dependencies. It uses the `wrangler` on PATH (4.131.1) and runs local only.

| file | what |
|---|---|
| `wrangler.toml` | Name, main, compatibility date, D1 `DB` with the placeholder id and its comment, assets from `../app/public` with `run_worker_first = ["/api/*"]`. No `[vars]`, and never `TEST_MODE`. |
| `migrations/0001_init.sql` | Schema only: centre (single row), ratio_rules, rooms, staff (PIN hash + salt), children, people, visits (both signatures, `in/out_recorded_by`), placements, presence, logs (`voided`), room_activity, note_lines, note_links (`token_hash`), sessions (`token_hash`), pin_attempts, absences, visit_edits. **The SAMPLE centre is written by `POST /api/test/reset` from `src/sample.js`; the migration seeds nothing.** Partial unique indexes allow at most one open visit per child, one open placement per visit and one open presence per staff member, so two taps at once cannot double-sign a child in. |
| `src/index.js` | Router, error envelope, `info`, `signin`, `door/unlock`, `signout`, `test/reset`. |
| `src/http.js` | JSON answers and `ApiError`. |
| `src/clock.js` | Now and client IP. `X-Test-Now` and `X-Test-IP` count only when `TEST_MODE=1`. |
| `src/time.js` | Pure. NL local dates, labels, `localInstant`, `startOfDate`/`endOfDate` (local midnights, DST-safe), `minutesBetween` (floor at both ends), duration and age labels. |
| `src/auth.js` | PBKDF2-SHA-256 (100 000 iterations, per-staff salt), 32-byte base64url tokens stored as SHA-256, the wrong-PIN guard, `requireAccess`. |
| `src/ratio.js` | Pure. The cited defaults and the 7-row meter. |
| `src/signature.js` | Pure. Validation and an SVG built from integers only. |
| `src/notes.js` | Pure. Log labels and validation, nap state, `buildNote`. |
| `src/db.js` | Shared reads and every shape in API.md: child, room, rule, staff, visit, live meters, the day context, the note loader. |
| `src/visits.js` | Sign in and out, door and staff-recorded. Adding a signature to a recorded time. |
| `src/door.js` | `GET /api/door/children`, `GET /api/door/children/:id`. |
| `src/staff.js` | Every staff route, plus parent links and `GET /api/note/:token`. |
| `src/sample.js` | The SAMPLE centre from API.md: 4 staff, 3 rooms, 19 children, 40 people, 6 rules. |

Routes: every route in M1's list, plus two office routes pulled forward (see "Choices" below).

### How it was verified, and how it could have failed

`cd worker && npm test` starts a fresh Worker on 7802 with its own wiped state and `TEST_MODE:1`, then stops it.
Result: **20/20 unit tests, 17/17 API tests pass.**

- **`tests/ratio.test.mjs`** covers every age group at its exact boundaries:
  - 0 children (with 0, 1 and 5 staff) → ok.
  - For every staff count up to `ceil(max/per)+1`: `allowed − 1` → ok, `allowed` → at_limit, `allowed + 1` → row 5 with `needs_staff` 1, or row 4 once past max.
  - 0 staff with 1 child and with `max` children → over with `needs_staff`; `max + 1` with no staff → `needs_staff` null.
  - Past max with 100 staff → row 4.
  - Row 5 needing 2 staff.
  - Per null, max null, both null → unset; 0 children with a null number → ok.
  - Singular and plural labels, the worked examples, and the full example meter from API.md.
- **`tests/time.test.mjs`** covers:
  - Labels.
  - 11:59:59.999 PM vs 12:00 AM NDT.
  - Nov 1 2026: Oct 31 ends 02:30Z, Nov 1 ends 03:30Z, the day is 25 h, the repeated 1:00 AM, and 11 PM → 3 AM is 300 minutes.
  - Mar 8 2026: Mar 7 ends 03:30Z, Mar 8 ends 02:30Z, the day is 23 h, and 2:30 AM does not exist.
  - Minute truncation, plus 500 seeded spans cut at local midnight whose parts add up to the whole.
- **`tests/signature.test.mjs`** covers:
  - A valid scribble; box corners; exactly 20 units across and down.
  - Refused: empty, one point, a dot under 20, out of the box, negative, fraction, string, NaN, odd length, wrong box.
  - Limits: 50 strokes and 4 000 points pass, 51 and 4 001 are refused, and points are counted across strokes.
  - The SVG path matches `^[ML0-9 ]+$`, even for junk input.
- **`tests/api.test.mjs`** has every M1 API test the brief lists. Two notes:
  - The `note_links` table is read through `wrangler d1 execute daycare-day-sheet --local --persist-to $STATE_DIR --json --command "SELECT * FROM note_links"` (`d1()` in `tests/api-helpers.mjs`). The test asserts `token_hash` = SHA-256(token) and that the raw token appears nowhere in the output.
  - A rule is cleared to null through the real `PUT /api/office/ratios/infant`, so no test-only path exists.

**Negative controls.** `npm run negative` runs each on port 7805 against a patched copy in `worker/.negative/`. Output is in `worker/tests/negative-control.log`. **All 5 went red, then the copies were removed.**

| control | break in the copy | red test |
|---|---|---|
| (a) `negative:count` | `db.js` `loadMeters`: `kids.results.slice(0, -1)` (the last child signed in is not counted) | ratio moment |
| (b) `negative:limit` | `ratio.js` row 5: `children >= staff * per` | ratio moment: `['over','Over',3,0,'…Needs 0 more staff.']` where `['at_limit','At the limit',3,0,'3 children, 1 staff. At the limit.']` was expected |
| (c) `negative:pickup` | `visits.js` `signOut` drops `&& person.may_pick_up === 1` | authorized pick-up |
| (d) `negative:expiry` | `staff.js` `makeLink`: expires at UTC midnight (`Date.parse(today) + 1 day`), which is 9:30 PM NDT | the 11:59:59 PM test (link made at 9:00 PM NDT) |
| (e) `negative:expiry-never` | `staff.js` `parentNote`: `if (false)` instead of the `expires_at` check | the next-day 410 test |

A control whose anchor text is no longer in the source exits 2 and says so, rather than passing quietly. The log keeps worker-relative paths only: the library strips the copy's absolute path, and the first run's log was rewritten to match.

**TEST_MODE gating** was checked by hand, not by an automated test. I started a Worker on 7806 without `TEST_MODE`:
- `POST /api/test/reset` → `404 {"error":"There is nothing here.","code":"not_found"}`.
- `GET /api/info` with `X-Test-Now: 2030-01-01T12:00:00Z` → the real clock (`"now":"2026-09-14T11:48:33.556Z"`).
- `GET /theme.css` → 200 from the assets binding.

Every server was stopped afterwards and the state directories removed.

### Choices made where API.md or the brief left room (lead: overrule any)

1. **DONE (lead: the test is right, PLAN.md fixed).** **Brief vs API.md, the ratio moment.** The brief says "Kevin also into the infant room → `at_limit` again". With 4 infants and 2 staff, API.md gives `allowed = min(2×3, 6) = 6`, so row 7 applies: **ok, "4 children, 2 staff. Room for 2 more."** The test asserts the API.md answer. If the lead meant "no longer over", nothing needs changing. If a 6th infant was intended, the test needs two more sign-ins.
2. **DONE (API.md now says `({max_children})`).** **Row 4 label.** The table says `Over the most this room can hold (max).` without braces. I render the number: `"7 children, 2 staff. Over the most this room can hold (6)."` Please confirm or correct the literal.
3. **DONE (lead: fine).** **Two office routes early.** `PUT /api/office/ratios/:age_group` (1–50 / 1–60 or null, `field` names the input, `edited`) backs the unset test. `DELETE /api/office/people/:pid` (sets `active: false`) backs the inactive-person test. Both follow API.md, so they need no test-only path. Also, **every `/api/office/*` path requires a supervisor before routing**, so an educator gets 403 even on M2 routes that don't exist yet.
4. **DONE in M2 (the contract now puts `fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"` on the path; signature.js and its tests changed, `d` still only M, L, digits and spaces).** Originally: **`signature_svg` carries no style**, exactly as API.md shows: `<path d="…"/>`. A bare path fills black, so pages that draw it need `svg path { fill: none; stroke: currentColor; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round }`. This matters for dd2 (office register) and dd1 M3.
5. **Order of refusals on sign-in:** 404 child → 409 `bad_state` (no longer registered) → 409 `already_in` → 403 `not_on_list` → 400 signature. Sign-out: 404 → 409 `not_in` → 403 → 400.
6. **Wording.**
   - A refused pick-up names the person when the id exists (the neighbour, or another child's parent), and says "That person" only for an unknown id.
   - A refused drop-off always says "That person is not on X's list. Get the supervisor."
   - Adding a signature as someone other than the recorded person → 403 `not_on_list` "Only Sarah M. (SAMPLE) can sign for that time. Get the supervisor."
   - Forbidden messages: door token on a staff route "The door tablet cannot open staff pages. Sign in with your own PIN."; staff on a door route "This is for the door tablet only."; office "Only the supervisor can open the office."
7. **The 429 guard.** Five wrong PINs from one IP within 15 minutes (either route counts) → the sixth try and every later one get 429 until the oldest wrong try is 15 minutes old. An educator's right PIN at the door (403) does not count as wrong.
8. **Door list.** Registered children (end date empty or not past), plus anyone still signed in. `room_id`/`room_name` is where the child is placed now, else the home room.
   - Status precedence: in → gone home (signed out today) → away → not booked → not in yet.
   - `awaiting_signature` looks at visits dated in the last 14 dates, today included. If both ends are pending, `"in"` is reported first.
9. **Labels.** `since_label` on staff chips and `in_label` are plain times ("9:00 AM"); pages add "In since". `updated_label` is the time of the latest thing recorded for that note (visit, log, line, activity), falling back to now. `activities` lists only rooms whose line is not empty. A nap with no end shows "Asleep since …".
10. **Nap guard in one statement.** The log INSERT only writes while the visit is open and the last non-voided nap log allows it, so two phones cannot start two naps. Voiding a nap start makes the child awake again.
11. **Reset cost.** PBKDF2 of the four SAMPLE PINs is computed once per isolate and reused across resets. Each staff member still has their own random salt.
12. **`npm run dev`** is migrate + wrangler dev on 7802 **without** `TEST_MODE`. `npm run dev:test` is the same with `--var TEST_MODE:1`, for anyone who needs reset or `X-Test-Now` by hand.

### Left undone (by design at M1)

- **M2:** the rest of the office routes, attendance/CSV/register and `POST /api/test/seed`, with their tests and controls (f)–(j). `visit_edits` exists and the visit shape already renders `edits`, but nothing writes them yet.
- **M3:** the door tablet page and its Playwright suite.
- **No screenshot:** M1 has nothing visible.
- **Not pushed:** the branch has no remote configured, and the lead merges.

### Needs from another slice

- **dd2, and the lead's review:** item 4 (SVG styling). Items 1 and 2 are for the lead to confirm.
- **DONE (lead added the report path to Owns).** **Lead (rig config):** `rig guard --staged` accepted this report ("31 file(s), all inside slice"), but after the commit `rig status` lists `docs/build-report-dd1.md` as OUTSIDE SLICE. The brief says to commit it here, so please add it to dd1's paths in `.rig/config.json`, or say where the report should live.
