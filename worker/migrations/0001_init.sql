-- Daycare Day Sheet schema. One centre per deployment.
-- Instants are ISO-8601 UTC strings to the millisecond (Date#toISOString); `date` columns are centre-local
-- (America/St_Johns) YYYY-MM-DD. Nothing is deleted by the app: people and children go inactive, logs are voided,
-- visit fixes keep the old times in visit_edits.
-- This migration holds the schema only. The SAMPLE centre is written by POST /api/test/reset from src/sample.js.

CREATE TABLE centre (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,
  sample INTEGER NOT NULL,
  phone TEXT NOT NULL
);

-- NLR 39/17 s.54. A null number means the operator cleared it: the meter says "Not set".
CREATE TABLE ratio_rules (
  age_group TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  children_per_caregiver INTEGER,
  max_children INTEGER,
  default_children_per_caregiver INTEGER NOT NULL,
  default_max_children INTEGER NOT NULL,
  citation TEXT NOT NULL,
  sort INTEGER NOT NULL
);

CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  age_group TEXT NOT NULL REFERENCES ratio_rules (age_group),
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL
);

-- PBKDF2-SHA-256 (100 000 iterations) of the PIN with a per-staff salt. Never leaves the Worker.
CREATE TABLE staff (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  initials TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('supervisor', 'educator')),
  active INTEGER NOT NULL DEFAULT 1,
  pin_hash TEXT NOT NULL,
  pin_salt TEXT NOT NULL
);

-- No addresses, no health numbers, no photos. dob is kept for the daily register (s.45(2)(b)).
CREATE TABLE children (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  initials TEXT NOT NULL,
  dob TEXT NOT NULL,
  home_room_id TEXT NOT NULL REFERENCES rooms (id),
  schedule TEXT NOT NULL CHECK (schedule IN ('full_time', 'part_time')),
  days TEXT NOT NULL, -- JSON array of 'mon'…'sun'
  start_date TEXT NOT NULL,
  end_date TEXT
);

CREATE TABLE people (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL REFERENCES children (id),
  name TEXT NOT NULL,
  relationship TEXT NOT NULL,
  phone TEXT,
  may_pick_up INTEGER NOT NULL DEFAULT 0,
  emergency_contact INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX people_child ON people (child_id);

-- One row per sign-in. Signatures are JSON integer strokes; *_recorded_by is the staff member who recorded a time the
-- parent did not sign (Policy ELCD-2017-L2 2(iv)).
CREATE TABLE visits (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL REFERENCES children (id),
  date TEXT NOT NULL,
  in_at TEXT NOT NULL,
  in_person_id TEXT NOT NULL REFERENCES people (id),
  in_signature TEXT,
  in_recorded_by TEXT REFERENCES staff (id),
  out_at TEXT,
  out_person_id TEXT REFERENCES people (id),
  out_signature TEXT,
  out_recorded_by TEXT REFERENCES staff (id)
);
-- A child has at most one open visit: two taps at once cannot sign a child in twice.
CREATE UNIQUE INDEX visits_one_open ON visits (child_id) WHERE out_at IS NULL;
CREATE INDEX visits_child_date ON visits (child_id, date);

-- Which room a signed-in child is in, with times (Policy ELCD-2017-L2 7).
CREATE TABLE placements (
  id TEXT PRIMARY KEY,
  visit_id TEXT NOT NULL REFERENCES visits (id),
  child_id TEXT NOT NULL REFERENCES children (id),
  room_id TEXT NOT NULL REFERENCES rooms (id),
  start_at TEXT NOT NULL,
  end_at TEXT
);
CREATE UNIQUE INDEX placements_one_open ON placements (visit_id) WHERE end_at IS NULL;

CREATE TABLE presence (
  id TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL REFERENCES staff (id),
  room_id TEXT NOT NULL REFERENCES rooms (id),
  start_at TEXT NOT NULL,
  end_at TEXT
);
CREATE UNIQUE INDEX presence_one_open ON presence (staff_id) WHERE end_at IS NULL;

CREATE TABLE logs (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL REFERENCES children (id),
  visit_id TEXT NOT NULL REFERENCES visits (id),
  date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('meal', 'nap_start', 'nap_end', 'diaper', 'toilet', 'mood', 'note')),
  value TEXT,
  meal TEXT,
  text TEXT,
  at TEXT NOT NULL,
  by_staff_id TEXT NOT NULL REFERENCES staff (id),
  voided INTEGER NOT NULL DEFAULT 0,
  voided_by TEXT REFERENCES staff (id),
  voided_at TEXT
);
CREATE INDEX logs_child_date ON logs (child_id, date);

CREATE TABLE room_activity (
  date TEXT NOT NULL,
  room_id TEXT NOT NULL REFERENCES rooms (id),
  text TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES staff (id),
  PRIMARY KEY (date, room_id)
);

CREATE TABLE note_lines (
  child_id TEXT NOT NULL REFERENCES children (id),
  date TEXT NOT NULL,
  text TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES staff (id),
  PRIMARY KEY (child_id, date)
);

-- Parent links: only the SHA-256 of the token is stored. expires_at = the local midnight that ends `date`.
CREATE TABLE note_links (
  token_hash TEXT PRIMARY KEY,
  child_id TEXT NOT NULL REFERENCES children (id),
  date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES staff (id)
);

-- Bearer tokens: only the SHA-256 is stored. kind 'staff' takes its role from the staff row; 'door' is the tablet.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('staff', 'door')),
  staff_id TEXT NOT NULL REFERENCES staff (id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE pin_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  ok INTEGER NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX pin_attempts_ip_at ON pin_attempts (ip, at);

CREATE TABLE absences (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL REFERENCES children (id),
  date TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('sick', 'holiday', 'appointment', 'family', 'other')),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES staff (id),
  UNIQUE (child_id, date)
);

CREATE TABLE visit_edits (
  id TEXT PRIMARY KEY,
  visit_id TEXT NOT NULL REFERENCES visits (id),
  at TEXT NOT NULL,
  by_staff_id TEXT NOT NULL REFERENCES staff (id),
  reason TEXT NOT NULL,
  old_in_at TEXT NOT NULL,
  old_out_at TEXT,
  new_in_at TEXT NOT NULL,
  new_out_at TEXT
);
CREATE INDEX visit_edits_visit ON visit_edits (visit_id);
