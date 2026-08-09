import { describe, it, expect } from "vitest";
import { deriveAttendeeIdentity } from "../scripts/lib/report-types";

// deriveAttendeeIdentity is the report/CSV mapping that decides an attendee's
// name + company from checkout-session data. The registration form's explicit
// first/last name is authoritative; company comes from form metadata.
describe("deriveAttendeeIdentity", () => {
  it("builds the name from form first + last, and company from metadata", () => {
    const r = deriveAttendeeIdentity({
      metadata: { attendee_first_name: "Harry", attendee_last_name: "Potter", attendee_company: "Hogwarts" },
      customerName: "H. Potter (Stripe)",
    });
    expect(r).toEqual({ name: "Harry Potter", company: "Hogwarts" });
  });

  it("falls back to the Stripe customer name when form names are absent", () => {
    const r = deriveAttendeeIdentity({ metadata: {}, customerName: "Legacy Buyer" });
    expect(r.name).toBe("Legacy Buyer");
    expect(r.company).toBe("");
  });

  it("handles only a first name", () => {
    const r = deriveAttendeeIdentity({ metadata: { attendee_first_name: "Cher" }, customerName: "ignored" });
    expect(r.name).toBe("Cher");
  });

  it("trims whitespace and tolerates null metadata", () => {
    expect(deriveAttendeeIdentity({ metadata: null, customerName: "  Jane Doe  " }).name).toBe("Jane Doe");
    const r = deriveAttendeeIdentity({
      metadata: { attendee_first_name: " Ann ", attendee_last_name: " Lee ", attendee_company: "  Acme  " },
    });
    expect(r).toEqual({ name: "Ann Lee", company: "Acme" });
  });

  it("returns empty strings when nothing is available", () => {
    expect(deriveAttendeeIdentity({ metadata: {} })).toEqual({ name: "", company: "" });
  });
});
