import { connectLambda, getStore } from "@netlify/blobs";
import {
  isClassStatusDocument,
  type ClassStatusDocument,
} from "../../../src/lib/class-status.js";

const STORE_NAME = "workshop-admin";
const DOCUMENT_KEY = "class-status";

type BlobsLambdaEvent = {
  blobs: string;
  headers: Record<string, string>;
};

type ClassStore = {
  get: (key: string, options: { type: "json" }) => Promise<unknown>;
  setJSON: (key: string, data: ClassStatusDocument) => Promise<unknown>;
};

function missingUncachedEdgeUrl(err: unknown): boolean {
  return err instanceof Error && err.name === "BlobsConsistencyError";
}

/**
 * Strong consistency needs uncachedEdgeURL. Legacy function invocations on this
 * site only configure the cached edge URL, and that read throws before any
 * request. Eventual consistency uses the URL that is present.
 */
async function withClassStore<T>(event: BlobsLambdaEvent, run: (store: ClassStore) => Promise<T>): Promise<T> {
  connectLambda(event);
  try {
    return await run(getStore({ name: STORE_NAME, consistency: "strong" }));
  } catch (err) {
    if (!missingUncachedEdgeUrl(err)) throw err;
    return run(getStore({ name: STORE_NAME, consistency: "eventual" }));
  }
}

export async function readClassStatus(event: BlobsLambdaEvent): Promise<ClassStatusDocument | null> {
  const raw = await withClassStore(event, (store) => store.get(DOCUMENT_KEY, { type: "json" }));
  if (!isClassStatusDocument(raw)) return null;
  return raw;
}

export async function writeClassStatus(
  event: BlobsLambdaEvent,
  doc: ClassStatusDocument,
): Promise<void> {
  await withClassStore(event, (store) => store.setJSON(DOCUMENT_KEY, doc));
}
