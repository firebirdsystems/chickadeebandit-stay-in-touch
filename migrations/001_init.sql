-- Keep in Touch — personal cadence reminders layered on the inactivity_alerts protocol.
--
-- Each row in `connections` is one person the owner wants to stay in touch with,
-- plus the cadence (interval_hours) they want to keep. It plugs into the hub's
-- inactivity_alerts protocol: the hourly cron finds active connections whose
-- last_contact_at is older than interval_hours and not yet alerted, emails the
-- recipients a "time to reach out" nudge, and stamps last_alerted_at per row
-- (by id) so a nudge fires once per overdue window.
--
-- Unlike the check-in apps, "reaching out" is per-connection: logging a touch
-- resets ONE connection's clock. The app does this by writing last_contact_at
-- directly on the owned row (owner_only) and inserting a touches history row,
-- rather than going through POST /api/check-in (which would reset every
-- connection the member owns at once). The clock is the owner's own reminder,
-- so a wrong client clock only ever affects that owner's nudges.
--
-- Recipients: the nudge is meant for the owner. The inactivity_alerts cron never
-- alerts the switch owner as a *member* recipient and treats an empty
-- recipient_member_ids as "all adults", so the app seeds recipient_member_ids
-- with the owner's own id purely as a "not all-adults" sentinel (it is filtered
-- out hub-side) and delivers the nudge to recipient_emails — the owner's own
-- address, confirmed once through the double-opt-in external-contacts registry.
-- Owners can additionally pick other household adults or external emails.
CREATE TABLE IF NOT EXISTS app_stay_in_touch__connections (
  id                   TEXT    NOT NULL,
  member_id            TEXT    NOT NULL,               -- the owner of this reminder
  name                 TEXT    NOT NULL DEFAULT '',    -- the person to stay in touch with, e.g. "Aunt Sue"
  relationship         TEXT    NOT NULL DEFAULT '',    -- optional label, e.g. "Aunt", "College roommate"
  active               INTEGER NOT NULL DEFAULT 1,     -- 0 = paused, 1 = reminding
  interval_hours       INTEGER NOT NULL DEFAULT 672 CHECK (interval_hours > 0), -- cadence (default ~4 weeks)
  message              TEXT    NOT NULL DEFAULT '',    -- optional note included in the nudge email
  recipient_member_ids TEXT    NOT NULL DEFAULT '[]',  -- JSON array of member ids; owner id is a self-only sentinel
  recipient_emails     TEXT    NOT NULL DEFAULT '[]',  -- JSON array of external emails; only CONFIRMED ones are emailed
  last_contact_at      TEXT,                           -- ISO, stamped on a touch (anchors the cadence); plaintext so the overdue_connections AI export can do SQL date math
  last_alerted_at      TEXT,                           -- ISO, cron-stamped per connection (dedupe)
  created_at           TEXT    NOT NULL,
  updated_at           TEXT    NOT NULL,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS connections_by_member
  ON app_stay_in_touch__connections (member_id);

-- History of logged touches, for the "last reached out" timeline on each card.
-- Display-only: the authoritative cadence anchor is connections.last_contact_at.
-- owner_only forces member_id to the caller on INSERT.
CREATE TABLE IF NOT EXISTS app_stay_in_touch__touches (
  id            TEXT NOT NULL,
  member_id     TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT '',  -- call | text | visit | email | other
  note          TEXT NOT NULL DEFAULT '',
  touched_at    TEXT NOT NULL,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS touches_by_connection
  ON app_stay_in_touch__touches (connection_id, touched_at);
