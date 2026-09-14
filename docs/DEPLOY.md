# Deploying Daycare Day Sheet (not done; Alexander decides)

Nothing here has been run. The build is local only (`wrangler dev --local`). This is the list for the day a real centre
wants it, after Alexander has reviewed the app **and the centre has the answers in "Before any real centre" below**.

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

- **Ask the Department of Education (Early Learning and Child Care)** whether an electronic daily register with finger signatures
  is accepted in place of the bound, pen-written register the Policy and Standards Manual describes (ELCD-2017-L2 1; see
  docs/RULES.md R18 and "Unknown"). Until they say yes, the centre keeps the paper register and uses the printed one as a copy.
- **Privacy:** a privacy notice for parents and staff; a review under PHIA (the Personal Health Information Act) and ATIPPA as they
  apply to the operator (not-for-profit or commercial); who may see what; how a parent asks for a copy (Child Care Act s.28).
- **Backups and retention:** daily registers must be kept at least 7 years (NLR 39/17 s.45(3)); other records 3 years (s.43(2)).
  D1 Time Travel covers 30 days only, so schedule a regular export (`wrangler d1 export --remote`) to storage the centre controls,
  and test a restore.
- **Access:** unique PINs per staff member, change them when someone leaves; the door tablet is locked to the door routes; the
  office is the supervisor's only.
- **Where the data lives:** Cloudflare D1 location hint (`--location`) if the centre needs data kept in a particular region.
