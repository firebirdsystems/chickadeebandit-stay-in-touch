-- overdue_connections filters active = 1 and then applies a datetime() predicate
-- that no index can serve. `active` is an INTEGER flag (never encrypted), so
-- leading on it turns the full scan into a seek over just the live connections;
-- last_contact_at rides along because the predicate and the ordering both
-- derive from it.
CREATE INDEX IF NOT EXISTS connections_active_last_contact
  ON app_stay_in_touch__connections(active, last_contact_at);
