import { readClassStatus } from "./lib/class-status-store.js";
import {
  toAdminAttendees,
  toAdminSessionList,
  type ClassStatusDocument,
} from "../../src/lib/class-status.js";
import { adminKeyMatches } from "../../src/lib/workshop-webhook.js";

function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function todayUtc(): string {
  return new Date().toISOString().split("T")[0];
}

export async function handleAttendeesRequest(
  event: {
    httpMethod: string;
    queryStringParameters: Record<string, string | undefined> | null;
  },
  deps: {
    readClassStatus: () => Promise<ClassStatusDocument | null>;
    today?: () => string;
    adminKey?: string;
  },
) {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  const expected = deps.adminKey ?? process.env.ADMIN_API_KEY;
  const provided = event.queryStringParameters?.key;
  if (!adminKeyMatches(expected, provided)) {
    return json(401, { error: "Unauthorized" });
  }

  const doc = await deps.readClassStatus();
  const today = (deps.today ?? todayUtc)();
  const productId = event.queryStringParameters?.product;

  if (!productId) {
    return json(200, toAdminSessionList(doc, today));
  }

  const result = toAdminAttendees(doc, productId);
  if (result.kind === "missing") {
    return json(200, { ready: false, attendees: [], totalAttendees: 0 });
  }
  if (result.kind === "unknown") {
    return json(404, { error: "Session not found" });
  }
  return json(200, result.body);
}

export async function handler(event: {
  httpMethod: string;
  headers: Record<string, string>;
  queryStringParameters: Record<string, string | undefined> | null;
  blobs: string;
}) {
  return handleAttendeesRequest(event, {
    readClassStatus: () => readClassStatus(event),
  });
}
