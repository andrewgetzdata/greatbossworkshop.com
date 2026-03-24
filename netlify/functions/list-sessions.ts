import { getWorkshopSessions } from "./lib/stripe.js";

export async function handler(event: { httpMethod: string }) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const sessions = await getWorkshopSessions();

    // Return only what the frontend needs (no secret price IDs)
    const publicSessions = sessions.map((s) => ({
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
      soldOut: s.soldOut,
      status: s.status,
      priceAchAmount: s.priceAchAmount ? s.priceAchAmount / 100 : null,
      priceCardAmount: s.priceCardAmount ? s.priceCardAmount / 100 : null,
    }));

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=30",
      },
      body: JSON.stringify({ sessions: publicSessions }),
    };
  } catch (err) {
    console.error("Failed to list sessions:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to load sessions" }),
    };
  }
}
