// Pure, browser-free helpers for Keep in Touch. Imported by both the app
// (src/index.html) and the unit tests (__tests__/logic.test.mjs). No DOM, no fetch.

export const HOURS_PER_WEEK = 168;
export const MIN_WEEKS = 1;
export const MAX_WEEKS = 104; // two years — a sane ceiling for a cadence
export const MAX_CONNECTIONS = 100; // per member; keeps the list + email fan-out bounded
export const MAX_EXTERNAL_RECIPIENTS = 5; // per connection

// Cadence presets offered in the UI, stored as whole-week multiples.
export const CADENCE_PRESETS = [
  { weeks: 1, label: "Every week" },
  { weeks: 2, label: "Every 2 weeks" },
  { weeks: 4, label: "Every month" },
  { weeks: 6, label: "Every 6 weeks" },
  { weeks: 13, label: "Every 3 months" },
  { weeks: 26, label: "Every 6 months" },
  { weeks: 52, label: "Once a year" },
];

export const TOUCH_KINDS = [
  { key: "call", emoji: "📞", label: "Called" },
  { key: "text", emoji: "💬", label: "Texted" },
  { key: "visit", emoji: "🏡", label: "Visited" },
  { key: "email", emoji: "✉️", label: "Emailed" },
  { key: "other", emoji: "👋", label: "Other" },
];

