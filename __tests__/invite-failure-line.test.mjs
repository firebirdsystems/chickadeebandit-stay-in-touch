import { describe, it, expect } from "vitest";
import { inviteFailureLine } from "../src/logic.js";

const err = (props, message = "hub text") => Object.assign(new Error(message), props);

// The hub's answers, from external-contacts-protocol.ts: 403 adult gate, 429 monthly
// quota, 409 for every refusal inviteExternalContact throws, 502 a failed send.
describe("inviteFailureLine", () => {
  it("gives the refusals a person can act on a line of their own", () => {
    expect(inviteFailureLine(err({ status: 403 }, "Only adults can manage external contacts"))).toBe("Only adults can add reminder emails.");
    expect(inviteFailureLine(err({ status: 429 }, "Monthly email limit reached"))).toBe("The household has reached this month’s email limit.");
    expect(inviteFailureLine(err({ status: 409 }, "This address has unsubscribed from this household"))).toBe("That address has unsubscribed from this household’s emails.");
    expect(inviteFailureLine(err({ status: 409 }, "External contact limit reached (100)"))).toBe("The household has reached its limit of external contacts. Remove one that is no longer needed first.");
    expect(inviteFailureLine(err({ status: 409 }, "External contact record limit reached (500); remove old contacts before inviting another")))
      .toBe("The household has reached its limit of external contacts. Remove one that is no longer needed first.");
  });
  it("decides a 409 by its code first", () => {
    expect(inviteFailureLine(err({ status: 409, code: "unsubscribed" }, "x"))).toBe("That address has unsubscribed from this household’s emails.");
    expect(inviteFailureLine(err({ status: 409, code: "contact_limit" }, "x"))).toBe("The household has reached its limit of external contacts. Remove one that is no longer needed first.");
    expect(inviteFailureLine(err({ status: 409, code: "contact_changed" }, "This contact changed while the invite was being refreshed; retry")))
      .toBe("Couldn’t send the confirmation email — try again.");
    // The code wins over the text.
    expect(inviteFailureLine(err({ status: 409, code: "contact_changed" }, "unsubscribed limit"))).toBe("Couldn’t send the confirmation email — try again.");
  });
  // An older hub answered 409 with no code for every throw of its invite.
  it("asks for a retry on a codeless 409 that names neither refusal (a racing invite, a database failure)", () => {
    expect(inviteFailureLine(err({ status: 409 }, "This contact changed while the invite was being refreshed; retry")))
      .toBe("Couldn’t send the confirmation email — try again.");
    expect(inviteFailureLine(err({ status: 409 }, "D1_ERROR: boom"))).toBe("Couldn’t send the confirmation email — try again.");
  });
  it("asks for a retry when the send failed or nothing answered", () => {
    for (const e of [err({ status: 502 }, "Resend: boom"), err({ status: 500 }, "Failed to add contact"), err({ status: 400 }, "A valid email is required"), new TypeError("Failed to fetch")]) {
      expect(inviteFailureLine(e)).toBe("Couldn’t send the confirmation email — try again.");
    }
  });
  it("never shows the hub's text", () => {
    expect(inviteFailureLine(err({ status: 502 }, "Resend: boom"))).not.toMatch(/Resend/);
  });
});
