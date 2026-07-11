CREATE INDEX IF NOT EXISTS app_stay_in_touch__touches_retention_idx
  ON app_stay_in_touch__touches (touched_at, id);
