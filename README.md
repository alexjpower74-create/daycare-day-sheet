# Daycare Day Sheet

The daily paperwork of a small licensed child care centre in Newfoundland and Labrador: parents sign children in and out on a
door tablet, staff see live staff-to-child ratios per room on their phones, each child gets a daily note home, and the office
gets attendance by day, week or month with a CSV for funding and fee paperwork. Nothing is sent (no email, no SMS).

**Live SAMPLE demo:** <https://daycare-day-sheet.alexjpower74.workers.dev> (Cloudflare Worker + D1, deployed 2026-09-15). PINs below work there too.

## Before a real daycare uses this

**The live copy at <https://daycare-day-sheet.alexjpower74.workers.dev> is a SAMPLE-data demo only.** The centre, children, parents, staff, attendance and signatures on it are
invented; it holds no real people. Do not enter a real child into it.

Before any real centre uses this app with real families, a **privacy notice for parents (and staff) must be written and shown**:
what is collected about each child (name, date of birth, emergency contact, who dropped off and picked up, times, signatures, meals,
naps, diapering, mood, notes), who can see it (room staff, the supervisor, the parent through their daily-note link), how long it is
kept (daily registers 7 years under NLR 39/17 s.45(3), other records 3 years under s.43(2)) and where it lives (Cloudflare D1), under
Newfoundland and Labrador's ATIPPA, 2015 and PHIA, or PIPEDA, as they apply to the operator (public body, not-for-profit or
commercial). This is deferred, not dropped: Alexander decided on 2026-09-15 that the notice is written before real use, not before the
demo.

## Open it (on this computer)

The live demo above is the same app on the same SAMPLE seed; this runs it locally.

```
cd ~/Projects/"Daycare Day Sheet"
npm run demo
```

Then open:

| Screen | Address | PIN |
|---|---|---|
| Start page | <http://127.0.0.1:7801/> | |
| Door tablet | <http://127.0.0.1:7801/door/> | set it up with the supervisor PIN `4826` |
| Room view (staff phone) | <http://127.0.0.1:7801/room/> | `1593` Marie, `2604` Kevin, `3715` Priya (educators), `4826` Dana (supervisor) |
| Office | <http://127.0.0.1:7801/office/> | `4826` |
| A parent's daily note | printed by `npm run demo` (works until midnight) | none |

`npm run demo` keeps its data between runs; `npm run demo -- --fresh` starts again from the SAMPLE seed. It needs Node 22+ and
`wrangler` 4.131+ on the PATH, and runs the Worker with `wrangler dev --local`.

## What is real and what is SAMPLE

- **Real:** the law. 21 rules quoted word for word from the Child Care Act (SNL 2014 c. C-11.01), the Child Care Regulations
  (NLR 39/17) and the Child Care Policy and Standards Manual, each with section, source URL and fetched date in `docs/RULES.md`,
  raw pages in `data/sources/`, and checked by `npm run rules`. The ratio settings ship with the s.54 numbers (1:3 up to 6 infants,
  1:5 up to 10 toddlers, 1:8 up to 16 pre-schoolers, 1:10 up to 20 pre-kindergarten, 1:15 up to 30 school age, 1:7 up to 14
  toddlers with pre-schoolers) and the operator can change them ("your licence may differ").
- **SAMPLE:** everything else. The centre "SAMPLE Little Harbour Child Care (demo)", every child, parent and staff member (names end
  in "(SAMPLE)", avatars are initials, phones are in the fictional 709-555-01xx range), their attendance, and the signatures in the
  seed (generated scribbles). No real people, no photos, no addresses, no health numbers.

## What it does

- **Door tablet:** tap a child's card, Sign in or Sign out, tap who is dropping off or picking up (from that child's list), sign with a
  finger, done; the time is stamped by the server. Pick-up offers only people marked "May pick up"; "Someone else" shows "Not on the
  list. Get the supervisor." and the Worker refuses an unauthorized sign-out even if the page were changed. If a sign-in puts a room
  over ratio, the child is still signed in (the register must tell the truth) and the tablet says to tell the room staff.
