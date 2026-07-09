import { describe, it, expect } from "vitest";
import {
  weeksToHours, hoursToWeeks, cadenceLabel, connectionStatus, formatDuration,
  timeAgo, validateConnection, recipientsSummary, connectionTitle, connectionInitials,
  sortByUrgency, touchKindMeta, normalizeEmail, isValidEmail, MAX_EXTERNAL_RECIPIENTS,
  CADENCE_PRESETS,
} from "../src/logic.js";

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

describe("cadence helpers", () => {
  it("round-trips weeks ↔ hours", () => {
    expect(weeksToHours(1)).toBe(168);
    expect(weeksToHours(4)).toBe(672);
    expect(hoursToWeeks(672)).toBe(4);
  });
  it("floors weeks at the minimum", () => {
    expect(hoursToWeeks(1)).toBe(1);
    expect(hoursToWeeks(0)).toBe(1);
  });
  it("labels known presets and custom values", () => {
    expect(cadenceLabel(weeksToHours(1))).toBe("every week");
    expect(cadenceLabel(weeksToHours(4))).toBe("every month");
    expect(cadenceLabel(weeksToHours(13))).toBe("every 3 months");
    expect(cadenceLabel(weeksToHours(3))).toBe("every 3 weeks");
  });
});

describe("connectionStatus", () => {
  const now = new Date("2026-07-08T12:00:00Z");
  const row = (over, extra = {}) => ({ active: 1, interval_hours: weeksToHours(4), last_contact_at: new Date(now.getTime() - over).toISOString(), ...extra });

  it("is paused when inactive", () => {
    expect(connectionStatus({ active: 0 }, now).state).toBe("paused");
  });
  it("treats a never-contacted active row as overdue", () => {
    expect(connectionStatus({ active: 1, interval_hours: 672, last_contact_at: null }, now).state).toBe("overdue");
  });
  it("is ok early in the window", () => {
    const s = connectionStatus(row(3 * DAY), now);
    expect(s.state).toBe("ok");
    expect(s.remainingMs).toBeGreaterThan(0);
  });
  it("is due_soon in the last quarter", () => {
    const s = connectionStatus(row(3.5 * WEEK), now); // 4-week window, <25% left
    expect(s.state).toBe("due_soon");
  });
  it("is overdue past the deadline", () => {
    const s = connectionStatus(row(6 * WEEK), now);
    expect(s.state).toBe("overdue");
    expect(s.overdueMs).toBeGreaterThan(0);
  });
});

describe("formatDuration & timeAgo", () => {
  it("formats coarse durations", () => {
    expect(formatDuration(3 * WEEK + 2 * DAY)).toBe("3w 2d");
    expect(formatDuration(2 * DAY + 4 * HOUR)).toBe("2d 4h");
    expect(formatDuration(5 * HOUR)).toBe("5h");
  });
  it("describes elapsed time", () => {
    const now = new Date("2026-07-08T12:00:00Z");
    expect(timeAgo(null, now)).toBe("never");
    expect(timeAgo(new Date(now.getTime() - 3 * DAY).toISOString(), now)).toBe("3 days ago");
    expect(timeAgo(new Date(now.getTime() - 3 * WEEK).toISOString(), now)).toBe("3 weeks ago");
    expect(timeAgo(new Date(now.getTime() - 100 * DAY).toISOString(), now)).toBe("3 months ago");
  });
});

describe("validateConnection", () => {
  it("accepts a sane connection", () => {
    expect(validateConnection({ name: "Aunt Sue", intervalWeeks: 13, recipientEmails: [] })).toBeNull();
  });
  it("requires a name", () => {
    expect(validateConnection({ name: "  ", intervalWeeks: 4 })).toMatch(/name/i);
  });
  it("rejects an out-of-range cadence", () => {
    expect(validateConnection({ name: "X", intervalWeeks: 0 })).toMatch(/cadence/i);
    expect(validateConnection({ name: "X", intervalWeeks: 200 })).toMatch(/cadence/i);
  });
  it("rejects too many reminder emails", () => {
    const emails = Array.from({ length: MAX_EXTERNAL_RECIPIENTS + 1 }, (_, i) => `a${i}@x.com`);
    expect(validateConnection({ name: "X", intervalWeeks: 4, recipientEmails: emails })).toMatch(/reminder emails/i);
  });
  it("rejects an invalid reminder email", () => {
    expect(validateConnection({ name: "X", intervalWeeks: 4, recipientEmails: ["nope"] })).toMatch(/valid/i);
  });
});

describe("recipientsSummary", () => {
  const members = [{ id: "me", name: "Me", role: "adult" }, { id: "a", name: "Ann", role: "adult" }];
  it("shows 'you' when only the owner's own email is the recipient", () => {
    expect(recipientsSummary(["me"], members, "me", ["me@x.com"], "me@x.com")).toBe("you");
  });
  it("excludes the owner sentinel id and lists other adults + emails", () => {
    expect(recipientsSummary(["me", "a"], members, "me", ["me@x.com", "x@y.com"], "me@x.com"))
      .toBe("you, Ann, x@y.com");
  });
  it("prompts when there are no recipients", () => {
    expect(recipientsSummary(["me"], members, "me", [], "me@x.com")).toMatch(/no one yet/i);
  });
});

describe("sortByUrgency", () => {
  const now = new Date("2026-07-08T12:00:00Z");
  const conn = (id, over, active = 1) => ({ id, name: id, active, interval_hours: weeksToHours(4), last_contact_at: new Date(now.getTime() - over).toISOString() });
  it("orders overdue → due_soon → ok → paused", () => {
    const list = [
      conn("ok", 2 * DAY),
      conn("paused", 10 * WEEK, 0),
      conn("overdue", 8 * WEEK),
      conn("soon", 3.6 * WEEK),
    ];
    expect(sortByUrgency(list, now).map(c => c.id)).toEqual(["overdue", "soon", "ok", "paused"]);
  });
});

describe("misc helpers", () => {
  it("titles and initials", () => {
    expect(connectionTitle({ name: "Aunt Sue" })).toBe("Aunt Sue");
    expect(connectionTitle({ name: "" })).toBe("Someone");
    expect(connectionInitials("Aunt Sue")).toBe("AS");
    expect(connectionInitials("Marcus")).toBe("MA");
    expect(connectionInitials("")).toBe("?");
  });
  it("looks up touch kinds", () => {
    expect(touchKindMeta("call").emoji).toBe("📞");
    expect(touchKindMeta("nope")).toBeNull();
  });
  it("normalizes and validates emails", () => {
    expect(normalizeEmail("  A@B.COM ")).toBe("a@b.com");
    expect(isValidEmail("a@b.com")).toBe(true);
    expect(isValidEmail("nope")).toBe(false);
  });
  it("exposes cadence presets", () => {
    expect(CADENCE_PRESETS.length).toBeGreaterThan(0);
    expect(CADENCE_PRESETS.every(p => Number.isInteger(p.weeks) && p.label)).toBe(true);
  });
});
