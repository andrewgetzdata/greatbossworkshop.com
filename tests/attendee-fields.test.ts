import { describe, it, expect } from "vitest";
import { parseAttendeeFields, toMetadata, ROLE_DESC_MAX } from "../src/lib/attendee-fields";

// A complete, valid form submission (implementer = yes branch).
function validInput() {
  return {
    firstName: "Jane",
    lastName: "Doe",
    company: "Acme Co",
    jobTitle: "COO",
    roleDesc: "Runs operations",
    hasImplementer: "yes",
    implementerName: "Roy Getz",
  };
}

// parseAttendeeFields is the gate between untrusted form input and the Stripe
// metadata write. It must reject missing required fields, keep only the branch
// field that matches the yes/no answer, and never let roleDesc exceed the
// metadata value cap.
describe("parseAttendeeFields", () => {
  it("accepts a complete submission and trims whitespace", () => {
    const r = parseAttendeeFields({ ...validInput(), firstName: "  Jane  " });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.fields.firstName).toBe("Jane");
  });

  it("rejects when a required field is missing", () => {
    const r = parseAttendeeFields({ ...validInput(), company: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContain("company");
  });

  it("rejects an invalid hasImplementer value", () => {
    const r = parseAttendeeFields({ ...validInput(), hasImplementer: "maybe" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContain("hasImplementer");
  });

  it("keeps implementerName only when hasImplementer=yes", () => {
    const r = parseAttendeeFields({ ...validInput(), hasImplementer: "yes", implementerName: "Roy" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.fields.implementerName).toBe("Roy");
      expect(r.fields.wantsMoreInfo).toBe("");
    }
  });

  it("keeps wantsMoreInfo only when hasImplementer=no (drops implementerName)", () => {
    const r = parseAttendeeFields({
      ...validInput(),
      hasImplementer: "no",
      implementerName: "ShouldBeDropped",
      wantsMoreInfo: "yes",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.fields.implementerName).toBe("");
      expect(r.fields.wantsMoreInfo).toBe("yes");
    }
  });

  it("truncates roleDesc to the metadata cap", () => {
    const long = "x".repeat(ROLE_DESC_MAX + 100);
    const r = parseAttendeeFields({ ...validInput(), roleDesc: long });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.fields.roleDesc.length).toBe(ROLE_DESC_MAX);
  });

  it("ignores non-string input types safely", () => {
    const r = parseAttendeeFields({ ...validInput(), firstName: 123, jobTitle: null });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContain("firstName");
      expect(r.errors).toContain("jobTitle");
    }
  });
});

// toMetadata maps to the exact attendee_* keys the export reads back. The key
// names are a contract with the CSV builder, so pin them.
describe("toMetadata", () => {
  it("maps every field to its attendee_ key", () => {
    const r = parseAttendeeFields(validInput());
    if (!r.ok) throw new Error("fixture should be valid");
    const m = toMetadata(r.fields);
    expect(m).toEqual({
      attendee_first_name: "Jane",
      attendee_last_name: "Doe",
      attendee_company: "Acme Co",
      attendee_job_title: "COO",
      attendee_role_desc: "Runs operations",
      attendee_has_implementer: "yes",
      attendee_implementer_name: "Roy Getz",
      attendee_wants_more_info: "",
    });
  });
});
