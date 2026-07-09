# Keep in Touch

A personal, CRM-lite reminder for the people you care about. Set a cadence for
each person — every week, month, quarter, or year — log a touch when you reach
out, and the hub emails you a gentle nudge when you're overdue: *"It's been 3
months since you talked to Aunt Sue."*

The value is entirely in the scheduled reminder, so it's a thin build on top of
the hub's `inactivity_alerts` protocol (the same machinery behind Check-In
Switch and Wellness Check-In), inverted: instead of alerting *other people* when
*you* go quiet, it alerts *you* when a *connection* goes quiet.

## How it works

- Each **connection** is one person you want to stay in touch with, plus the
  cadence you want to keep. It's a `inactivity_alerts` switch row: `active`,
  `interval_hours`, and `last_contact_at` (the cadence anchor).
- **Logging a touch** is per-connection. The app stamps `last_contact_at` on
  that one connection and writes a `touches` history row — it does *not* call
  `POST /api/check-in`, because that endpoint resets every connection the member
  owns at once. Because a connection is the owner's own private reminder, a
  wrong client clock only ever affects that owner's nudges.
- The hub's hourly cron finds active connections whose `last_contact_at` is older
  than `interval_hours`, emails the recipients, and stamps `last_alerted_at` per
  connection (by `id`) so a nudge fires once per overdue window.
- This needs the **Premium** capability bundle (`cron` + `email`). Tracking and
  logging touches is free; only the scheduled email is gated. The entitlement
  banner is driven by `GET /api/check-in` (`{ entitled }`).

## Who gets the nudge

The nudge is meant for **you**. The `inactivity_alerts` cron never alerts the
switch owner as a *member* recipient, and treats an empty `recipient_member_ids`
as "all adults." So the app:

- seeds `recipient_member_ids` with the owner's own id purely as a *not-all-adults*
  sentinel (filtered out hub-side), and
- delivers the nudge to `recipient_emails` — your own address, confirmed once
  through the **double-opt-in** external-contacts registry.

You can additionally remind other household adults (a spouse) or add other
external emails. External addresses are only ever emailed after they confirm
(double opt-in); pending/unsubscribed addresses are silently skipped.

## Access model

- `connections` — `owner_only` (`adults_bypass: false`): a personal list. Each
  adult sees and manages only their own connections.
- `touches` — `owner_only`: the per-connection contact history, display-only.

The whole app is `default_audience: "adults"`.

## Development

```bash
npm install
npm test        # unit tests for src/logic.js + manifest/protocol validation
node build.mjs  # validates migrations and bundles src/ → dist/bundle.json
node dev.mjs    # local dev server (demo data when there's no hub context)
```
