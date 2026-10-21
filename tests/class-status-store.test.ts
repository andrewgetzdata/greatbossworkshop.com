import { beforeEach, describe, expect, it, vi } from "vitest";

const getStore = vi.hoisted(() => vi.fn());
const connectLambda = vi.hoisted(() => vi.fn());

vi.mock("@netlify/blobs", () => ({
  connectLambda,
  getStore,
}));

import { readClassStatus } from "../netlify/functions/lib/class-status-store.js";

const event = { blobs: "", headers: {} };
const doc = { generatedAt: "2026-10-14T00:00:00.000Z", sessions: [] };

function consistencyError(): Error {
  const err = new Error(
    "Netlify Blobs has failed to perform a read using strong consistency because the environment has not been configured with a 'uncachedEdgeURL' property",
  );
  err.name = "BlobsConsistencyError";
  return err;
}

describe("class status blob read", () => {
  beforeEach(() => {
    getStore.mockReset();
    connectLambda.mockReset();
  });

  it("falls back to an eventual read when uncachedEdgeURL is missing", async () => {
    getStore.mockImplementation((options: { consistency?: string }) => ({
      get: vi.fn(async () => {
        if (options.consistency === "strong") throw consistencyError();
        return doc;
      }),
    }));

    await expect(readClassStatus(event)).resolves.toEqual(doc);
    expect(connectLambda).toHaveBeenCalledTimes(1);
    expect(getStore).toHaveBeenNthCalledWith(1, { name: "workshop-admin", consistency: "strong" });
    expect(getStore).toHaveBeenNthCalledWith(2, { name: "workshop-admin", consistency: "eventual" });
  });
});
