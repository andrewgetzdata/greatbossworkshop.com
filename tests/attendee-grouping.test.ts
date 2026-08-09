import { describe, it, expect } from "vitest";
import { groupAttendeesByCompany, groupedAttendeeLines } from "../src/lib/attendee-grouping";

// Attendees are grouped by employer (company A→Z), then by name within each
// company. Blank companies fall under "No company", sorted last.
describe("groupAttendeesByCompany", () => {
  it("groups by company alphabetically, names sorted within", () => {
    const groups = groupAttendeesByCompany([
      { name: "Zoe Vale", company: "Beta LLC" },
      { name: "Amy Cole", company: "Beta LLC" },
      { name: "Ben Ito", company: "Acme Co" },
    ]);
    expect(groups.map((g) => g.company)).toEqual(["Acme Co", "Beta LLC"]);
    expect(groups[1].members).toEqual(["Amy Cole", "Zoe Vale"]);
  });

  it("is case-insensitive for both company and name ordering", () => {
    const groups = groupAttendeesByCompany([
      { name: "bob", company: "acme" },
      { name: "Ada", company: "Acme" },
    ]);
    // Both fall under the first-seen 'acme' key; names case-insensitively sorted
    expect(groups[0].members).toEqual(["Ada", "bob"]);
  });

  it("puts blank companies under 'No company', sorted last", () => {
    const groups = groupAttendeesByCompany([
      { name: "Solo Sam", company: "" },
      { name: "Corp Cara", company: "Zeta" },
    ]);
    expect(groups[groups.length - 1].company).toBe("No company");
  });

  it("replaces blank names with a dash", () => {
    const groups = groupAttendeesByCompany([{ name: "", company: "Acme" }]);
    expect(groups[0].members).toEqual(["—"]);
  });
});

// groupedAttendeeLines renders "Name — Company" per line, in grouped order,
// and omits the company for the "No company" bucket.
describe("groupedAttendeeLines", () => {
  it("formats Name — Company and preserves group/name order", () => {
    const lines = groupedAttendeeLines([
      { name: "Zoe Vale", company: "Beta LLC" },
      { name: "Ben Ito", company: "Acme Co" },
      { name: "Amy Cole", company: "Beta LLC" },
    ]);
    expect(lines).toEqual([
      "Ben Ito — Acme Co",
      "Amy Cole — Beta LLC",
      "Zoe Vale — Beta LLC",
    ]);
  });

  it("omits the company label for blank companies", () => {
    const lines = groupedAttendeeLines([{ name: "Solo Sam", company: "" }]);
    expect(lines).toEqual(["Solo Sam"]);
  });
});