- **Room view:** each room's meter goes green / amber at the limit / red over the moment the count changes, with the reason ("Needs 1
  more staff."). One tap for "I'm in this room", quick logs (meals, naps, diapers and toilet, mood, a note), move a child between
  rooms, record a drop-off a parent did not sign.
- **Daily note:** built from the logs; staff add a line and what the room did today; a parent link that stops working at midnight;
  printable. For infants it is titled "Daily record of sleeping, eating and toileting" (NLR 39/17 s.26(3)).
- **Office:** children and their people, rooms and ratios (with citations), staff and PINs, attendance by day / week / month with visits
  cut at local midnight, absences with reasons, fixing a forgotten sign-out with a reason, CSV and summary CSV, and the printable daily
  register per homeroom (s.45).
- **Follow-ups:** the office Today tab lists signatures still owed from the last 14 days (a staff member recorded the time because the
  parent did not sign; Policy ELCD-2017-L2 2(iv)) and visits left open from earlier days. A child who is simply still in the building
  today reads "Still here", never "Not signed out".
- **Corrections without losing the record:** "Fix a time" edits the visit (with a reason, keeping the old times), including an overnight
  visit from either day; a mistaken absence can be removed; visits are never deleted.

## Tests

Final QA, one run pinned to main `8f40b4b` (details and every negative control in `docs/build-report.md`):

| Suite | Passed | Failed | Skipped |
|---|---|---|---|
| Rules: 21 quotes checked word for word against the saved law | 21 | 0 | |
| Worker: unit 32, empty database 1, API 44, first setup without TEST_MODE 1 | 78 | 0 | 0 |
| Playwright: door 34, web 146, journey 2 (chromium + webkit; tablet 1024×768, phone 390, desktop 1280; real taps and signatures) | 182 | 0 | 6 by width |
| Negative controls (break a copy, the check must go red): Worker 14, door 8, web 8, journey 1 | 31 red of 31 | | |

```
npm run rules                                   # 21 quotes against data/sources (self-test first)
cd worker && npm test                           # unit + empty D1 + API against wrangler dev --local + first setup
cd worker && npm run negative                   # Worker negative controls (each must go red)
cd app && npm install && npx playwright install chromium webkit
cd app && E2E_PORT=7809 npx playwright test     # door, room, notes, office, journey
npm run test:e2e:negative                       # door, web and journey negative controls
```

## What deploying needs

Deployed 2026-09-15 as a SAMPLE demo: Worker `daycare-day-sheet` at <https://daycare-day-sheet.alexjpower74.workers.dev>, D1 `daycare-day-sheet`. `docs/DEPLOY.md` has the steps and ids. In short: D1 database `daycare-day-sheet`, Worker `daycare-day-sheet`
(static assets from `app/public`), **no secrets** (PINs are hashes in D1), **no cron**, no R2. The real centre and its first supervisor
come from `worker/tools/first-setup.mjs`. Never set `TEST_MODE`.

Before any real centre uses it (not technical):
- **Finger signatures on the tablet: decided.** Alexander decided on 2026-09-15 to proceed on the basis that an electronic daily
  register with finger signatures is accepted. The Policy and Standards Manual describes a bound, numbered, pen-written register
  (docs/RULES.md R18), so a real centre should still confirm with the Department of Education (Early Learning and Child Care) and can
  print the register per homeroom meanwhile.
- **A privacy notice** for parents and staff (see "Before a real daycare uses this" at the top), and a **PHIA / ATIPPA / PIPEDA
  review** as they apply to the operator.
- **Backups:** daily registers must be kept at least 7 years (s.45(3)); D1 Time Travel covers 30 days, so a regular export is needed.

## Where to pick this up

- `PLAN.md` is the build contract, `docs/API.md` the API, `docs/RULES.md` the law, `DECISIONS.md` every call made overnight.
- `docs/build-report.md` has the QA history and the negative controls; the slices' own reports are `docs/build-report-dd1.md` and
  `docs/build-report-dd2.md`.
- Known gaps: `docs/build-report.md`, "Known gaps".
