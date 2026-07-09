SELECT
  c.id,
  c.name,
  c.relationship,
  c.interval_hours,
  c.last_contact_at,
  CASE
    WHEN c.last_contact_at IS NULL THEN NULL
    ELSE datetime(c.last_contact_at, '+' || c.interval_hours || ' hours')
  END AS due_at
FROM app_stay_in_touch__connections c
WHERE c.active = 1
  AND (
    c.last_contact_at IS NULL
    OR datetime(c.last_contact_at, '+' || c.interval_hours || ' hours') <= datetime('now')
  )
ORDER BY due_at
LIMIT 100
