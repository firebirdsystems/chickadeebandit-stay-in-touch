import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { describe, it, expect } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(__dirname, "../manifest.json"), "utf-8"));
const migration = readFileSync(join(__dirname, "../migrations/001_init.sql"), "utf-8");

const VALID_STORAGE = ["kv", "db", "none"];
const VALID_AUDIENCES = ["everyone", "adults", "children"];

describe("manifest.json", () => {
  it("has required string fields", () => {
    for (const field of ["id", "name", "version", "description", "entrypoint", "runtime", "icon"]) {
      expect(manifest[field], `missing field: ${field}`).toBeTruthy();
    }
  });

  it("entrypoint is index.html", () => expect(manifest.entrypoint).toBe("index.html"));
  it("runtime is static", () => expect(manifest.runtime).toBe("static"));
  it("uses db storage", () => expect(manifest.storage).toBe("db"));
  it("version follows semver", () => expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/));

  it("is an adults-only app", () => {
    expect(VALID_AUDIENCES).toContain(manifest.permissions.default_audience);
    expect(manifest.permissions.default_audience).toBe("adults");
  });

  it("reads family.members and the contacts email export (prefill picker)", () => {
    expect(manifest.data_access.reads).toEqual(["family.members", "app.contacts.contact_emails"]);
    expect(manifest.data_access.writes).toEqual([]);
  });

  it("declares the paid capabilities the protocol consumes", () => {
    expect(manifest.required_capabilities).toEqual(["cron", "email"]);
    expect(manifest.requires_entitlement).toBeUndefined();
  });

  it("marks the queryable columns plaintext", () => {
    expect(manifest.db_plaintext_columns).toEqual(expect.arrayContaining(["active", "interval_hours"]));
  });
});

describe("inactivity_alerts protocol config", () => {
  const cfg = manifest.inactivity_alerts;

  it("is declared with all required columns", () => {
    expect(cfg).toBeTruthy();
    for (const field of [
      "table", "member_column", "id_column", "active_column", "interval_hours_column",
      "last_checkin_column", "last_alerted_column", "message_column", "recipients_column",
    ]) {
      expect(cfg[field], `missing ${field}`).toBeTruthy();
    }
  });

  it("declares an id_column so the cron stamps each connection independently", () => {
    // A member owns many connections with different cadences; per-row stamping
    // keeps their other connections due after one nudge fires.
    expect(cfg.id_column).toBe("id");
  });

  it("every configured column exists in the migration", () => {
    const prefixed = `app_stay_in_touch__${cfg.table}`;
    expect(migration).toContain(prefixed);
    const columns = [
      cfg.id_column, cfg.member_column, cfg.active_column, cfg.interval_hours_column,
      cfg.last_checkin_column, cfg.last_alerted_column, cfg.message_column,
      cfg.recipients_column, cfg.external_recipients_column,
    ];
    for (const col of columns) {
      expect(migration, `migration missing column ${col}`).toMatch(new RegExp(`^\\s+${col}\\s`, "m"));
    }
  });

  it("the connections table is owner_only so a member only sees their own list", () => {
    const policy = manifest.row_policies[cfg.table];
    expect(policy).toMatchObject({ kind: "owner_only", member_column: cfg.member_column });
    expect(policy.adults_bypass).toBe(false);
  });

  it("the touches history table is owner_only too", () => {
    expect(manifest.row_policies.touches).toMatchObject({ kind: "owner_only", member_column: "member_id", adults_bypass: false });
  });
});

describe("external contacts (double opt-in)", () => {
  const cfg = manifest.inactivity_alerts;

  it("declares the external_contacts protocol", () => {
    expect(manifest.external_contacts).toBeTruthy();
  });

  it("routes nudges to an external_recipients_column that exists in the migration", () => {
    expect(cfg.external_recipients_column).toBe("recipient_emails");
    expect(migration).toMatch(new RegExp(`^\\s+${cfg.external_recipients_column}\\s`, "m"));
  });

  it("keeps external_recipients_column distinct from the member recipients column", () => {
    expect(cfg.external_recipients_column).not.toBe(cfg.recipients_column);
  });
});

describe("ai_access exports", () => {
  it("each export has a matching SELECT-only, single-statement SQL file", () => {
    for (const name of manifest.ai_access?.db_exports ?? []) {
      const path = join(__dirname, `../src/queries/${name}.sql`);
      expect(existsSync(path), `missing src/queries/${name}.sql`).toBe(true);
      const sql = readFileSync(path, "utf-8").trim();
      expect(/^SELECT\b/i.test(sql), `${name}.sql must start with SELECT`).toBe(true);
      expect(sql.includes(";"), `${name}.sql must be a single statement`).toBe(false);
    }
  });
});
