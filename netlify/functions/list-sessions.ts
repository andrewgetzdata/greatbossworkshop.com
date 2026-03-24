import { getWorkshopSessions, type WorkshopSession } from "./lib/stripe.js";

// In-memory cache (persists across warm invocations on Netlify)
let cachedResponse: string | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 3_600_000; // 1 hour

function toPublicSession(s: WorkshopSession) {
  return {
    productId: s.productId,
    date: s.date,
    dateDisplay: s.dateDisplay,
    time: s.time,
    location: s.location,
    venue: s.venue,
    address: s.address,
    mapsUrl: s.mapsUrl,
    webinarUrl: s.webinarUrl,
    isOnline: s.isOnline,
    remaining: s.remaining,
    maxSeats: s.maxSeats,
    soldOut: s.soldOut,
    status: s.status,
    priceAchAmount: s.priceAchAmount ? s.priceAchAmount / 100 : null,
    priceCardAmount: s.priceCardAmount ? s.priceCardAmount / 100 : null,
  };
}

export async function handler(event: {
  httpMethod: string;
  queryStringParameters: Record<string, string | undefined> | null;
}) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const forceFresh = event.queryStringParameters?.fresh === "1";
  const now = Date.now();
  const cacheAge = now - cacheTimestamp;

  // Serve from cache if fresh (unless ?fresh=1 is requested)
  if (!forceFresh && cachedResponse && cacheAge < CACHE_TTL_MS) {
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=30",
        "X-Cache": "HIT",
        "X-Cache-Age": String(Math.round(cacheAge / 1000)),
      },
      body: cachedResponse,
    };
  }

  try {
    const sessions = await getWorkshopSessions();
    const publicSessions = sessions.map(toPublicSession);
    const body = JSON.stringify({ sessions: publicSessions });

    // Update cache
    cachedResponse = body;
    cacheTimestamp = now;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=30",
        "X-Cache": "MISS",
      },
      body,
    };
  } catch (err) {
    // If fetch fails but we have stale cache, serve it
    if (cachedResponse) {
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=10",
          "X-Cache": "STALE",
        },
        body: cachedResponse,
      };
    }

    console.error("Failed to list sessions:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to load sessions" }),
    };
  }
}
