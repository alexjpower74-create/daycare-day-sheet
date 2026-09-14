# Daycare Day Sheet

The daily paperwork of a small licensed child care centre in Newfoundland and Labrador: the door tablet where parents sign
children in and out (who, when, signature), the staff phone room view with live staff-to-child ratios per room and quick logs,
the daily note home (parent link that dies at midnight, printable), and the office (children, authorized pickups, rooms,
ratios, staff, attendance, CSV). Overnight build 2026-09-14, lead `dd-lead`, slices `dd1` (Worker + door tablet) and `dd2`
(room view, daily note, office).

Read PLAN.md first (the Rig contract), then docs/API.md (the contract between slices), docs/RULES.md (the cited law), then
DECISIONS.md.

## Stack and ports

- `worker/`: Cloudflare Worker, plain JS ESM, no npm deps, D1 `DB` (`daycare-day-sheet`). Serves `/api/*` and `app/public/`.
- `app/public/`: plain HTML/JS/CSS, no build. `/` start page, `/door/` tablet, `/room/` staff phone, `/note/?t=` parent note,
  `/office/` supervisor.
- `app/tests/`: Playwright 1.63, chromium + webkit, phone 390, tablet 1024×768, desktop 1280, against the real Worker.
  `door/` dd1, `web/` dd2, `journey/` lead.
- Ports (inspector = port + 10, always pass `--inspector-port`; other crews hold 9229):
  dd2 dev 7801 · dd1 Worker 7802 · dd2 e2e 7803 · dd1 door e2e 7804 · dd1 negative copies 7805, 7806 · dd2 negative copy 7807 ·
  lead e2e/journey 7808 · QA 7809. `npm run demo` uses 7801 once the slices are done.
- SAMPLE PINs: supervisor `4826`, educators `1593`, `2604`, `3715`.

## Rules that bite here

- **Local only.** `wrangler dev --local`. No `wrangler deploy`, `secret put`, `d1 create`, `--remote`, Pages or DNS.
- **Nothing is sent.** No email, no SMS. Parent links are "Copy link" and a printable page.
- **SAMPLE people only.** Centre "SAMPLE Little Harbour Child Care (demo)", every child, parent and staff name ends in
  "(SAMPLE)". No real names, no photos (avatars are initials), no health numbers, no birth certificates.
- **The law is cited, never guessed.** Ratio defaults come from docs/RULES.md (NLR 39/17 s.54). A value that cannot be verified
  ships empty and the app asks the operator. Quotes are checked as exact substrings of `data/sources/` by `npm run rules`.
- **The register tells the truth.** A child who arrives is signed in even when that puts a room over ratio; the room turns red at
  once. Sign-out by anyone not authorized for that child is refused by the Worker, not just hidden by the page.
- **Time is the centre's zone** (`America/St_Johns`), from the Worker, never the browser clock. Tests pin it with `X-Test-Now`.
- Own only your slice's paths; `rig guard` enforces it. Verify → commit (own paths) → report.
- Every important check has a negative control that breaks a copy in `.negative/`, goes red, and is recorded.
- Plain English for Newfoundland users. No emoji as icons. No devils or demons.

## Standing rules (every project, read by Claude Code and Codex alike)

CLAUDE.md is a symlink to this file, so Onyx (Claude Code) and Cobalt (Codex) read the same text. Edit AGENTS.md only.

- **Read PLAN.md first where it exists; it is the contract.** Own only your slice's files.
- **What "done" means:** verified, committed (only your own paths, with a message that says what and why), pushed, and shown: a screenshot via `pwshot` for anything visible. Never hand back an empty screen; seed demo data if the UI needs it. Never leave a green step uncommitted.
- **Nothing leaves without Alexander.** Emails, forms, applications, posts, marketplace submissions and pull requests to other people's repos are staged to one click; he presses send.
- **Tests that cannot lie.** A bug that reached a person gets a test that fails without the fix, proved by reverting the fix. Every guard (grep, lint, check) is shown to fail on a known-bad input in the same run: a check that cannot fail measured nothing. Real dependencies over mocks where practical. Hit-test with elementFromPoint, never rects.
- **Public-repo hygiene.** No secrets, no machine names, no home-folder paths, no invented businesses. Real businesses appear only where Alexander chose to show them. Run `check-no-personal-data` before pushing a public repo.
- **Browser work.** Playwright is the default; WebKit check before calling a WKWebView page done; the Chrome extension only for pages that need his real login.
- **Keep this file short:** commands, gotchas with a why, hard rules. Architecture belongs in the code and README.
