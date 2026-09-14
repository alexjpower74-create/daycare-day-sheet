# Build report: dd2 (room view, daily note, office)

A record, not a queue. Items are marked DONE or REJECTED in place.

## M1: pages (2026-09-14)

### What I built — DONE

| path | what |
|---|---|
| `app/public/api.js` | The only route to docs/API.md. Same-origin `fetch('/api/…')`, `ApiError` carries the API's `error`, `code` and `field` unchanged. Staff token in `localStorage` `daycare-day-sheet:staff-token`; a 401 on a staff call forgets it. `?mock=1` (remembered for the tab) answers from the mock instead. |
| `app/public/ui.js` | `h()` (text only, never `innerHTML` from data), inline SVG icons, initials avatar ringed by `--group-<age_group>`, `meterPill` (colour only through `data-state`), `showError` (puts the API text under `[name=<field>]`), `renderIf` (rebuilds a region only when its data changed), `whenIdle` (background re-renders wait while a pointer is down), `poll`, `toast`. |
| `app/public/keypad.js` | Shared PIN keypad: `button.key[data-key]`, "Clear", `#pin-enter` "Enter", `#pin-error` `role="alert"`, dots, physical keys. Key size from CSS `--key-size` (64 px here). |
| `app/public/style.css` | Page styles on top of theme.css. Defines no state colour: room edges, pills and bars read `var(--state)` / `var(--on-state)`. Print rules added on top of theme.css. |
| `app/public/index.html` | Start page: centre + SAMPLE, three link cards (Door tablet, Room view, Office) and the parent-note line. |
| `app/public/room/` | Room view (`index.html`, `room.js`, `session.js` staff sign-in shared with the staff note). |
| `app/public/room/note/` | Staff daily note. |
| `app/public/note/` | Parent note (`note.js`) and `render.js`, the note renderer both note pages share. |
| `app/public/office/index.html` | **Placeholder only**, so the start page link and M2's SAMPLE-badge check have a page. The office is M3. |
| `app/public/room/api.mock.js` | Dev stand-in for the API (see "Deviations"). |
| `app/tests/web/serve.mjs`, `mock-shots.mjs` | Static server on 7801 plus the M1 page check and screenshots against the mock. |
| `app/tests/web/shots/` | 44 screenshots: chromium and webkit × 390 and 1280 × start, staff sign-in, room, room over, child sheet, sheet with toast, record without a signature, staff note, parent note, parent note print, parent note error. |

Room view behaviour, per Design:
- Staff sign in, then a room strip. Each `button.room[data-room][data-state]` card has an `aria-pressed` state, a coloured left edge, a pill, "N children · N staff", and a bar of children against `allowed`.
- The selected room shows its meter `label` in `#room-label` and `#presence` ("I'm in this room" as the primary button, or "I'm leaving this room" as outline). Below that: staff chips, a grid of `button.child[data-child]` cards ("In since…", "Asleep", "Signature needed"), then the "Not in yet" list with "Record without a signature" and the "Away today" list.
- Child sheet `#child-sheet`, full height at 390, bottom sheet at 1280:
  - `button.meal[data-meal]`, preselected from `now_local`
  - every `button.log[data-kind][data-value]`
  - `#note-text` and `#save-note`
  - `button.move[data-room]` with each room's pill
  - `#open-note`
  - Today rows `[data-log]` with `button.undo`
  - `#toast` "Saved: <label>" with Undo
- It polls `GET /api/staff/today` every 5 s and after every write.
- Record without a signature opens `#record-sheet`, which lists the child's people as `button.person[data-person]` and posts `POST /api/staff/children/:id/in`.

Staff note: the note as the parent sees it. Then:
- `#note-line` and `#save-line`
- a `textarea.activity[data-room]` with `button.save-activity` for each room the child was in today
- `#make-link`, then read-only `#note-link`, `#copy-link` (which says "Copied"), and the API's `expires_label`
- `#print`

Parent note: `#note` with `[data-section=meals|sleep|toileting|mood|activities|staff-notes|line]`. When `infant_record` is set, the first three sit under "Daily record of sleeping, eating and toileting". Also `#note-error` (`role="alert"`) and `#print`. It polls every 60 s. A 404 or 410 empties `#note`, shows only the API's text and stops polling. Any other failure keeps the last note and says it could not refresh.

### Decisions inside my slice — DONE

1. **Nothing re-renders under a finger.**
   - A poll rebuilds a region only when its JSON changed, and waits until no pointer is down.
   - An open sheet is never touched by a poll, only by the person's own write in it.
   - The sheet shows no controls until the child's data has loaded.
   - "Daily note" sits **above** Today, not below it as Design lists them. Today grows with every log, so a link under it would slide down. On a fast tap after a log it would land on an "Undo".
2. **(Superseded in the cross-review: page messages no longer float at all, see "Fixed on my side" 3.)** **The toast never covers a control in a sheet.** Inside a sheet, `#toast` goes into a reserved line in the sheet header, where the arrival line normally sits, so it takes no space of its own. Nothing shifts when it appears. The header carries `data-sticky-header`, so `tap()` accounts for it. On the page, the toast is a bar at the bottom and the page has 112 px of bottom padding. Opening a sheet hides a page toast (see bug 1 below).
3. **(Superseded: the lead confirmed bare times, and the guess is removed.)** **`in_label` / `since_label`.** API.md does not say whether `rooms[].children[].in_label` is `"8:05 AM"` or `"In since 8:05 AM"`. The page prefixes "In since " only when the label starts with a digit, so either works. Same for `since_label` with "Since ". Please pin this in API.md.
4. **Activity rooms on the staff note.** The **note** has `activities[].room_name` but no room id, and `PUT /api/staff/rooms/:id/activity` needs one. The page maps names to ids through `GET /api/staff/today` rooms and always adds the child's current room, so a room can be filled in before it has any text. If the Worker leaves rooms with empty text out of `activities`, this still works.
5. **Napping** in the sheet comes from `GET /api/staff/today` (`napping`). It falls back to the order of the nap logs when the child is not in today's rooms.
6. **Keypad for the door (dd1):** `/keypad.js` is importable read-only (usage in its header comment). Whether the door uses it or builds its own is dd1's call; nothing in my pages depends on that.

