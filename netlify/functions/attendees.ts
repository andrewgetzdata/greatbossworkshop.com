import { readClassStatus } from "./lib/class-status-store.js";
import {
  isClassStatusDocument,
  toAdminAttendees,
  toAdminSessionList,
  type ClassStatusDocument,
} from "../../src/lib/class-status.js";
import { annualReportCsv, annualReportFilename, annualSelloutReport } from "../../src/lib/annual-report.js";
import { classAttendeeFilename, toClassAttendeeCsv } from "../../src/lib/class-attendee-csv.js";
import { adminKeyMatches } from "../../src/lib/workshop-webhook.js";

type HandlerResult = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

function json(statusCode: number, body: unknown): HandlerResult {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function csv(statusCode: number, filename: string, body: string): HandlerResult {
  return {
    statusCode,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
    body,
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
  const format = event.queryStringParameters?.format;
  const productId = event.queryStringParameters?.product;

  if (format === "annual") {
    if (!isClassStatusDocument(doc)) return json(200, { ready: false });
    const year = event.queryStringParameters?.year || today.slice(0, 4);
    if (!/^\d{4}$/.test(year)) return json(400, { error: "Invalid year" });
    const report = annualSelloutReport(doc.sessions, year, today);
    return csv(200, annualReportFilename(year), annualReportCsv(report));
  }

  if (!productId) {
    return json(200, toAdminSessionList(doc, today));
  }

  if (format === "csv") {
    if (!isClassStatusDocument(doc)) return json(200, { ready: false });
    const session = doc.sessions.find((item) => item.productId === productId);
    if (!session) return json(404, { error: "Session not found" });
    return csv(200, classAttendeeFilename(session), toClassAttendeeCsv(session));
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
