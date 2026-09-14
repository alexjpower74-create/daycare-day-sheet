# Daycare Day Sheet: decisions

Alexander was asleep; the lead (dd-lead) made these calls so the build could keep moving. Each one is easy to reverse.
Newest at the bottom.

1. **Two slices, split by the sides of the sign-in/out contract.** dd1 = the Worker **and** the door tablet (the "not on the list"
   rule lives on both sides of one API call); dd2 = the room view, the daily note (staff and parent) and the office. The lead owns
   the shared test scaffolding, the design tokens, docs/RULES.md and its checker, and writes the cross-slice journey spec.
2. **Ratio defaults are the cited numbers from NLR 39/17 s.54** (1:3/6, 1:5/10, 1:8/16, 1:10/20, 1:15/30, and 1:7/14 for toddlers
   with pre-schoolers under s.54(10)). All six were verified word for word, so none ships empty. The operator can change or clear
   them ("your licence may differ"); a cleared number makes the meter say "Not set", never a guess. Other mixed rooms pick the
   youngest child's group (s.54(9)) rather than the app computing ages.
3. **The register never refuses a child who is really there.** A sign-in or a move that puts a room over ratio is recorded and the
   room turns red at once. A register that leaves out a present child is worse than a red meter (fire drills and evacuations count
   from it; Policy ELCD-2017-L2 3 says it must reflect the number present at all times).
4. **Signatures are finger signatures on the tablet.** s.45(2)(d) asks for the signature of the person dropping off and picking up.
   "No typing" is kept: the parent taps a card, taps their own name, signs, taps Done. Stored as integer strokes, drawn back as SVG.
5. **Drop-off: anyone on the child's list. Pick-up: only people marked "May pick up".** "Someone else" shows "Not on the list. Get
   the supervisor." The tablet has no override button (one tap past the rule would be the hole); the supervisor adds the person in
   the office, which takes a minute, and the Worker refuses an unauthorized sign-out even if a page is changed.
6. **Staff can record a time when the parent did not sign** (Policy ELCD-2017-L2 2(iv)): the staff member's initials are stored,
   the visit is flagged, and the door offers "Add a signature" to that person later. The times never change when they sign.
7. **An electronic register may not replace the paper one without the Department's say.** The Policy manual describes a bound,
   numbered, pen-written register (ELCD-2017-L2 1). The app prints the register per homeroom so a centre can keep paper too; the
   question goes to Alexander (NEEDS ALEXANDER) and is written in README and docs/RULES.md as Unknown.
8. **Store the minimum.** No home addresses, no health numbers (MCP), no allergies or medical notes, no photos, no specimen
   signatures. Date of birth and one emergency contact are kept because the daily register needs them (s.45(2)(b), (c)). Phone
   numbers show in the office only, never on the door tablet or the staff phones.
9. **Nothing is deleted by the app.** Registers are kept at least 7 years (s.45(3)), other records 3 (s.43(2)): children and people
   are made inactive, logs are voided, visit fixes keep the old times and the reason. A real deployment needs backups (README).
10. **Parent links are today only and die at local midnight.** 256-bit random token, only its SHA-256 stored, a fresh link per tap,
    the content is live for that day. Nothing is emailed or texted: staff copy the link or print the note.
11. **Minutes are whole minutes of each instant** (`floor(ms / 60000)` at both ends), so the parts of a visit cut at midnight always
    add up to the visit. A visit never signed out counts as present with 0 minutes and a "Not signed out" flag until a supervisor
    fixes the time with a reason.
12. **Look: Alexander's approved portfolio look** (dark navy, colour on data, pills, edges and avatars, aurora at most 0.2), with a
    sea-glass teal accent. Ratio colours are the only loud colours: green OK, amber At the limit, red Over, slate Not set. Print is
    white with ink only in text and signatures.
13. **The door tablet is set up once with the supervisor's PIN** (a 30-day device token that can only use the door routes). Staff
    sign in on their phones with their own PIN (12-hour token, one shift). The office is supervisor only.
