# Daycare Day Sheet — brief (Onyx, 2026-09-14)

**Prefix** `dd` · **Ports** app 7801, worker 7802, QA 7809 · **Repo** `daycare-day-sheet` (private) · **Lead effort** xhigh

## What
The daily paperwork of a small licensed child care centre in Newfoundland and Labrador, on a tablet by the door
and staff phones: children signed in and out (by whom, when), which room they're in, **staff-to-child ratios by
room live**, a short daily note home for each child (meals, naps, diapers/toileting, activities, mood), and an
attendance export for the operator's funding and fee paperwork.

## Rules to research and cite (don't guess)
NL's Child Care Act and Child Care Regulations: ratio and group-size rules by age group, sign-in/out record
requirements, record retention. Put each rule used in `docs/RULES.md` with the section number and verbatim
quote from the official source (assembly.nl.ca / gov.nl.ca), fetched date, raw page saved in `data/sources/`.
Ratio settings ship with the cited values and are editable by the operator ("your licence may differ"). If a
value can't be verified, the setting starts empty and the app asks the operator to fill it in.

## Screens
- **Door tablet**: tap a child's card → Sign in / Sign out → who is dropping off / picking up (from the
  child's authorized list; "not on the list — get the supervisor" block), time stamped. Big targets, no typing.
- **Room view (staff phone)**: children present, staff present, ratio meter per room (green / amber at the limit
  / red over), move a child between rooms, quick log buttons (ate all/some/none, nap start/end, diaper/toilet,
  note), one-tap "staff in/out of room".
- **Daily note**: per child, built from the quick logs + a free-text line; parent link (unguessable, today only)
  and a printable version. Nothing is emailed or texted.
- **Office**: children and guardians, authorized pickups, rooms, staff, attendance by day/week/month, CSV
  export, absence reasons.

## Privacy (hard rules)
SAMPLE centre "SAMPLE Little Harbour Child Care (demo)" and SAMPLE children/parents only, labelled SAMPLE.
No real names or photos; avatars are initials. PIN per staff member; parent links expire at midnight. Store
the minimum: no health numbers, no birth certificates. Say in README what a real deployment would need
(privacy notice, PHIA/ATIPPA review, backups).

## Tests that matter
Ratio goes red the moment one child too many is signed into a room (negative control: break the count);
sign-out by someone not authorized is blocked; attendance totals match sign-in/out pairs across midnight;
parent link stops working the next day; journeys at tablet 1024×768 + phone 390, chromium + webkit.
