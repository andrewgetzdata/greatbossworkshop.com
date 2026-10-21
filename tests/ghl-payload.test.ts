import { describe, it, expect } from "vitest";
import { buildGhlPurchasePayload, type GhlSessionInput } from "../src/lib/ghl-payload";

function session(overrides: Partial<GhlSessionInput> = {}): GhlSessionInput {
  return {
    id: "cs_test_123",
    customer_details: { email: "jane@acme.co", phone: "+16145551212" },
    metadata: {
      workshop_product: "prod_1",
      workshop_session_date: "2026-11-05",
      attendee_first_name: "Jane",
      attendee_last_name: "Doe",
      attendee_company: "Acme Co",
      attendee_job_title: "COO",
      attendee_role_desc: "Runs ops",
      attendee_has_implementer: "yes",
      attendee_implementer_name: "Roy Getz",
    },
    ...overrides,
  };
}

describe("buildGhlPurchasePayload", () => {
  it("maps attendee, contact, and workshop session data", () => {
    const p = buildGhlPurchasePayload(session());
    expect(p).toMatchObject({
      first_name: "Jane",
      email: "jane@acme.co",
      phone: "+16145551212",
      company: "Acme Co",
      workshop_session_date: "2026-11-05",
    });
  });

  it("includes the Stripe order id and the event date, not the purchase date", () => {
    const p = buildGhlPurchasePayload(session(), "Great Boss Workshop");
    expect(p.event_name).toBe("Great Boss Workshop");
    expect(p.stripe_checkout_session_id).toBe("cs_test_123");
    expect(p.workshop_session_date).toBe("2026-11-05");
    expect(Object.keys(p).join(",")).not.toMatch(/purchase/);
  });

  it("falls back to customer_email and empty strings when data is missing", () => {
    const p = buildGhlPurchasePayload(
      session({ customer_details: null, customer_email: "fallback@x.co", metadata: null })
    );
    expect(p.email).toBe("fallback@x.co");
    expect(p.phone).toBe("");
    expect(p.first_name).toBe("");
  });

  it("sends exactly the agreed field list", () => {
    expect(Object.keys(buildGhlPurchasePayload(session(), "GBW"))).toEqual([
      "event",
      "stripe_checkout_session_id",
      "first_name",
      "last_name",
      "email",
      "phone",
      "company",
      "job_title",
      "role_description",
      "event_name",
      "workshop_session_date",
      "stripe_product_id",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
    ]);
  });

  it("omits billing address, payment, and amount fields", () => {
    const keys = Object.keys(buildGhlPurchasePayload(session())).join(",");
    expect(keys).not.toMatch(
      /address1|address2|city|state|postal|country|amount|currency|payment_|card|bank/
    );
  });
});
