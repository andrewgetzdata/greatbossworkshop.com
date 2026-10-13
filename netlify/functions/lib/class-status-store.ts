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

function openStore(event: BlobsLambdaEvent) {
  // Legacy Netlify functions do not configure Blobs automatically.
  // connectLambda reads the site token Netlify attaches to the invocation.
  connectLambda(event);
  return getStore({ name: STORE_NAME, consistency: "strong" });
}

export async function readClassStatus(event: BlobsLambdaEvent): Promise<ClassStatusDocument | null> {
  const raw = await openStore(event).get(DOCUMENT_KEY, { type: "json" });
  if (!isClassStatusDocument(raw)) return null;
  return raw;
}

export async function writeClassStatus(
  event: BlobsLambdaEvent,
  doc: ClassStatusDocument,
): Promise<void> {
  await openStore(event).setJSON(DOCUMENT_KEY, doc);
}