### Deviations — need the lead

- **The mock lives at `app/public/room/api.mock.js`, not `app/public/api.mock.js`** as the brief says. That path is not in my file list and `rig guard` would refuse it. It loads only when a page is opened with `?mock=1`. Once dd1's Worker is merged I can delete it (M2) unless you want it kept for demos.
- **The office placeholder** (`app/public/office/index.html`) is not the office. It says so on the page.
- **`docs/build-report-dd2.md`** is outside my path list, but PLAN.md names it as my report. `rig guard` accepted it (see the commit).

### Verified, and how it could have failed

There is no Worker on `rig/dd2` yet (dd1 has no commits). **None of this is evidence for the API contract**: M2's specs run against the real Worker. What M1 checks, in `node tests/web/mock-shots.mjs` against the mock on 7801, chromium and webkit at 390 (touch) and 1280 (mouse):

- Every tap hit-tests its centre with `elementFromPoint` first, then a real touch or click. Typing goes through the keyboard.
- Wrong PIN shows "That PIN is not right." in `#pin-error`, then Marie signs in.
- The infant card starts `at_limit`. The preschool card (9 children, 1 staff) shows "Needs 1 more staff." in `#room-label`.
- Breakfast is preselected at 9:00 AM.
- Lunch + "Ate all" shows the toast "Saved: Lunch: ate all". "Ate all" still hit-tests to itself right after the toast appears, and the log is in Today.
- Nap start becomes Nap end; Undo from the toast brings Nap start back.
- A saved note shows in Today.
- Moving Ava to the toddler room changes the toddler count to 4 children and turns the infant card `ok`.
- Record without a signature for Owen puts him in the grid with "Signature needed".
- Staff note: saving a line shows it in the note. Make parent link gives a 43-character token. Copy link says "Copied", and in chromium the clipboard holds the link.
- Parent note: every section is present, the infant record title shows, no `709-555` phone number. Print media hides `#print` and keeps the sections visible. An unknown token shows the 404 text and no section.
- On every page: no sideways scroll, and at 390 every visible button is at least 44 × 44 with the SAMPLE badge visible.
- No console errors, and no request leaves 127.0.0.1.

Result: `PASS chromium-390`, `PASS chromium-1280`, `PASS webkit-390`, `PASS webkit-1280` (exit 0).

**Negative control** (the check has to be able to fail): `NEG=overlay node tests/web/mock-shots.mjs` puts a transparent fixed `div` over "Ate all". All four went red:
```
FAIL chromium-390: tap(Ate all): something else is on top: <div style="position: fixed; left: 16px; top: 282.188px; width: 114px; height: 52px; z-index: 9999; background: transparent;"></div>
FAIL chromium-1280: tap(Ate all): something else is on top: <div style="position: fixed; left: 347px; top: 295.188px; …"></div>
FAIL webkit-390: tap(Ate all): something else is on top: <div style="position: fixed; left: 16px; top: 282.1875px; …"></div>
FAIL webkit-1280: tap(Ate all): something else is on top: <div style="position: fixed; left: 347px; top: 295.1875px; …"></div>
NEGATIVE CONTROL overlay: red as it should be
```
Browser-clock grep: `grep -rnE 'new Date|Date\.now|toLocale' --include='*.js' --include='*.html' app/public`, the mock excluded. It shows 0 matches on the shipped pages, and 1 in the same run with a throwaway `zz-known-bad.js` (`new Date()`) placed under `app/public` (removed afterwards). My first attempt used unquoted `--include=*.js`: zsh expanded it and grep never ran, so it proved nothing and I re-ran it quoted. `innerHTML` appears only in a comment in `ui.js`.

Bugs the check found before commit, each fixed and re-run green:
1. A page toast ("Owen P. (SAMPLE) signed in…") stayed fixed over a sheet opened straight after and covered `#open-note` (chromium-390, webkit-390). Fix: opening a sheet hides the page toast.
2. The toast printed "null" (`replaceChildren` stringifies `null`). Fix: filter.
3. Chromium-390: a tap meant for "Daily note" landed on "Move to Preschool room". The move list and Today filled in after the sheet opened and pushed the link down between the hit-test and the touch. Fix: decision 1 above.
4. At 1280, "Owen P. (SAMPLE)" was squeezed beside "Record without a signature". Fix: the button always takes its own line.

### Left undone at M1 — by design

- Playwright specs (`room`, `note`, `targets`) and negative controls (a)–(d): M2, against the real Worker.
- The office and the register: M3.
- Staff sign-out of a child from the room view (`POST /api/staff/children/:id/out`) is wired in `api.js` but has no button. Design does not ask for one on the room view.

### Needs from other slices

- **dd1:** the Worker, to rebase onto for M2. Please confirm the `in_label` / `since_label` format (decision 3), and whether `note.activities` includes placed rooms with empty text (decision 4).
- **Lead:** the mock path (Deviations), and whether you want `tests/web/mock-shots.mjs` kept after M2 or deleted.

## Cross-review of dd1 M1 (2026-09-14)

Done against `main` at 2d5305d merged into `rig/dd2`. dd1's Worker ran from this worktree on 7801 (`--persist-to .state-7801 --var TEST_MODE:1`). I read nothing in `worker/` beyond one grep to confirm a finding, and edited nothing there.

**Two passes:**
1. **Routes:** `node tests/web/cross-review-dd1-m1.mjs`, 237 checks. It calls every route dd2's pages use and compares shapes (key sets), labels, error `status`/`code`/`field`/text and the error envelope against docs/API.md. Routes: info, signin, signout, staff/today, presence, staff child, every log kind, undo, move, staff-recorded in, room activity, note GET/PUT, note link, parent note, plus the 429 guard.
2. **Pages:** `REAL=1 E2E_PORT=7801 node tests/web/mock-shots.mjs`. The M1 page walk with no `?mock`, with the day set up through the API and every step done with real taps. Chromium and WebKit at 390 and 1280.

