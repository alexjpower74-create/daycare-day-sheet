# Deploying Daycare Day Sheet

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

## What exists (deployed 2026-09-15, Alexander's go)

| Thing | Value |
|---|---|
| Worker | `daycare-day-sheet` at <https://daycare-day-sheet.alexjpower74.workers.dev> (serves `/api/*` and `app/public/`) |
| D1 database | `daycare-day-sheet`, id `92b5632b-3b9f-4825-bb61-0f0ea4f81cd3`, region ENAM, migration `0001_init.sql` applied `--remote` |
| Data | the SAMPLE demo seed (`seedDemo`, generated locally on a `wrangler dev --local` server with `TEST_MODE=1`, dumped to SQL, loaded with `wrangler d1 execute --remote`). `TEST_MODE` was never set on the live Worker; `POST /api/test/reset` answers 404 there. |
| Secrets, cron, R2, KV, custom domain | none |

The seed is dated to the day it was loaded (2026-09-15). Older days show as history and follow-ups; to refresh the demo, repeat
the seed steps above (reset locally, dump, `d1 execute --remote`). A real centre never uses this seed; it follows the checklist below.

The checklist below is for the day a real centre wants it, after Alexander has reviewed the app **and the centre has the answers in
"Before any real centre" below**.

## What gets created

| Thing | Name | Notes |
|---|---|---|
| D1 database | `daycare-day-sheet` | `wrangler d1 create daycare-day-sheet`, then put its id in `worker/wrangler.toml` (the zeros placeholder). One database per centre. |
| Worker | `daycare-day-sheet` | Serves `/api/*` and the pages in `app/public/` (static assets). |
| Secrets | none | PINs are PBKDF2 hashes in D1. Parent-link and session tokens are stored as SHA-256 only. |
| Cron | none | Parent links stop working by a time check at midnight; nothing needs a schedule. |
| R2 / KV | none | No photos, no files. |
| Domain | the centre's choice | e.g. a sub-domain the centre controls. HTTPS only (Cloudflare default). |

## Steps (in order)

1. `cd worker && wrangler d1 create daycare-day-sheet` → copy the `database_id` into `wrangler.toml`.
2. `wrangler d1 migrations apply daycare-day-sheet --remote` (deploy does **not** migrate).
3. Make the real centre and its first supervisor, on this computer, no network:
   `node tools/first-setup.mjs --centre "<centre name>" --phone "<709 number>" --supervisor "<name>" --pin <4–6 digits>`
   → `worker/first-setup.sql` (git-ignored, holds a PIN hash; delete it after step 4).
4. `wrangler d1 execute daycare-day-sheet --remote --file first-setup.sql`
5. `wrangler deploy` from `worker/`.
6. Smoke test: open `/api/info` (the real name, `sample: false`); `POST /api/test/reset` must answer **404**; sign in to
   `/office/` with the supervisor PIN; add rooms, check the ratio numbers against the centre's licence, add staff and children.
7. Set up the door tablet with the supervisor PIN.

## Never

- **Never set `TEST_MODE`** (in `[vars]`, the dashboard, or `--var`). It turns on `X-Test-Now` (anyone could move the clock and
  revive an expired parent link) and the reset/seed routes (anyone could wipe the register).
- Never use the SAMPLE PINs (4826, 1593, 2604, 3715) or the SAMPLE seed on a real deployment.
- Never import real children into a demo copy.

## Before any real centre (these are not technical)

- **Finger signatures: decided.** Alexander decided on 2026-09-15 to proceed on the basis that an electronic daily register with
  finger signatures is accepted. The Policy and Standards Manual still describes a bound, pen-written register (ELCD-2017-L2 1; see
  docs/RULES.md R18), so a centre should confirm with the Department of Education (Early Learning and Child Care) and can keep the
  printed register per homeroom as a copy meanwhile.
- **Privacy (must be done before real use; see the top of this file):** a privacy notice for parents and staff; a review under PHIA
  (the Personal Health Information Act), ATIPPA, 2015 and PIPEDA as they apply to the operator (public body, not-for-profit or
  commercial); who may see what; how a parent asks for a copy (Child Care Act s.28).
- **Backups and retention:** daily registers must be kept at least 7 years (NLR 39/17 s.45(3)); other records 3 years (s.43(2)).
  D1 Time Travel covers 30 days only, so schedule a regular export (`wrangler d1 export --remote`) to storage the centre controls,
  and test a restore.
- **Access:** unique PINs per staff member, change them when someone leaves; the door tablet is locked to the door routes; the
  office is the supervisor's only.
- **Where the data lives:** Cloudflare D1 location hint (`--location`) if the centre needs data kept in a particular region.
