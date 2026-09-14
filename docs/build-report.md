# Daycare Day Sheet: build report (dd-lead)

Overnight build 2026-09-14. Lead `dd-lead` (Opus xhigh), slices `dd1` (Worker + door tablet) and `dd2` (room view, notes,
office), both Opus medium, run with Rig in herdr tabs. Local only: nothing deployed, nothing sent, SAMPLE people only.
Every number below was measured in a QA worktree pinned to the sha shown (`rig qa --ref <sha> --port 7809`), never in a
slice's own tree. Pass/fail comes from each command's own exit code, echoed inside the run.

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

## Rules check

`npm run rules`: 21 of 21 rules verified word for word against `data/sources/`; the self-test proves a one-letter change is
caught before the real check runs.

## Lead's own findings

- `rig qa <sha>` pins main unless the sha is passed as `--ref` (reported to Onyx; LEAD-RULES fixed).
- A QA run that writes tracked files (the negative-control log, screenshots) leaves the QA worktree dirty and the next re-pin
  fails; the lead restores the QA worktree after each run.
