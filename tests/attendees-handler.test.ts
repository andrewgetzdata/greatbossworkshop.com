import { describe, expect, it } from "vitest";
import { handleAttendeesRequest } from "../netlify/functions/attendees";
import {
  buildClassStatusDocument,
  type ClassStatusCheckoutInput,
  type ClassStatusDocument,
  type ClassStatusProductInput,
} from "../src/lib/class-status";

function product(partial: Partial<ClassStatusProductInput> = {}): ClassStatusProductInput {
  return {
    id: "prod_june",
    name: "June 23",
    sessionDate: "2026-06-23",
    dateDisplay: "June 23, 2026",
    location: "Columbus, OH",
    maxSeats: 40,
    priceAchCents: 95000,
    ...partial,
  };
}

function checkout(partial: Partial<ClassStatusCheckoutInput> = {}): ClassStatusCheckoutInput {
  return {
    workshopProduct: "prod_june",
    paymentIntentStatus: "succeeded",
    latestChargeRefunded: false,
    paymentMethodTypes: ["card"],
    amountTotal: 95000,
    customerName: "Ada Lovelace",
    customerEmail: "ada@example.com",
    created: Date.parse("2026-05-01T15:00:00Z") / 1000,
    ...partial,
  };
}

function request(query: Record<string, string | undefined> | null, method = "GET") {
  return { httpMethod: method, queryStringParameters: query };
}

describe("attendees handler reads the blob", () => {
  it("returns ready:false when the blob is empty and does not invent sessions", async () => {
    let reads = 0;
    const res = await handleAttendeesRequest(request({ key: "secret" }), {
      adminKey: "secret",
      today: () => "2026-05-02",
      readClassStatus: async () => {
        reads += 1;
        return null;
      },
    });

    expect(reads).toBe(1);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ready: false, sessions: [] });
  });

  it("returns sidebar rows and one class's attendees from the stored document", async () => {
    const doc: ClassStatusDocument = buildClassStatusDocument(
      [product(), product({ id: "prod_past", sessionDate: "2026-01-01", dateDisplay: "January 1" })],
      [checkout(), checkout({ workshopProduct: "prod_past", customerName: "Past" })],
      "2026-05-02T00:00:00.000Z",
    );
    const deps = {
      adminKey: "secret",
      today: () => "2026-05-02",
      readClassStatus: async () => doc,
    };

    const list = await handleAttendeesRequest(request({ key: "secret" }), deps);
    const body = JSON.parse(list.body);
    expect(body.ready).toBe(true);
    expect(body.sessions.map((session: { productId: string }) => session.productId)).toEqual([
      "prod_past",
      "prod_june",
    ]);
    expect(body.sessions[1].sold).toBe(1);

    const detail = await handleAttendeesRequest(request({ key: "secret", product: "prod_june" }), deps);
    const attendees = JSON.parse(detail.body);
    expect(attendees.attendees).toHaveLength(1);
    expect(attendees.attendees[0].email).toBe("ada@example.com");
    expect(attendees.totalAttendees).toBe(1);

    const missing = await handleAttendeesRequest(request({ key: "secret", product: "prod_nope" }), deps);
    expect(missing.statusCode).toBe(404);
  });

  it("rejects a bad password before reading the blob", async () => {
    let reads = 0;
    const res = await handleAttendeesRequest(request({ key: "nope" }), {
      adminKey: "secret",
      readClassStatus: async () => {
        reads += 1;
        return null;
      },
    });
    expect(res.statusCode).toBe(401);
    expect(reads).toBe(0);
  });
});
