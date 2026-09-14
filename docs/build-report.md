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

## Rules check

`npm run rules`: 21 of 21 rules verified word for word against `data/sources/`; the self-test proves a one-letter change is
caught before the real check runs.

## Lead's own findings

- `rig qa <sha>` pins main unless the sha is passed as `--ref` (reported to Onyx; LEAD-RULES fixed).
- A QA run that writes tracked files (the negative-control log, screenshots) leaves the QA worktree dirty and the next re-pin
  fails; the lead restores the QA worktree after each run.