**The probe can fail.** Its first run went red with 10 DIFFs. All 10 were my own wrong expectations, not Worker bugs:
- I expected a meal the probe had itself undone.
- I made a parent link with a 9:00 AM token at 9:00 PM, which is a correct 401 under the 12-hour rule, and three link checks failed after it.

I fixed the probe and it now holds those two points explicitly ("staff token after 12 hours → 401").

### Findings about the Worker (report only; for dd1)

| # | what | where | expected (API.md) | got |
|---|---|---|---|---|
| W1 | `signature_svg` has no stroke attributes | `worker/src/signature.js:45`; seen in `GET /api/staff/children/c_ava` `visit.in_signature_svg` after a door sign-in | `<path d="…" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>` (the lead changed API.md in ebd70fa, after dd1's M1) | `<path d="M40 150 L120 60 L200 140 L280 50 L360 150"/>`, which fills black with no page CSS. Blocks my M3 register only if not fixed by then. |
| W2 | Before `POST /api/test/reset`, a migrated but empty D1 answers `GET /api/info` with `centre_name: ""` and `phone: ""` | `/api/info` on a fresh `.state-7801` | Not defined in API.md; a real centre gets its row from `first-setup.mjs` | Not a contract break. My pages were overwriting the SAMPLE name with `""`, which I fixed on my side (below). Lead: perhaps say in API.md what `/api/info` answers before setup. |

Everything else matched API.md exactly, 236 of 237 checks:
- **Shapes:** Child, Meter, Visit, Log, Note, today, presence, move, staff in, link.
- **Labels:** all 16 log labels; the at_limit and over labels; "Needs 1 more staff."; the move message; the nap "12:40 PM to 2:05 PM (1 h 25 min)".
- **Bare times:** `in_label`, `since_label`, `time_label`.
- **`activities`:** only rooms with a line.
- **`infant_record`:** true for Ava, false for Ben.
- **Parent link:** 43 base64url chars; 200 at 11:59:59 PM NDT; 410 with the exact text at 12:00 AM; the exact 404 text.
- **No phones:** none in staff people or in the parent note.
- **Status and error codes:**
  - sign-in and tokens: 401 `field: "pin"`; 429 with the exact text; a door token on a staff route → 403; a signed-out token → 401
  - presence: an educator moving someone else → 403
  - logs: `bad_request` with `value` / `meal` / `text`; `already_napping` and `not_napping`; `not_in`
  - undo: another educator's log → 403, the supervisor's → 200
  - move: same room → 400 `room_id`
  - staff-recorded drop-off: `already_in`; `not_on_list` with the exact text; `in_recorded_by {id, initials}`, `awaiting_signature: "in"`
  - activity or note over 500 characters → 400 `text`
- **Assets:** every page and script is served at 200 through the Worker.

Behaviour worth knowing for M2 (not a finding): a staff token dies 12 hours after sign-in. So any M2 step that moves the clock past that (for example `setNow` to 11:59 PM on a staff page) has to sign in again. The parent page needs no token.

### Fixed on my side — DONE

1. **Time labels** (lead's answer 1): `room.js` now always adds "In since " / "Since ". The guess that worked both ways is gone.
2. **Empty centre name** (W2): the start page, room view, staff note and parent note keep the SAMPLE name unless the API sends a non-empty one.
3. **A toast covered "Make parent link" at 1280 on the real Worker** (the real note is longer than the mock's). The floating page toast is gone. Every page message now goes into a reserved `.status-line` next to the control that caused it:
   - on the room view, `#toast-home` under the room strip
   - on the staff note, a status line in each panel

   Sheets keep their reserved header slot. Nothing floats over a control and nothing shifts when a message appears. Found by the real-Worker walk: `FAIL chromium-1280: tap(Make parent link): something else is on top: <span class="toast-text">Saved: A line from your educator</span>`, and the same in webkit-1280. Re-run green in all four.
4. **The walk's console filter** now ignores the browser's "Failed to load resource" lines, since the wrong-PIN step causes a 401 on purpose. A real failure still fails the walk's own checks.

After the fixes, the walk against the real Worker passes in chromium-390, chromium-1280, webkit-390 and webkit-1280, and the mock walk passes all four too.

## M2: Playwright for the room view and notes (2026-09-14)

Rebased by merging `main` (2d5305d). Every spec runs against dd1's real Worker, started fresh by `tests/start-worker.mjs`. The mock is deleted as the lead asked: `app/public/room/api.mock.js`, the `?mock=1` branch in `api.js`, `tests/web/mock-shots.mjs` and `tests/web/serve.mjs`. The M1 "Deviations" about the mock no longer apply.

### Specs — DONE

Run with `cd app && E2E_PORT=7803 npx playwright test tests/web`. Result: **50 passed, 2 skipped, 0 failed** (2.6 min) across chromium-390, chromium-1280, webkit-390 and webkit-1280. The 2 skips are the tap-size test on the 1280 projects, skipped on purpose: it is a phone check.

**`room.spec.mjs`** (7 tests):
- A wrong PIN shows "That PIN is not right." and `waitForResponse` sees the 401.
- Tapping "I'm in this room" makes the card read "0 children · 1 staff".
- Three infants signed in through the API make the card `at_limit`, checked by `data-state` **and** `stateColour` = `STATE_RGB.at_limit`, and `#room-label` equals the API's label.
- A fourth within one poll (6.5 s) turns it `over` (both checks) with "Needs 1 more staff.".
- "I'm leaving this room" gives exactly "4 children with no staff in the room." and it stays over.
- Moving Ava to the toddler room through the sheet changes both cards: 3 · 0 and 1 · 0, and the toddler card goes over.
- Every quick log, 13 buttons plus a note, by real taps with the clock moved a minute per log. Each shows "Saved: <label>", becomes the newest Today row, and the API labels match exactly.
- The meal chip is Breakfast at 9:00 AM and Lunch at 12:00 PM (`setNow`, then a reload).
- Nap start shows "Asleep" on the card, and Nap end takes it away.
- Undo removes the log from the page and from the API.
- Record without a signature puts Owen in the grid with "Signature needed"; the API visit has `awaiting_signature: "in"` and `in_recorded_by` MT.

**`note.spec.mjs`** (3 tests):
- **Logs to midnight:**
  - Logs entered by taps show in every staff note section.
  - "A line from your educator" and "What we did today" save.
  - Make parent link produces a 43-character token and "Works until midnight tonight.".
  - Copy link says "Copied". In chromium the clipboard is read back and equals the link. In webkit only the read is skipped, with the reason written as an annotation: Playwright's WebKit cannot grant clipboard-read.
  - The link opens in a new **phone** context, and every section matches `GET /api/note/:token` item by item. SAMPLE is visible and no phone number appears.
  - A "Tired" log added on the staff page shows on the parent page after its next poll (the Playwright clock advanced 61 s).
  - It still works at 11:59 PM NDT.
  - At 12:00 AM NDT the next day, the **poll** replaces the note with the API's 410 text in `#note-error`, and so does a reload. No `[data-section]` remains either time.
- **Unknown token:** shows the API's 404 text and no section.
- **Print media:** hides `#print` and every `.no-print` (the test also asserts there is at least one), and every section stays visible.

**`targets.spec.mjs`** (3 tests):
- The SAMPLE badge is visible on `/`, `/room/`, `/room/note/`, `/note/`, `/office/`, with no sideways scroll on any.
- At 390, every visible button and button-link is at least 44 × 44 and hit-tests to itself, after centring it in its scroller. This covers the keypad (all 12 keys), the room view, the child sheet, the staff note with the link made, and the parent note. Contrast is at least 4.5 for Enter, "I'm in this room" (asserted to be the primary style), "Save note" and "Make parent link".
- **Open child sheet:** "Ate all" still hit-tests to itself right after its toast appears, with no scrolling, and a second tap works. Then every one of the sheet's controls (more than 20) is scrolled to the very top of the sheet body, just under the header and its toast line, and still hit-tests to itself there.

### Negative controls — DONE (all 4 red for their intended reason)

`cd app && node tests/web/negative-all.mjs`, or one at a time. `negative-lib.mjs` does the following:
1. Copies `worker/` and `app/public/` into `app/.negative/<name>/` (git-ignored) and breaks the copy only.
2. Runs one test with `--project chromium-390` on E2E_PORT 7807, with `E2E_WORKER_DIR` pointing at the copy.
3. Passes only if that test failed **and** the output names the intended assertion. "Still green", "red for another reason" and "did not run" all count as not proven, and a missing anchor exits 2.
4. Appends to `app/tests/web/negative-control.log` (repo paths replaced by `<repo>`; the log has 0 home paths) and removes the copy.

| control | break in the copy | red output (from the log) |
|---|---|---|
| (a) `negative-card-state.mjs` | `room.js` card: `'data-state': 'ok'` whatever the meter says | `Error: room card data-state at_limit … unexpected value "ok"`. Note: with every state rendered `ok`, the card-state check goes red at its **first** state (at_limit), before it gets to over. The marker accepts any `room card data-state` failure. |
| (b) `negative-over-colour.mjs` | copy's `style.css` + `[data-state="over"] { --state: var(--ok); --on-state: var(--on-ok); }` | The `data-state over` check passed, then `Error: stateColour of the over card: expect(received).toBe(expected)`. So the colour check reads the colour, not the attribute. |
| (c) `negative-expiry-page.mjs` | `note/note.js`: on a 404/410 `return` (keep the note) instead of `showGone` | `Error: #note-error after the poll at midnight … Expected: "This link was for Monday, September 14 and stopped working at midnight. Ask the centre for today's note." Received: ""` |
| (d) `negative-overlay.mjs` | copy's `style.css`: a transparent `.log-grid::after` covering the meal buttons | `Error: tap(Ate all) hit-test at 73,308: something else is on top … Received: "<div class=\"log-grid\">…"` |

### Screenshots — DONE

All 46 in `app/tests/web/shots/` are now from the real Worker, produced by the specs through `shot()`: chromium and webkit × 390 and 1280 × start, room-signin, room, room-over, sheet, sheet-toast, record, staff-note, parent-note, parent-note-print, parent-note-error, plus parent-note-expired at 390. No mock screenshot is left.

### Left for M3 / others

- The office, the register and its specs: M3.
- **W1 (dd1):** `signature_svg` still lacks the contract's stroke attributes. My M3 register will rely on API.md and add no path CSS, so it needs W1 fixed first.
- `tests/web/cross-review-dd1-m1.mjs` is kept as the record of the cross-review. Delete it whenever you like.
- Every server I started is stopped: 7801, 7803, 7807 and their inspector ports are free.

## M3: office and printable register (2026-09-14)

I merged `main` twice: once at the start, then after "Merge dd1 M2" (9ad39dc) and "Merge dd1 contract changes" (31378ea) both landed. Every office, attendance and register spec below ran against those routes on the real Worker. Nothing was mocked.

### dd1's cross-review of my M1 — DONE (each with a test proven red without the fix)

| # | fix | test | red without the fix |
|---|---|---|---|
| 1 | The child sheet reads nap state from the fresh `GET /api/staff/children/:id` when it opens, never from the last poll. On `already_napping` / `not_napping` it redraws from the server and shows the API's text. | `room.spec` "the sheet takes the nap from the server when it opens…". The page's timers are held by Playwright's clock, so the only fresh data is that request. Kevin starts, then ends, the nap through the API. | HEAD's `room.js`: `Error: sheet opened after the other phone started the nap` |
| 2 | Undo shows only on the signed-in educator's own logs, and on every log for the supervisor. | `room.spec` "Undo shows only on your own logs…": Marie sees no Undo on Kevin's log; Dana, on another phone, undoes it, and the API agrees. | HEAD's `room.js`: `Error: no Undo on Kevin's log for Marie` |
| 3 | The staff note builds its "What we did today" boxes from `rooms_today` and prefills them from `activities` by `room_id`. The name-to-id mapping is gone. | `note.spec` "…a box for every room the child was in today, in order". Ava moves infant → toddler → infant with no lines written, and saves one for the toddler room. | HEAD's `staff-note.js`: `Error: one box per room in rooms_today`, expected 2, received 1 |
| 4 | Mock data: already gone in M2. | | |

Each proof was run by swapping in the pre-fix file from HEAD, then restoring the fixed one, confirmed with `cmp`.

### What I built — DONE

- **`/office/`** (`office.js`, `attendance.js`, `dates.js`):
  - Supervisor keypad sign-in. An educator's PIN signs in but shows `#office-refused` "Only the supervisor can open the office." with "Sign out and use another PIN".
  - Tabs `role="tab"`: a left rail at 1280, a scrolling top bar at 390, with arrow keys between tabs.
  - **Today:** counts, room meter cards (`data-state`), "Print the daily register" per room, and lists "Signature needed" and "Not signed out" (the last 14 days before today).
  - **Children:** list rows `[data-child-row]` (No longer registered listed separately); the child form (API field names, errors under the field); people rows `[data-person-row]` with "May pick up" / "Emergency contact" switches (each sends only the changed flag, since the Worker's PUT is partial) and Remove; "Add a person".
  - **Rooms and ratios:** "Your licence may differ." plus the API note; a ratio card per group with `input[name="per-…"]` / `input[name="max-…"]`, `button.save-ratio` / `button.reset-ratio`, a "Not set." row, "Changed from the cited number."; room forms with the age group picker and the s.54(9) line.
  - **Staff:** a form per person (role, active, new PIN) and "Add staff". `pin_taken` shows under the PIN field.
  - **Attendance:** Day / Week / Month, Previous / Next, `#attendance-table` with `[data-cell]`, `[data-total]`, per-date totals, `#attendance-total`, `#attendance-child-days`.
    - Cells: present "7 h 25 min" (a button that opens Fix a time); "Not signed out" + "Fix a time"; "Away: Sick"; missing "No record" (opens Mark away for that child and date); `not_booked` and **`upcoming` are empty cells**, as asked.
    - "Mark away" and "Fix a time" are `<dialog>` forms, with API errors under the field.
    - "Download CSV" / "Download summary CSV" fetch with the token and save the Worker's bytes as a blob, with the Content-Disposition filename.
- **`/office/register/?date=&room=`:** one homeroom in a table: Child, Date of birth, Emergency contact, In and Out (time, by, signature), Moves, Notes ("Recorded by MT, signature needed", "Changed by Dana K. (SAMPLE): …"), and `#kept-note`.
  - **Signatures are rebuilt, not injected:** the Worker's SVG is parsed and only `<path>` elements are copied, when `d` matches `^[ML0-9 ]+$`, with a short list of stroke attributes. The contract's stroke attributes do the drawing, with no path CSS.
  - Print hides the top bar, Back and Print.
- **`dates.js`:** calendar arithmetic in integers (days since 1970), with no `Date` object, so no browser clock or zone reaches the office. "Today" comes from `/api/info`.

### Specs — DONE

`cd app && E2E_PORT=7803 npx playwright test tests/web`: **102 passed, 2 skipped, 0 failed** (4.5 min) across chromium-390, chromium-1280, webkit-390 and webkit-1280. The skips are the phone-only tap sweep on the 1280 projects, as in M2.

- **`office.spec.mjs`** (5):
  - The educator refusal.
  - Today counts, meters with `stateColour`, and 3 register links.
  - Add a child and a person with May pick up off; `GET /api/door/children/:id` lists them with `may_pick_up: false`; tapping the switch makes it `true`.
  - **The ratio test:**
    - Infant set to 1:4 and saved; after a reload the form shows 4.
    - A second phone context's room view card is `at_limit` with 4 infants and 1 staff.
    - Clearing the number shows "Not set." and the Today card is `unset` / "Not set".
    - "Back to the cited number" gives 3 and 6, and the API shows `edited: false`.
  - Add staff with PIN 1593: the API's `pin_taken` text sits under the PIN field, and nothing is added.
- **`attendance.spec.mjs`** (4). The day is set up through the API with `X-Test-Now`: Liam 8 AM to 4 PM Monday, Ava 10:30 PM Mon to 1:15 AM Tue, Nora never signed out, Jack away on holiday. The page runs at Wed noon.
  - **Week view:** Ava's Sep 14 cell shows "1 h 30 min" and Sep 15 "1 h 15 min"; `[data-total="c_ava"]` and `#attendance-total` equal the API's minutes formatted.
  - **Other cells:** Liam "8 h"; "Away: Holiday"; missing "No record"; upcoming and not booked empty (the API statuses are checked too).
  - **Fix a time:** "Not signed out", then saving without a reason shows the API's reason error under the field; with a reason the cell reads "8 h" and the API has 480 minutes, `open: false`.
  - **Mark away:** Owen, sick, shows "Away: Sick", and the API has the absence with its note.
  - **Downloads:** both CSVs by a real tap equal `request.fetch` of the same URL byte for byte (`Buffer.compare`), with the exact filenames. This passes in WebKit too.
- **`register.spec.mjs`** (1). Set up: Ava door-signed in and out, moved to Toddler 10:00 and back 10:40; Liam recorded by Marie; Nora's time fixed by Dana. From Today → "Print the daily register":
  - Each API row's signed ends appear as drawn `svg.signature path` elements whose `d` equals the Worker's path.
  - The moves line reads "Went to Toddler room 10:00 AM, back 10:40 AM", with "Recorded by MT, signature needed" and "Changed by Dana K. (SAMPLE): …" in the notes, and `#kept-note` equal to the API's note.
  - Print media hides the navigation and keeps the table.

### Negative controls — DONE (6 of 6 red as intended)

(a)–(d) are unchanged from M2. New:

| control | break in the copy | red output |
|---|---|---|
| (e) `negative-attendance-day.mjs` | `office/attendance.js`: a present day made only of the part after midnight (`every(p => p.continued)`) renders nothing | `Error: Ava Sep 15 cell · Expected: "1 h 15 min" · Received: ""` |
| (f) `negative-ratio-reload.mjs` | `office/office.js`: the per-caregiver input shows `rule.default_children_per_caregiver` | `Error: ratio form after reload · Expected: "4" · Received: "3"` |

`negative-all.mjs` now runs all six. `app/tests/web/negative-control.log` has 0 home paths.

### Screenshots — DONE

`app/tests/web/shots/` holds every screen at 390 and 1280 in chromium and webkit, all from the real Worker: start, room-signin, room, room-over, sheet, sheet-toast, record, staff-note, parent-note, parent-note-print, parent-note-error, office-refused, office-today, office-children, office-rooms, office-staff, office-attendance, register, register-print, plus parent-note-expired at 390.

### Left / notes

- **Office tap sizes:** at 390 the office uses the same 44 px buttons, but the M2 targets sweep covers only the room view and notes. I added no office sweep, because M3's brief does not ask for one.
- **Today's lists:** "Signature needed" on Today lists children signed in now with a pending signature (what `GET /api/staff/today` gives). A pending signature from a child who has gone home shows at the door, not here. Lead: say if Today should read the 14-day door list instead.
- **Servers:** every server I started is stopped; 7801, 7803, 7807 and their inspector ports are free.

## M3 follow-up round (2026-09-14)

I merged `main` first (9b670b5: `GET /api/office/follow-ups` in API.md). Today's "Signature needed" / "Not signed out" stay as they are until you say that route is on main.

### (2) Tap targets in the office and the register — DONE (3659f03)

`targets.spec` has two new tests:
- **Office, at 390 and 1280:** on the demo seed, every office tab; on each tab, every visible button and button-link, plus every `label.switch`; and every button in the Mark away and Fix a time dialogs. Each must be at least 44 × 44 and hit-test to itself, with no sideways scroll on any tab.
- **Register, at 1280:** its two buttons (Office and Print).

When the page scrolls sideways, the check now names the elements that stick out, measured in page coordinates.

It found two real bugs, both red before the fix:
1. **At 390 the tab bar slid under the header** (chromium-390): `Error: tap(tab Children) hit-test at 149,25: something else is on top … <span class="centre-name">…`. The bar was `position: sticky; top: 0`, so once the page scrolled it sat under the sticky topbar, where no tab could be tapped. **Fix:** the tab bar scrolls with the page on phones; the 1280 rail stays sticky below the header.
2. **In WebKit, Rooms and ratios scrolled sideways** (`Received: 141` at 390, `5` at 1280). No element's box stuck out. A throwaway probe hid element types one at a time: switches 141, number inputs 141, **selects 0**. WebKit lays a `<select>` out as wide as its longest option, here the cited age group labels. **Fix:** options carry the short group name ("Pre-school"), and the full cited label and citation show under the picker.

Two CSS guesses made along the way (`min-width: 0` on grid children, and pinning `.aurora` to the viewport) changed nothing in the probe, so I removed them before committing. The sweep is green without them.

After the fixes, the office and register sweeps pass in chromium-390, chromium-1280, webkit-390 and webkit-1280.

### Empty centre name — DONE (this commit)

- **Fix:**
  - Every page now starts with an empty `#centre-name` and a hidden SAMPLE badge.
  - `ui.js` `applyCentre(source)` sets the name to exactly `centre_name` and shows the badge only when `sample === true`. It's used by the start page, the room view, both notes, the office and the register.
  - `<title>`s no longer carry the SAMPLE name, and no `Little Harbour` string is left in `app/public`.
- **Test** (`centre-name.spec.mjs`):
  - **Before setup** (chromium-390 and webkit-390): a second real Worker on 7801, migrated and never reset, so there is truly no centre row (`/api/info` answers `centre_name: ""`). On `/`, `/room/`, `/room/note/`, `/note/` and `/office/`, `#centre-name` is empty after `/api/info` answers, no page text or title contains "Little Harbour", and the badge count follows `sample`.
  - **After setup** (all four projects): the name equals `/api/info`'s `centre_name` and the badge shows.
- **Proof against the old fallback:** with HEAD's twelve page files swapped in, the before-setup test goes red in both engines: `Error: /: centre name · Expected: "" · Received: "SAMPLE Little Harbour Child Care (demo)"`. With the fix it's green. The restored files were checked with `cmp`.

### Suite

`E2E_PORT=7803 npx playwright test tests/web`: **114 passed, 6 skipped, 0 failed** (5.4 min), chromium and webkit at 390 and 1280. All six skips are deliberate:
- the phone tap sweep at 1280 (2)
- the register sweep at 390 (2)
- the second-Worker test at 1280 (2)

### Needs the lead

- **`sample` before setup:** before any centre row exists, dd1's Worker answers `sample: true` (`worker/src/index.js:118`: `sample: centre ? centre.sample === 1 : true`). API.md only says `centre_name` and `phone` are `""`. So on a real deployment before first setup, the pages show a SAMPLE badge with no name. My pages follow the API as you asked. If the badge should be off before setup, that's a Worker change plus a line in API.md, and my test follows `sample` automatically.
- **The aurora in `theme.css`:** it was not the cause of the sideways scroll (the probe cleared that), so nothing is needed there.

Every server I started is stopped: 7801, 7803 and their inspector ports are free, and the before-setup D1 state is removed.

## Next round (2026-09-14)

I merged `main` first (fc8f63f: `sample` is `false` before the centre row exists; my pages already follow the flag). I merged again after "Merge dd1 M4" (89d8666) landed.

### 1. No browser dialog on the register — DONE (5048408)

`register.js` never called `window.alert`. Its two problem paths (plus the load error) went through a local helper **named** `alert`, which wrote an on-page message. The name shadowed `window.alert` and read like a browser dialog, and no test held the behaviour.
- **Change:** the helper is now `showProblem()`, writing `#register-error` with `role="alert"`.
- **Specs:** `register.spec` has two new tests, each failing if any browser dialog opens:
  - with no room → the on-page message
  - with an unknown room (`r_nowhere`) → the load error, which is the API's own error text
  - with an educator's token → "Only the supervisor can open the office."
- **Proof:** a copy whose `showProblem` calls `window.alert` goes red in chromium-390 and webkit-390 (`#register-error`: element not found). With the fix, register.spec is 12 of 12. A grep finds no `alert(`, `confirm(` or `prompt(` call in `app/public`.

### 2. Today follow-ups from `GET /api/office/follow-ups` — DONE (c65f96c)

- **Lists:** "Signature needed" lists `pending_signatures` (the last 14 days, whether or not the child is here). "Not signed out" lists `not_signed_out` (visits left open from earlier days). Dates are the API's `date_label` ("Thu Sep 10") and times its labels; no ISO date is shown.
- **Fix a time:** each not-signed-out row has "Fix a time", which opens a small dialog (`attendance.js` `openFixVisit`: sign-out date and time, and why). It calls `PUT /api/office/visits/:id`, then re-reads Today, so the fixed visit leaves the list.
- **Spec** (`office.spec`, "Today follows up from the API…"), set up through the API:
  - Ava signed in on Thu Sep 10 and never signed out.
  - On Fri Sep 11 Marie records Liam's drop-off without a signature, and he goes home at 4:00 PM, so he is not in the building on Mon Sep 14 (asserted).
  - On the page: Liam is listed with "Drop-off Fri Sep 11, 8:00 AM"; Ava shows "Thu Sep 10, in at 9:00 AM"; the Today panel's text has no `YYYY-MM-DD`.
  - "Fix a time" with 5:00 PM and a reason removes Ava's row and says "Time fixed.". The API then has no `not_signed_out`, and Liam's signature is still pending.
- **Proof:** with HEAD's Today (built from attendance and today's rooms), the test goes red in chromium-390 and webkit-1280: `a pending signature for a child who went home … element(s) not found`. With the fix, office.spec is 24 of 24.

### 3. Still here — DONE (this commit)

"Merge dd1 still here" (005f605) landed as I committed item 2, so I merged `main` again and built it in this round. The WAITING note I wrote first is replaced here.
- **Attendance:** a day with `still_here: true` (an open visit dated today) shows a green "Still here" chip, with no "Not signed out" flag and no "Fix a time". An open visit from an earlier day keeps the flag and "Fix a time". The table footnote says so.
- **Register:** `/api/office/register` has no `still_here` field, so the page compares the register's `date` with `/api/info` `today`. A visit with no `out_at` reads "Still here" on today's register and "Not signed out" on an earlier date's (API.md).
- **Specs:**
  - `attendance.spec`: Emma is signed in at 8:30 AM today, Wed Sep 16. The API has `still_here: true`; her cell reads exactly "Still here" with no `.fix-time`. Nora's open visit from Tue Sep 15 still reads "Not signed out" with one "Fix a time".
  - `register.spec`: Liam, open today, reads "Still here" on the Sep 14 register. Owen, open since Fri Sep 11, reads "Not signed out" on the Sep 11 register.
- **Negative control (g)** `negative-still-here.mjs`: the copy's attendance page ignores `still_here` (`if (false)`) and flags today's open visit. Red as intended: `Error: today's open visit reads Still here · Expected: "Still here" · Received: "Not signed outFix a time"`. `negative-all.mjs` now runs (a)–(g).
- **Register proof:** with HEAD's `register.js`, the register test goes red in chromium-390 and webkit-1280: `today: open visit reads Still here · Expected: "Still here" · Received: "Not signed out"`. With the change, attendance.spec plus register.spec are 36 of 36.
- **Knock-on in the office tap-target sweep:** its last step opened "Fix a time" from the first one in the demo day's current week. Those were today's open visits, which now correctly have no Fix a time, so all four projects failed with `element(s) not found` in the first full run. The sweep now goes to the previous week and opens the dialog from a past visit that can be fixed.

### Suite

After item 2: **126 passed, 6 skipped, 0 failed**. After item 3: **134 passed, 6 skipped, 0 failed** in chromium and webkit at 390 and 1280. The skips are the same deliberate ones as last round. Negative controls (a)–(g): 7 of 7 red as intended. Every server I started is stopped.

## Cross-review of dd1 door (2026-09-14, read only)

Read at `main` merged into rig/dd2 (bd82cd9): `app/public/door/door.js`, `door-api.js`, `pad.js` and `index.html`, against docs/API.md. I edited none of dd1's files. I did not run dd1's door suite (QA runs it). Each finding below comes with a test that would fail today.

**Routes, bodies and core handling are right.** `door-api.js:52-63`:
- unlock `{ pin }` without a token; children and child with the token
- in and out `{ person_id, signature }`
- sign `{ which, person_id, signature }` on `/api/door/visits/:id/sign`

A 401 forgets the token (`door-api.js:45`) and every caller goes back to "Set up this tablet" (`door.js:39`, `:149`, `:344`). The API's `error` text is shown as it is, in a `role="alert"` line on the sheet (`door.js:226`, `:345`), so the 403 `not_on_list` pick-up text ("… Do not let Ava M. (SAMPLE) leave.") reaches the parent word for word. The rest also matches the contract:
- sign out is offered only when `status === 'in'` (`:262`)
- the pick-up list keeps only `may_pick_up` people (`:284`)
- the card chip reads the list's boolean `awaiting_signature` (`:107`), and the sheet uses the detail's `pending` with the API's labels (`:268-277`)
- the pad keeps integers in 600 × 200, drops one-point strokes, caps 50 strokes and 4 000 points, and needs a 20-unit span (`pad.js:19`, `:54`, `:64`, `:71`)
- the over banner comes from `meter.state` (`door.js:371`)
- the idle timer is 45 s and the confirmation closes after 6 s

### Findings

1. **After a 409 the sheet keeps offering the same refused write** (medium).
   - Where: `door.js:343-347`. On any error other than 401, the page shows the text and re-enables Done on the pad step.
   - Expected: `already_in`, `not_in` and `bad_state` mean the child changed on another device (another tablet, or staff recording on a phone). The sheet should re-read `GET /api/door/children/:id` and go back to its first step with the API's text, so Sign in turns into Sign out.
   - Got: every retry sends the same write and gets the same 409, until Back or the 45-second idle.
   - Test that fails: open Ava's sheet while she is "Not in yet", sign her in through the API, then on the tablet tap Sign in → a person → draw → Done. Expect the API's "already signed in" text in `role="alert"` **and** `#action-out` visible without closing the sheet. Today `#action-out` never appears.
2. **A guessed centre name and SAMPLE badge before `/api/info` answers** (contract, the same rule the lead had dd2 fix).
   - Where: `door/index.html:6` (title) and `:13-14` hard-code "SAMPLE Little Harbour Child Care (demo)" with the badge visible. `door.js:48-49` overwrites them only after `/api/info` succeeds, and hides the badge only when `sample === false`. `door.js:174` in the sheet shows the badge when `info` is still null.
   - Expected (API.md): the name is exactly `centre_name` (empty before setup), and the badge shows only when `sample` is `true`.
   - Got: with `/api/info` failing, or before it loads, the tablet shows the SAMPLE name and badge. The title always does.
   - Test that fails: route `/api/info` to a 500 (or use a second Worker with no centre row, as in dd2's `centre-name.spec`), open `/door/`, and expect `#centre-name` to be `""`, no visible `.sample-badge`, and no "Little Harbour" in the title.
3. **A failed `/api/info` also stops the child grid from updating** (low).
   - Where: `door.js:32` fetches `info` and `children` together in one `Promise.all`, so an info failure throws away a good children answer and shows the offline line.
   - Expected: the grid still refreshes from `GET /api/door/children`; only the date and clock lines wait for info.
   - Test that fails: open `/door/` set up, route `/api/info` to 500, sign Ava in through the API, wait one poll (15 s, advanced with `page.clock`), and expect Ava's card `data-status="in"`. Today it stays "not_in_yet".

Nothing else in these files breaks against the contract as written.

## Last round: items 5–7 (2026-09-14)

I merged `main` first (bd82cd9). dd1's office cross-review had 7 findings. I had already fixed 1–3. dd1 fixed 4 on the Worker, so the page needs no change. 5–7 are below, each committed separately and each shown red without its change.

### 5. Fix a time on an overnight visit — DONE (2fdd994)

- **The bug** (`office/attendance.js`): the dialog pre-filled `in_date` and `out_date` with the cell's date. From Sep 15's "Continued from the day before" cell, a new in time was sent as Sep 15 and refused.
- **The fix:** each end's date now comes from the part's own label. A label names the other date when that end is not on the cell's date ("10:30 PM Sep 14"), and the year comes from the cell, with a December/January crossing handled. Choosing another part in the dialog updates both dates.
- **Spec** (`attendance.spec`): Ava is in from 10:30 PM Sep 14 to 1:15 AM Sep 15. Fix a time from the Sep 15 cell pre-fills 2026-09-14 and 2026-09-15; the in time is fixed to 22:00. The PUT answers 200 with `date` 2026-09-14 and `in_at` 10:00 PM Sep 14, and the Sep 14 cell reads "2 h".
- **Negative control (h)** `negative-overnight-fix.mjs`: the copy pre-fills the cell's date. Red as intended: `the visit's own sign-in date · Expected "2026-09-14" · Received "2026-09-15"`.
  - My first run named the later 200 check as the intended failure. The copy was caught one check earlier, at the pre-fill, so the script ruled "RED but not for the intended reason".
  - The marker now names the pre-fill check. Both runs are in `negative-control.log`.

### 6. Remove a mistaken absence — DONE (ed58dc7)

- **The change:** the away chip gets Remove (`DELETE /api/office/absences/:id` through `api.removeAbsence`). The table re-reads, and the status line says "Removed: away (Sick)."
- **Spec:** mark Owen away (sick), Remove. The cell reads "No record" with no away chip, and the API day is `missing` with `absence: null`. The two older checks now read the chip, since the cell also holds Remove.
- **Proof:** red against HEAD's `attendance.js` in chromium-390 and webkit-1280 (no Remove button).

### 7. A failed `/api/info` no longer leaves Attendance on "Loading…" — DONE (ac5a600)

- **The change** (`office.js`): the failure is now kept. Attendance reads `/api/info` again first, and if that fails too it shows the API's error in `#attendance-status` (`role="alert"`) with "Try again".
- **Spec** (`office.spec`): `/api/info` routed to a 500 shows the message, and "Loading…" is gone. Unrouted, Try again reaches the table.
- **Proof:** red against HEAD's `office.js` in chromium-390 and webkit-1280 (the message is never shown).

### Suite

`E2E_PORT=7803 npx playwright test tests/web`: **146 passed, 6 skipped, 0 failed** in chromium and webkit at 390 and 1280. The skips are the same deliberate ones as before.
- **Negative controls:** (h) is new this round and red as intended. (a)–(g) are unchanged since they were last shown red, and `negative-all.mjs` runs all eight.
- **Door cross-review:** the section above this one.
- **Servers:** every server I started is stopped.

### A guard refusal during the final commits — explained, and passing after the merge

While committing items 6 and 7 and this report, `rig guard --agent dd2` printed REFUSED. It listed PLAN.md, dd1's and the lead's reports, and `worker/src` and `worker/tests` files. My script showed only the guard's last line and did not stop on its exit code, so the commits went ahead. None of those files was in them.
- **Per commit** (`git show --name-only`): 2fdd994, ed58dc7, ac5a600 and bdc7211 touch only `app/public/office/*`, `app/tests/web/*` and this report.
- **The cause:** main had moved past my last merge (the lead merged round 5 as 14be111). The branch then had two merge bases (6211efc and d75a86f), and the comparison with main counted the other slices' files that came in through that merge.
- **After `git merge main`** (9101c07): one merge base, guard `ok dd2: 13 file(s), all inside slice (vs main)` with exit 0, and no path outside dd2's in `git diff main...HEAD`.
- **Lesson for my scripts:** check the guard's exit code before committing, not just its last line.
