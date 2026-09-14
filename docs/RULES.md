# The rules this app uses, with the law behind each

Every rule below is quoted word for word from an official Newfoundland and Labrador source saved in `data/sources/`.
`npm run rules` checks each quote is an exact substring of the saved page (and proves the check can fail first).
Anything not found in these sources is listed at the bottom as **Unknown**, never guessed.

Sources (all fetched 2026-09-14 with the User-Agent `APCO-Software-Tools-research/1.0 (+https://apcosoftwaretools.ca)`,
robots.txt allows both paths):

- **Child Care Act**, SNL 2014 c. C-11.01 (House of Assembly consolidated version, amended 2018 cC-12.3 s117).
- **Child Care Regulations**, NLR 39/17 (House of Assembly consolidated version, amended by 66/17, 70/17, 95/18, 2018 cC-12.3 s129,
  2021 cO-5.1 s45, 41/22). A search on 2026-09-14 found no later amendment.
- **Child Care Policy and Standards Manual**, Government of NL, Department of Education, version 3.1 (May 9, 2023). Policy, not law,
  but it is what an inspector reads.

The app is not legal advice. Each centre checks its own licence: **"your licence may differ"** is on the ratio settings.

## Ratios and group sizes

### R1 — Age ranges (who belongs in which group)
- Law: NLR 39/17 s.2 (definitions)
- Source: `data/sources/child-care-regulations-nlr-39-17.htm` from <https://www.assembly.nl.ca/legislation/sr/regulations/rc170039.htm>, fetched 2026-09-14
- Used for: the age group labels on rooms and ratio rules.

> "infant age range" means an age range from birth up to 2 years old;

> "toddler age range" means an age range from one year and 6 months old up to 3 years old;

> "pre-school age range" means not attending school and an age range from 2 years and 9 months old up to 5 years and 9 months old;

> "pre-kindergarten age range" means attending a pre-kindergarten program and an age range from 3 years and 8 months old up to 5 years and 9 months old;

> "school age range" means attending school and an age range from 4 years and 8 months old up to 13 years old;

### R2 — Infant room: 1 caregiver to 3, at most 6
- Law: NLR 39/17 s.54(1)
- Source: `data/sources/child-care-regulations-nlr-39-17.htm` from <https://www.assembly.nl.ca/legislation/sr/regulations/rc170039.htm>, fetched 2026-09-14
- Used for: `infant` default `children_per_caregiver` 3, `max_children` 6.

> A maximum of 6 children shall be assigned to a homeroom of children in the infant age range and the caregiver to child ratio for that homeroom shall be one caregiver to 3 children.

### R3 — Toddler room: 1 to 5, at most 10
- Law: NLR 39/17 s.54(2)
- Source: `data/sources/child-care-regulations-nlr-39-17.htm` from <https://www.assembly.nl.ca/legislation/sr/regulations/rc170039.htm>, fetched 2026-09-14
- Used for: `toddler` default 5 and 10.

> A maximum of 10 children shall be assigned to a homeroom of children in the toddler age range and the caregiver to child ratio for that homeroom shall be one caregiver to 5 children.

### R4 — Pre-school room: 1 to 8, at most 16
- Law: NLR 39/17 s.54(3)
- Source: `data/sources/child-care-regulations-nlr-39-17.htm` from <https://www.assembly.nl.ca/legislation/sr/regulations/rc170039.htm>, fetched 2026-09-14
- Used for: `preschool` default 8 and 16.

> A maximum of 16 children shall be assigned to a homeroom of children in the pre-school age range and the caregiver to child ratio for that homeroom shall be one caregiver to 8 children.

### R5 — Pre-kindergarten room: 1 to 10, at most 20
- Law: NLR 39/17 s.54(4)
- Source: `data/sources/child-care-regulations-nlr-39-17.htm` from <https://www.assembly.nl.ca/legislation/sr/regulations/rc170039.htm>, fetched 2026-09-14
- Used for: `prek` default 10 and 20.

> A maximum of 20 children shall be assigned to a homeroom of children in the pre-kindergarten age range and the caregiver to child ratio for that homeroom shall be one caregiver to 10 children.

### R6 — School-age room: 1 to 15, at most 30
- Law: NLR 39/17 s.54(5)
- Source: `data/sources/child-care-regulations-nlr-39-17.htm` from <https://www.assembly.nl.ca/legislation/sr/regulations/rc170039.htm>, fetched 2026-09-14
- Used for: `school_age` default 15 and 30.

> A maximum of 30 children shall be assigned to a homeroom of children in the school age range and the caregiver to child ratio for that homeroom shall be one caregiver to 15 children.

