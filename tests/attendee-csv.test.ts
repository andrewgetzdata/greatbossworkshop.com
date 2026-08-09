import { describe, it, expect } from "vitest";
import { buildAttendeeRow, toCsv, CSV_COLUMNS, type SessionLike, type ProductLike } from "../src/lib/attendee-csv";

const product: ProductLike = { id: "prod_1", name: "Great Boss Workshop" };

function session(overrides: Partial<SessionLike> = {}): SessionLike {
  return {
    metadata: {
      workshop_session_display: "August 19, 2026",
      workshop_session_date: "2026-08-19",
      attendee_company: "Acme Co",
      attendee_first_name: "Jane",
      attendee_last_name: "Doe",
      attendee_job_title: "COO",
      attendee_role_desc: "Runs operations",
      attendee_has_implementer: "yes",
      attendee_implementer_name: "Roy Getz",
      attendee_wants_more_info: "",
    },
    customer_details: {
      email: "jane@acme.co",
      phone: "+16145551212",
      address: { line1: "1 Main St", city: "Columbus", state: "OH", postal_code: "43215", country: "US" },
    },
    ...overrides,
  };
}

// buildAttendeeRow stitches three sources into one row: form fields from
// metadata, contact from Stripe's native customer_details, event from product.
describe("buildAttendeeRow", () => {
  it("maps metadata, customer_details, and product into a full record", () => {
    const r = buildAttendeeRow(session(), product);
    expect(r.eventId).toBe("prod_1");
    expect(r.eventName).toBe("Great Boss Workshop");
    expect(r.dateAttending).toBe("August 19, 2026");
    expect(r.firstName).toBe("Jane");
    expect(r.lastName).toBe("Doe");
    expect(r.company).toBe("Acme Co");
    expect(r.email).toBe("jane@acme.co");
    expect(r.phone).toBe("+16145551212");
    expect(r.homeCity).toBe("Columbus");
    expect(r.homeZip).toBe("43215");
    expect(r.hasImplementer).toBe("yes");
    expect(r.implementerName).toBe("Roy Getz");
  });

  it("falls back to session date and customer_email, tolerates missing address", () => {
    const r = buildAttendeeRow(
      session({
        metadata: { workshop_session_date: "2026-08-19", attendee_first_name: "A" },
        customer_details: { email: null },
        customer_email: "fallback@x.com",
      }),
      product
    );
    expect(r.dateAttending).toBe("2026-08-19"); // display missing → raw date
    expect(r.email).toBe("fallback@x.com"); // customer_details.email null → customer_email
    expect(r.homeCity).toBe(""); // no address → blank, no throw
  });

  it("blanks fields when metadata is null", () => {
    const r = buildAttendeeRow({ metadata: null, customer_details: null }, product);
    expect(r.firstName).toBe("");
    expect(r.email).toBe("");
    expect(r.eventId).toBe("prod_1");
  });
});

// toCsv must be RFC-4180 safe — a role description with a comma, quote, or
// newline would otherwise corrupt the column layout when opened in Excel.
describe("toCsv", () => {
  it("emits a header row plus one row per record", () => {
    const csv = toCsv([buildAttendeeRow(session(), product)]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toContain("Date Attending");
    expect(lines[0].split(",").length).toBe(CSV_COLUMNS.length);
    expect(lines.length).toBe(2);
  });

  it("quotes and escapes commas, quotes, and newlines", () => {
    const r = buildAttendeeRow(
      session({
        metadata: {
          workshop_session_display: "Aug 19",
          attendee_role_desc: 'Ops, "growth", and\nstrategy',
          attendee_first_name: "Jane",
        },
      }),
      product
    );
    const csv = toCsv([r]);
    // comma+quote+newline field must be wrapped in quotes with doubled inner quotes
    expect(csv).toContain('"Ops, ""growth"", and\nstrategy"');
    // header column count is unchanged (no stray commas leaking)
    expect(csv.split("\r\n")[0].split(",").length).toBe(CSV_COLUMNS.length);
  });

  it("handles an empty record list (header only)", () => {
    const csv = toCsv([]);
    expect(csv.split("\r\n").length).toBe(1);
  });
});
