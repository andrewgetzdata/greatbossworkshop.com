import { describe, expect, it, vi } from "vitest";
import { decideRefund, handleRefundRequest, isAlreadyRefundedError, type RefundableCharge } from "../src/lib/refund-request";

function charge(partial: Partial<RefundableCharge> = {}): RefundableCharge {
  return {
    workshopProduct: "prod_june",
    paymentIntentId: "pi_1",
    paymentIntentStatus: "succeeded",
    chargeAmount: 95000,
    amountRefunded: 0,
    fullyRefunded: false,
    ...partial,
  };
}

describe("decideRefund", () => {
  it("refunds the payment intent without treating a partial refund as finished", () => {
    expect(decideRefund(charge({ amountRefunded: 1000 }))).toEqual({ action: "refund", paymentIntentId: "pi_1" });
  });

  it("stops when the charge is already fully refunded or canceled", () => {
    expect(decideRefund(charge({ fullyRefunded: true })).action).toBe("already_refunded");
    expect(decideRefund(charge({ amountRefunded: 95000 })).action).toBe("already_refunded");
    expect(decideRefund(charge({ paymentIntentStatus: "canceled" }))).toMatchObject({ status: 409 });
    expect(decideRefund(charge({ workshopProduct: null }))).toMatchObject({ status: 404 });
  });
});

describe("handleRefundRequest", () => {
  const event = {
    httpMethod: "POST",
    queryStringParameters: { key: "secret" },
    body: JSON.stringify({ checkoutSessionId: "cs_test_1" }),
  };

  it("creates a refund with no amount, then rebuilds the class-status document", async () => {
    const createRefund = vi.fn(async (_paymentIntentId: string, _idempotencyKey: string) => {});
    const rebuild = vi.fn(async () => {});
    const res = await handleRefundRequest(event, {
      adminKey: "secret",
      retrieve: async () => charge(),
      createRefund,
      rebuild,
    });

    expect(createRefund).toHaveBeenCalledOnce();
    expect(createRefund.mock.calls[0][0]).toBe("pi_1");
    expect(createRefund.mock.calls[0][1]).toBe("workshop-refund-cs_test_1");
    expect(rebuild).toHaveBeenCalledOnce();
    expect(JSON.parse(res.body)).toMatchObject({ ok: true, alreadyRefunded: false, refreshed: true });
  });

  it("does not create a second refund when Stripe says it is already refunded", async () => {
    const createRefund = vi.fn(async () => {});
    const rebuild = vi.fn(async () => {});
    const res = await handleRefundRequest(event, {
      adminKey: "secret",
      retrieve: async () => charge({ fullyRefunded: true }),
      createRefund,
      rebuild,
    });
    expect(createRefund).not.toHaveBeenCalled();
    expect(rebuild).toHaveBeenCalledOnce();
    expect(JSON.parse(res.body).alreadyRefunded).toBe(true);
  });

  it("treats Stripe's charge_already_refunded error as a clean result and still rebuilds", async () => {
    const rebuild = vi.fn(async () => {});
    const res = await handleRefundRequest(event, {
      adminKey: "secret",
      retrieve: async () => charge(),
      createRefund: async () => {
        throw { code: "charge_already_refunded" };
      },
      rebuild,
    });
    expect(isAlreadyRefundedError({ code: "charge_already_refunded" })).toBe(true);
    expect(rebuild).toHaveBeenCalledOnce();
    expect(JSON.parse(res.body).alreadyRefunded).toBe(true);
  });

  it("rejects a missing admin key before looking up the payment", async () => {
    let lookups = 0;
    const denied = await handleRefundRequest(
      { ...event, queryStringParameters: { key: "nope" } },
      {
        adminKey: "secret",
        retrieve: async () => {
          lookups += 1;
          return charge();
        },
        createRefund: async () => {},
        rebuild: async () => {},
      },
    );
    expect(denied.statusCode).toBe(401);
    expect(lookups).toBe(0);
  });
});