### R7 — Mixed ages: count as the youngest group
- Law: NLR 39/17 s.54(9)
- Source: `data/sources/child-care-regulations-nlr-39-17.htm` from <https://www.assembly.nl.ca/legislation/sr/regulations/rc170039.htm>, fetched 2026-09-14
- Used for: the office tells the operator to pick the youngest child's group for a mixed room.

> Where children of more than one age range are assigned to a homeroom under subsection 53(8) or (9), the caregiver to child ratio of the homeroom and the maximum number of children assigned to the homeroom shall be determined as though all the children assigned to that homeroom were in the age range of the youngest child.

### R8 — Toddlers and pre-schoolers together: 1 to 7, at most 14
- Law: NLR 39/17 s.54(10)
- Source: `data/sources/child-care-regulations-nlr-39-17.htm` from <https://www.assembly.nl.ca/legislation/sr/regulations/rc170039.htm>, fetched 2026-09-14
- Used for: `toddler_preschool` default 7 and 14.

> Notwithstanding subsection (9), where children in the toddler age range and the pre-school age range are assigned to the same homeroom under paragraph 53(8)(b), the caregiver to child ratio of the homeroom shall be one caregiver to 7 children and the maximum number of children assigned to the homeroom shall be 14 children.

### R9 — A homeroom may not go over its maximum
- Law: NLR 39/17 s.53(3)
- Source: `data/sources/child-care-regulations-nlr-39-17.htm` from <https://www.assembly.nl.ca/legislation/sr/regulations/rc170039.htm>, fetched 2026-09-14
- Used for: the meter's "Over the most this room can hold" state, separate from the ratio.

> The number of children assigned to each homeroom shall not exceed the maximum number permitted under section 54.

## The daily register (sign in and sign out)

### R10 — What the daily register holds: name, birth date, emergency contact, signature and time
- Law: NLR 39/17 s.45(1) and (2)
- Source: `data/sources/child-care-regulations-nlr-39-17.htm` from <https://www.assembly.nl.ca/legislation/sr/regulations/rc170039.htm>, fetched 2026-09-14
- Used for: the door tablet asks who is dropping off or picking up and for a finger signature, and stamps the time; the printed
  register shows date of birth and the emergency contact.

> An administrator of a child care service shall ensure that a daily register is prepared for the child care service.

> the signature of the person who drops the child off at the facility and picks the child up from the facility and the time that the person dropped off or picked up the child.

### R11 — Keep daily registers at least 7 years
- Law: NLR 39/17 s.45(3)
- Source: `data/sources/child-care-regulations-nlr-39-17.htm` from <https://www.assembly.nl.ca/legislation/sr/regulations/rc170039.htm>, fetched 2026-09-14
- Used for: the app never deletes visits; the printed register says so; README says a real deployment needs backups.

> Daily registers shall be kept for at least 7 years.

### R12 — One register per homeroom, near its entrance
- Law: NLR 39/17 s.45(4)
- Source: `data/sources/child-care-regulations-nlr-39-17.htm` from <https://www.assembly.nl.ca/legislation/sr/regulations/rc170039.htm>, fetched 2026-09-14
- Used for: the office prints the daily register one homeroom at a time.

> Where the child care service is operated in a centre, a daily register shall be prepared for every homeroom and shall be located near the entrance of the homeroom.

### R13 — Other records: at least 3 years
- Law: NLR 39/17 s.43(2)
- Source: `data/sources/child-care-regulations-nlr-39-17.htm` from <https://www.assembly.nl.ca/legislation/sr/regulations/rc170039.htm>, fetched 2026-09-14
- Used for: daily notes and logs are kept (voided logs too); nothing is deleted by the app.

> Documents and records required by the Act and these regulations shall be kept for at least 3 years unless otherwise specified.

### R14 — The list of people allowed to pick up
- Law: NLR 39/17 s.46(2)(c)
- Source: `data/sources/child-care-regulations-nlr-39-17.htm` from <https://www.assembly.nl.ca/legislation/sr/regulations/rc170039.htm>, fetched 2026-09-14
- Used for: each child's people list with "May pick up"; sign-out by anyone not on it is refused. The sample signatures this
  section also asks for stay in the paper individual record (the app stores the minimum).

> a list of persons authorized to pick up from the facility the child or documents and records or both and a sample of the signature of each of those persons;