14. **Moving a child is a placement change with times** (Policy ELCD-2017-L2 7), so the printed register can list "Went to Toddler
    room 10:00 AM, back 10:40 AM".
15. **One centre per deployment**, like the sibling builds.
16. **`.rig/` is not committed.** `rig init` marks it machine state.
17. **The Policy and Standards Manual PDF (17 MB) is committed** as the raw source for four quotes, so `npm run rules` works from a
    clean clone without the network.
18. **Signatures carry their own ink.** `signature_svg` puts `fill="none" stroke="currentColor"` and round caps on the path, so a
    signature draws on screen and prints black on paper with no page CSS (dd1's M1 question).
19. **Time labels are bare times** ("8:05 AM"); pages add "In since" and the like. One format, so no page guesses (dd2's M1 question).
20. **A note's "What we did today" lists only rooms with text; `rooms_today` lists every room the child was in**, so staff can write
    a line for a room the child has already left (dd1's cross-review of dd2).
21. **Attendance has an `upcoming` status** for booked dates after today. "Missing" is only ever a past or present day, so a
    supervisor never sees tomorrow flagged as an unexplained absence.
22. **The demo seed never moves a child out of their own room** to make a point: today shows the infant room at the limit, the
    toddler room over (6 toddlers, 1 staff) and the preschool room OK.
23. **`/api/info` before first setup answers empty strings** for the centre name and phone; pages show no name rather than a guess.
24. **Fixing a forgotten sign-out leaves "picked up by" empty.** The register shows the change, who made it and why; the app does not
    invent who took the child home.
25. **A real centre starts from `worker/tools/first-setup.mjs`**, which writes a git-ignored, owner-only SQL file with the centre row,
    the cited ratio rules and one supervisor's PIN hash. There is no route that creates a supervisor, so a deployed Worker cannot be
    taken over through the API.
26. **QA runs from worktrees pinned with `--ref`** (`rig qa <sha>` without `--ref` grades main) and gates on each command's own
    exit code; a second pinned worktree on the lead's port lets two slices be graded at once.
27. **A child still in the building is "still here", never "Not signed out".** Only a visit left open from an earlier date is a
    forgotten sign-out that needs "Fix a time". Found by looking at the docs screenshots: at 10:29 AM the office flagged all 15
    children who were simply still in their rooms.
28. **Office follow-ups have their own route** (`GET /api/office/follow-ups`): signatures still owed from the last 14 days, whether
    or not the child is here now, and visits left open from earlier days. The door's own list is door-only, and Policy
    ELCD-2017-L2 2(iv) asks the centre to get the parent's signature on their next visit.
29. **No browser dialogs** (`alert`, `confirm`, `prompt`) on any page: they block the page and anything driving it, and some web
    views swallow them silently. Messages go on the page in `role="alert"`.
30. **The centre's name and the SAMPLE badge come only from the API.** No page hard-codes the SAMPLE name; the badge shows only when
    `sample` is true, and `/api/info` answers `sample: false` before a centre row exists, so a real deployment never shows a SAMPLE
    badge or a guessed name before setup.
31. **Only slice sections use `###` headings in PLAN.md.** Rig reads `### <id>` as an agent; a queued "Next round" list under `###`
    headings made `rig guard` refuse every commit (found by dd1). Queued notes use bold labels.
32. **The door tablet recovers when another device got there first.** On a 409 (`already_in`, `not_in`, `bad_state`) it shows the API's
    message, re-reads the child and starts again from the first step instead of offering the same refused write (dd2's cross-review).
33. **A closed room keeps its children editable.** An edit that sends back a child's unchanged home room is saved even if that room is
    closed; moving a child into a closed room is still refused (dd1's cross-review).
34. **"Fix a time" edits the visit, not the cell.** The dialog fills in the visit's own dates, so an overnight visit can be fixed from
    either day's cell (dd1's cross-review).
35. **A mistaken absence can be removed; a visit never can.** Absences are a supervisor's note and can be deleted; visits are the daily
    register (kept 7 years) and are only ever fixed, with the old times and the reason kept.
