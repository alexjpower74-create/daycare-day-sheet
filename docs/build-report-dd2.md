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
2. **The toast never covers a control in a sheet.** Inside a sheet, `#toast` goes into a reserved line in the sheet header, where the arrival line normally sits, so it takes no space of its own. Nothing shifts when it appears. The header carries `data-sticky-header`, so `tap()` accounts for it. On the page, the toast is a bar at the bottom and the page has 112 px of bottom padding. Opening a sheet hides a page toast (see bug 1 below).
3. **`in_label` / `since_label`.** API.md does not say whether `rooms[].children[].in_label` is `"8:05 AM"` or `"In since 8:05 AM"`. The page prefixes "In since " only when the label starts with a digit, so either works. Same for `since_label` with "Since ". Please pin this in API.md.
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
