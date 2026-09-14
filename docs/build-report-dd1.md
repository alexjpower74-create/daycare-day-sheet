# Build report — dd1 (Worker, D1, ratios, register, notes, attendance; the door tablet)

A record, not a queue. Newest milestone at the top.

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

1. **Brief vs API.md, the ratio moment.** The brief says "Kevin also into the infant room → `at_limit` again". With 4 infants and 2 staff, API.md gives `allowed = min(2×3, 6) = 6`, so row 7 applies: **ok, "4 children, 2 staff. Room for 2 more."** The test asserts the API.md answer. If the lead meant "no longer over", nothing needs changing. If a 6th infant was intended, the test needs two more sign-ins.
2. **Row 4 label.** The table says `Over the most this room can hold (max).` without braces. I render the number: `"7 children, 2 staff. Over the most this room can hold (6)."` Please confirm or correct the literal.
3. **Two office routes early.** `PUT /api/office/ratios/:age_group` (1–50 / 1–60 or null, `field` names the input, `edited`) backs the unset test. `DELETE /api/office/people/:pid` (sets `active: false`) backs the inactive-person test. Both follow API.md, so they need no test-only path. Also, **every `/api/office/*` path requires a supervisor before routing**, so an educator gets 403 even on M2 routes that don't exist yet.
4. **`signature_svg` carries no style**, exactly as API.md shows: `<path d="…"/>`. A bare path fills black, so pages that draw it need `svg path { fill: none; stroke: currentColor; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round }`. This matters for dd2 (office register) and dd1 M3.
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