export function touchKindMeta(key) {
  return TOUCH_KINDS.find(k => k.key === key) ?? null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Basic email-shape check used before inviting an external contact. */
export function isValidEmail(email) {
  return typeof email === "string" && EMAIL_RE.test(email.trim());
}

/** Trim + lowercase, matching how the hub normalizes external-contact emails. */
export function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

// ── cadence helpers ──────────────────────────────────────────────────────────

/** Whole weeks → interval hours. */
export function weeksToHours(weeks) {
  return Math.round(Number(weeks) * HOURS_PER_WEEK);
}

/** Interval hours → whole weeks (rounded; the UI only ever stores week multiples). */
export function hoursToWeeks(hours) {
  return Math.max(MIN_WEEKS, Math.round(Number(hours) / HOURS_PER_WEEK));
}

/** Friendly cadence label, e.g. "every month" / "every 3 weeks". */
export function cadenceLabel(hours) {
  const weeks = hoursToWeeks(hours);
  const preset = CADENCE_PRESETS.find(p => p.weeks === weeks);
  if (preset) return preset.label.toLowerCase();
  return weeks === 1 ? "every week" : `every ${weeks} weeks`;
}

// ── status ───────────────────────────────────────────────────────────────────
// Mirrors the hub's inactivity_alerts model: a connection is active and carries
// an interval; last_contact_at anchors the deadline. `now` is injected so the
// logic stays pure and testable. A connection with no logged contact is treated
// as overdue from the moment it is created (the caller stamps last_contact_at on
// create, so this only shows for legacy/never-stamped rows).

export function connectionStatus(row, now = new Date()) {
  if (!row || Number(row.active) !== 1) return { state: "paused" };
  if (!row.last_contact_at) return { state: "overdue", overdueMs: 0 };
  const last = new Date(row.last_contact_at);
  if (Number.isNaN(last.getTime())) return { state: "overdue", overdueMs: 0 };
  const intervalMs = Number(row.interval_hours) * 3600_000;
  const deadline = new Date(last.getTime() + intervalMs);
  const remainingMs = deadline.getTime() - now.getTime();
  if (remainingMs <= 0) return { state: "overdue", deadline, overdueMs: -remainingMs };
  if (remainingMs < intervalMs * 0.25) return { state: "due_soon", deadline, remainingMs };
  return { state: "ok", deadline, remainingMs };
}

/** "3w 2d" / "2d 4h" / "5h" / "12m" — coarse, friendly duration. */
export function formatDuration(ms) {
  const abs = Math.abs(ms);
  const minutes = Math.floor(abs / 60_000);
  const weeks = Math.floor(minutes / (7 * 1440));
  const days = Math.floor((minutes % (7 * 1440)) / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (weeks > 0) return `${weeks}w ${days}d`;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

/** "just now" / "3 days ago" / "2 weeks ago" from an ISO timestamp. */
export function timeAgo(iso, now = new Date()) {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "never";
  const ms = now.getTime() - then;
  if (ms < 0) return "just now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days} day${days === 1 ? "" : "s"} ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 9) return `${weeks} weeks ago`;
  const months = Math.floor(days / 30);
  if (months < 18) return `${months} month${months === 1 ? "" : "s"} ago`;
  return `${Math.floor(days / 365)} year${Math.floor(days / 365) === 1 ? "" : "s"} ago`;
}

// ── validation ───────────────────────────────────────────────────────────────

/**
 * Validates a connection edit before saving. Returns an error string or null.
 * recipientEmails are external addresses — each must be a valid email; they
 * still require double-opt-in confirmation hub-side before any nudge reaches them.
 */
export function validateConnection({ name, relationship, intervalWeeks, message, recipientEmails }) {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "Add a name for the person you want to stay in touch with.";
  if (trimmed.length > 80) return "Name is too long (80 characters max).";
  if (typeof relationship === "string" && relationship.length > 60) return "Relationship is too long (60 characters max).";
  const weeks = Number(intervalWeeks);
  if (!Number.isInteger(weeks) || weeks < MIN_WEEKS) return "Pick a cadence of at least 1 week.";
  if (weeks > MAX_WEEKS) return `Cadence can't be longer than ${MAX_WEEKS} weeks.`;
  if (typeof message === "string" && message.length > 2000) return "Note is too long (2000 characters max).";
  if (recipientEmails !== undefined) {
    if (!Array.isArray(recipientEmails)) return "Reminder emails must be a list.";
    if (recipientEmails.length > MAX_EXTERNAL_RECIPIENTS) return `You can add up to ${MAX_EXTERNAL_RECIPIENTS} reminder emails per connection.`;
    if (recipientEmails.some(e => !isValidEmail(e))) return "Every reminder email must be a valid address.";
  }
  return null;
}

// ── recipients ───────────────────────────────────────────────────────────────

/**
 * Human summary of who gets the nudge. The owner's own id is only ever stored as
 * a "not all-adults" sentinel, so it is excluded here; a bare "just you" is shown
 * when the only recipient is the owner's own confirmed email.
 */
export function recipientsSummary(recipientIds, members, selfId, recipientEmails, selfEmail) {
  const byId = new Map((members ?? []).map(m => [m.id, m]));
  const named = (recipientIds ?? [])
    .filter(id => id !== selfId)
    .map(id => byId.get(id)?.name)
    .filter(Boolean);
  const emails = (recipientEmails ?? []).map(normalizeEmail).filter(Boolean);
  const self = normalizeEmail(selfEmail);
  const includesSelf = self && emails.includes(self);
  const otherEmails = emails.filter(e => e !== self);

  const parts = [];
  if (includesSelf) parts.push("you");
  parts.push(...named);
  for (const e of otherEmails) parts.push(e);

  if (parts.length === 0) return "no one yet — add a reminder email";
  if (parts.length <= 3) return parts.join(", ");
  return `${parts.slice(0, 2).join(", ")} +${parts.length - 2} more`;
}

/** Display title for a connection card. */
export function connectionTitle(row) {
  const name = (row?.name ?? "").trim();
  return name || "Someone";
}

/** Initials for the avatar chip. */
export function connectionInitials(name) {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Sort connections by urgency for the list: overdue first (most overdue on top),
 * then due-soon, then on-track by soonest deadline, paused last.
 */
export function sortByUrgency(connections, now = new Date()) {
  const rank = { overdue: 0, due_soon: 1, ok: 2, paused: 3 };
  return [...(connections ?? [])].sort((a, b) => {
    const sa = connectionStatus(a, now);
    const sb = connectionStatus(b, now);
    if (rank[sa.state] !== rank[sb.state]) return rank[sa.state] - rank[sb.state];
    if (sa.state === "overdue") return (sb.overdueMs ?? 0) - (sa.overdueMs ?? 0);
    if (sa.state === "ok" || sa.state === "due_soon") return (sa.remainingMs ?? 0) - (sb.remainingMs ?? 0);
    return connectionTitle(a).localeCompare(connectionTitle(b));
  });
}
