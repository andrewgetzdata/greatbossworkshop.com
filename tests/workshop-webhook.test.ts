import { describe, expect, it, vi } from "vitest";
import {
  classStatusRebuildUrl,
  dispatchWorkshopWebhook,
  webhookRebuildsClassStatus,
} from "../src/lib/workshop-webhook";
import { handleRebuildRequest } from "../src/lib/rebuild-request";

describe("dispatchWorkshopWebhook", () => {
  it("sends the confirmation email before triggering the rebuild", async () => {
    const order: string[] = [];
    let releaseEmail: () => void = () => {};
    const emailGate = new Promise<void>((resolve) => {
      releaseEmail = resolve;
    });

    const pending = dispatchWorkshopWebhook(
      { type: "checkout.session.completed", data: { object: { id: "cs_1" } } },
      {
        onCheckoutCompleted: async () => {
          order.push("email");
          await emailGate;
        },
        triggerClassStatusRebuild: async () => {
          order.push("rebuild");
        },
      },
    );

    await Promise.resolve();
    expect(order).toEqual(["email"]);
    releaseEmail();
    await pending;
    expect(order).toEqual(["email", "rebuild"]);
  });

  it("does not rebuild when the confirmation email throws", async () => {
    const order: string[] = [];
    await expect(
      dispatchWorkshopWebhook(
        { type: "checkout.session.completed", data: { object: { id: "cs_1" } } },
        {
          onCheckoutCompleted: async () => {
            order.push("email");
            throw new Error("smtp down");
          },
          triggerClassStatusRebuild: async () => {
            order.push("rebuild");
          },
        },
      ),
    ).rejects.toThrow("smtp down");
    expect(order).toEqual(["email"]);
  });

  it("still acknowledges the webhook when the rebuild trigger fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await dispatchWorkshopWebhook(
      { type: "checkout.session.completed", data: { object: { id: "cs_1" } } },
      {
        onCheckoutCompleted: async () => {},
        triggerClassStatusRebuild: async () => {
          throw new Error("background unreachable");
        },
      },
    );
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("rebuilds on refunds and product changes without sending email", async () => {
    let emails = 0;
    let rebuilds = 0;
    const deps = {
      onCheckoutCompleted: async () => {
        emails += 1;
      },
      triggerClassStatusRebuild: async () => {
        rebuilds += 1;
      },
    };

    for (const type of ["charge.refunded", "product.created", "product.updated"]) {
      await dispatchWorkshopWebhook({ type, data: { object: { id: "obj_1" } } }, deps);
    }
    await dispatchWorkshopWebhook(
      { type: "checkout.session.async_payment_succeeded", data: { object: { id: "cs_ach" } } },
      deps,
    );

    expect(emails).toBe(0);
    expect(rebuilds).toBe(3);
    expect(webhookRebuildsClassStatus("charge.refunded")).toBe(true);
    expect(webhookRebuildsClassStatus("checkout.session.async_payment_failed")).toBe(false);
  });
});

describe("classStatusRebuildUrl", () => {
  it("uses the request host and does not put a secret in the path", () => {
    expect(
      classStatusRebuildUrl({ host: "greatbossworkshop.com", forwardedProto: "https" }),
    ).toBe("https://greatbossworkshop.com/.netlify/functions/rebuild-class-status-background");
    expect(classStatusRebuildUrl({ host: "localhost:8888" })).toBe(
      "http://localhost:8888/.netlify/functions/rebuild-class-status-background",
    );
    expect(
      classStatusRebuildUrl({ deployPrimeUrl: "https://deploy-preview.netlify.app/" }),
    ).toBe("https://deploy-preview.netlify.app/.netlify/functions/rebuild-class-status-background");
    expect(classStatusRebuildUrl({})).toBeNull();
  });
});

describe("handleRebuildRequest", () => {
  it("rejects a missing key without scanning", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    let ran = false;
    const res = await handleRebuildRequest(
      { httpMethod: "POST", headers: {}, queryStringParameters: {} },
      {
        adminKey: "secret",
        rebuild: async () => {
          ran = true;
        },
      },
    );
    expect(res.statusCode).toBe(401);
    expect(ran).toBe(false);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("runs the rebuild once for the header key or the query key", async () => {
    let runs = 0;
    const rebuild = async () => {
      runs += 1;
    };

    const byHeader = await handleRebuildRequest(
      { httpMethod: "POST", headers: { "X-Admin-Key": "secret" } },
      { adminKey: "secret", rebuild },
    );
    const byQuery = await handleRebuildRequest(
      { httpMethod: "GET", queryStringParameters: { key: "secret" } },
      { adminKey: "secret", rebuild },
    );

    expect(byHeader.statusCode).toBe(202);
    expect(byQuery.statusCode).toBe(202);
    expect(runs).toBe(2);
  });
});