### R15 — When the parent does not sign: staff record the time and initial it
- Policy: Child Care Policy and Standards Manual, ELCD-2017-L2, 2(iv)
- Source: `data/sources/child-care-policy-and-standards-manual.pdf` from <https://www.gov.nl.ca/education/files/Child-Care-Policy-and-Standards-Manual-Full-Document3.1.pdf>, fetched 2026-09-14
- Used for: "Record without a signature" in the room view (the staff member's initials are stored) and "Add a signature" at the
  door later.

> Where the person who drops the child off does not sign the daily register, the child care service may want to consider having the person responsible for ensuring the daily register is accurate, indicating in the daily register the time the child arrived/departed at the child care service and initial it.

### R16 — The register must show who is there, all the time
- Policy: Child Care Policy and Standards Manual, ELCD-2017-L2, 3
- Source: `data/sources/child-care-policy-and-standards-manual.pdf` from <https://www.gov.nl.ca/education/files/Child-Care-Policy-and-Standards-Manual-Full-Document3.1.pdf>, fetched 2026-09-14
- Used for: a child who arrives is always signed in, even if that puts the room over ratio; the room turns red instead.

> Daily registers should be reviewed each time children enter or leave the homeroom to ensure it reflects the number of children present at all times.

### R17 — A child visiting another room is signed out of one and into the other
- Policy: Child Care Policy and Standards Manual, ELCD-2017-L2, 7
- Source: `data/sources/child-care-policy-and-standards-manual.pdf` from <https://www.gov.nl.ca/education/files/Child-Care-Policy-and-Standards-Manual-Full-Document3.1.pdf>, fetched 2026-09-14
- Used for: "Move to another room" records the time out of one room and into the other; both meters change at once; the printed
  register lists the moves.

> When a child leaves the homeroom to which they are assigned and visits another homeroom outside the first and last hour of the day, the child should be signed out of their original homeroom register and signed into the homeroom register where the child is visiting.

### R18 — The paper register the manual describes (why a centre must ask before going digital)
- Policy: Child Care Policy and Standards Manual, ELCD-2017-L2, 1
- Source: `data/sources/child-care-policy-and-standards-manual.pdf` from <https://www.gov.nl.ca/education/files/Child-Care-Policy-and-Standards-Manual-Full-Document3.1.pdf>, fetched 2026-09-14
- Used for: README and the office say to ask the Department before this replaces the paper register; the office prints the
  register per homeroom so the paper copy can be kept too.

> Bound with numbered pages and not altered in any way; and

> Completed using a pen. Where a mistake is made, the person who made the mistake must correct it and initial the mistake and correction.

## Daily notes and parents

### R19 — Infants: a daily written record of sleeping, eating and toileting for parents
- Law: NLR 39/17 s.26(3)
- Source: `data/sources/child-care-regulations-nlr-39-17.htm` from <https://www.assembly.nl.ca/legislation/sr/regulations/rc170039.htm>, fetched 2026-09-14
- Used for: the daily note of a child in the infant group is titled "Daily record of sleeping, eating and toileting".

> An administrator of a child care service shall provide a daily written record of the sleeping, eating and toileting patterns of every child who is in the infant age range to the parents of that child.

### R20 — Parents are entitled to copies of their child's records
- Law: Child Care Act, SNL 2014 c. C-11.01 s.28(a)
- Source: `data/sources/child-care-act-snl-2014-c-c-11.01.htm` from <https://www.assembly.nl.ca/legislation/sr/statutes/c11-01.htm>, fetched 2026-09-14
- Used for: the daily note is printable and the parent link shows the whole day's record for that child.

> Parents of a child registered in a child care service, and persons authorized in advance in writing by one or more of those parents, are entitled to a copy of the following upon request:

### R21 — Children's records are kept locked
- Law: NLR 39/17 s.46(3)
- Source: `data/sources/child-care-regulations-nlr-39-17.htm` from <https://www.assembly.nl.ca/legislation/sr/regulations/rc170039.htm>, fetched 2026-09-14
- Used for: the app's equivalent is a PIN per staff member, the office for the supervisor only, and no phone numbers on the door
  tablet or staff phones. Whether that satisfies "locked enclosure" for an electronic record is **Unknown** (below).

> The individual records shall be kept in a locked enclosure.

## Unknown (not found in these sources; the app does not guess)

- **Whether an electronic daily register is accepted** in place of the bound, pen-written one (R18). Ask the Department of Education,
  Early Learning and Child Care, before a centre relies on it. Until then, print the register per homeroom.
- **Whether a finger signature on a tablet counts as a signature** for s.45(2)(d). Same question to the Department.
- **What "locked enclosure" means for electronic records** (R21), and what PHIA / ATIPPA review a real deployment needs.
- **Family child care homes** (NLR 39/17 s.69 ratios): out of scope; this app is for centres.
- **Certification rules per room** (s.54(6)–(8)): not checked by the app; it counts people, not their certificates.
- **Parent link lifetime** (midnight): the app's own privacy choice, not a legal rule.
