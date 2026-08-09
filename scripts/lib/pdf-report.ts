/**
 * Pure PDF rendering for the weekly report — pdfkit + report types only, no
 * Stripe/Resend, so it's unit-testable and importable without side effects.
 */
import PDFDocument from "pdfkit";
import type { ReportSession } from "./report-types.js";
import { computeTotals, forecastSession, DEFAULT_FILL_RATE } from "../../src/lib/report-forecast.js";

const ORANGE = "#FF7900";
const NAVY = "#142233";
const GRAY = "#6b7280";
const LIGHT = "#f3f4f6";

const usd = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

export function renderPdf(sessions: ReportSession[], generatedOn: string): Promise<Buffer> {
  const currentYear = generatedOn.slice(0, 4);
  const ytd = sessions.filter((s) => s.date.startsWith(currentYear));
  const totals = computeTotals(ytd);
  const upcoming = sessions.filter((s) => !s.isPast).sort((a, b) => a.date.localeCompare(b.date));

  const doc = new PDFDocument({ size: "LETTER", margin: 50 });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const pageWidth = doc.page.width - 100; // inside margins

  // ---------- Cover sheet ----------
  doc.rect(0, 0, doc.page.width, 90).fill(NAVY);
  doc.fillColor("white").fontSize(22).font("Helvetica-Bold").text("Great Boss Workshop", 50, 30);
  doc.fontSize(12).font("Helvetica").fillColor("#cbd5e1").text(`Weekly Report — ${generatedOn}`, 50, 60);
  doc.fillColor("black").moveDown(3);

  doc.fontSize(16).font("Helvetica-Bold").fillColor(NAVY).text(`${currentYear} Year-to-Date`, 50, 120);
  doc.moveDown(0.5);

  // Metric tiles
  const tiles = [
    ["Net Revenue", usd(totals.netRevenue)],
    ["Gross Revenue", usd(totals.totalRevenue)],
    ["Seats Sold", String(totals.totalSold)],
    ["Refunds", `-${usd(totals.refundTotal)} (${totals.refundCount})`],
  ];
  let tx = 50;
  const tileW = pageWidth / 4 - 8;
  const tileY = doc.y + 4;
  for (const [label, val] of tiles) {
    doc.roundedRect(tx, tileY, tileW, 60, 6).fill(LIGHT);
    doc.fillColor(GRAY).fontSize(9).font("Helvetica").text(label.toUpperCase(), tx + 10, tileY + 10, { width: tileW - 20 });
    doc.fillColor(NAVY).fontSize(15).font("Helvetica-Bold").text(val, tx + 10, tileY + 28, { width: tileW - 20 });
    tx += tileW + 10;
  }
  doc.y = tileY + 80;

  // Forecast line
  doc.fillColor(NAVY).fontSize(13).font("Helvetica-Bold").text("Forecast", 50, doc.y);
  doc.moveDown(0.3);
  doc.fillColor("black").fontSize(10).font("Helvetica");
  doc.text(`Projected ${currentYear} total (past actuals + future at ${DEFAULT_FILL_RATE}% fill): ${usd(totals.cumExpected)}`);
  doc.text(`Maximum possible if every session sells out: ${usd(totals.cumMax)}`);
  doc.moveDown(1);

  // Upcoming — seats left
  doc.fillColor(NAVY).fontSize(13).font("Helvetica-Bold").text("Upcoming events — seats remaining");
  doc.moveDown(0.4);
  if (upcoming.length === 0) {
    doc.fillColor(GRAY).fontSize(10).font("Helvetica-Oblique").text("No upcoming events scheduled.");
  } else {
    for (const s of upcoming) {
      const f = forecastSession(s);
      doc.fillColor("black").fontSize(10).font("Helvetica-Bold").text(s.dateDisplay, { continued: true });
      doc
        .font("Helvetica")
        .fillColor(s.remaining <= 5 ? ORANGE : GRAY)
        .text(`   ${s.remaining} of ${s.maxSeats} seats left`, { continued: true });
      doc.fillColor(GRAY).text(`   ·   ${s.sold} sold · projected ${usd(f.expected)}`);
    }
  }

  // ---------- Per-session pages (most-recent-first) ----------
  for (const s of sessions) {
    doc.addPage();
    doc.rect(0, 0, doc.page.width, 70).fill(NAVY);
    doc.fillColor("white").fontSize(16).font("Helvetica-Bold").text(s.dateDisplay, 50, 24);
    doc.fontSize(10).font("Helvetica").fillColor("#cbd5e1").text(`${s.location}${s.isPast ? "  ·  completed" : "  ·  upcoming"}`, 50, 48);
    doc.fillColor("black").y = 90;

    // Session summary tiles
    const paid = s.attendees.filter((a) => a.status === "paid").length;
    const sInfo = [
      ["Seats", `${s.sold} / ${s.maxSeats}`],
      ["Remaining", String(s.remaining)],
      ["Revenue", usd(s.revenue)],
      ["ACH / Card", `${s.achCount} / ${s.cardCount}`],
    ];
    let sx = 50;
    const sw = pageWidth / 4 - 8;
    const sy = doc.y;
    for (const [label, val] of sInfo) {
      doc.roundedRect(sx, sy, sw, 50, 6).fill(LIGHT);
      doc.fillColor(GRAY).fontSize(8).font("Helvetica").text(label.toUpperCase(), sx + 8, sy + 8, { width: sw - 16 });
      doc.fillColor(NAVY).fontSize(13).font("Helvetica-Bold").text(val, sx + 8, sy + 22, { width: sw - 16 });
      sx += sw + 10;
    }
    doc.y = sy + 70;

    // Attendee table
    doc.fillColor(NAVY).fontSize(12).font("Helvetica-Bold").text(`Attendees (${paid} paid)`, 50, doc.y);
    doc.moveDown(0.4);

    const cols = [
      { key: "name", header: "Name", w: 130 },
      { key: "email", header: "Email", w: 170 },
      { key: "amount", header: "Amount", w: 60 },
      { key: "paymentMethod", header: "Method", w: 50 },
      { key: "status", header: "Status", w: 55 },
    ] as const;

    const drawRow = (vals: string[], opts: { header?: boolean } = {}) => {
      const y = doc.y;
      let x = 50;
      if (opts.header) doc.rect(50, y - 2, pageWidth, 16).fill(LIGHT);
      doc.font(opts.header ? "Helvetica-Bold" : "Helvetica").fontSize(8.5).fillColor(opts.header ? NAVY : "black");
      cols.forEach((c, i) => {
        doc.text(vals[i], x + 3, y + 1, { width: c.w - 6, ellipsis: true, lineBreak: false });
        x += c.w;
      });
      doc.y = y + 16;
    };

    drawRow(cols.map((c) => c.header), { header: true });
    if (s.attendees.length === 0) {
      doc.font("Helvetica-Oblique").fontSize(9).fillColor(GRAY).text("No attendees yet.", 53, doc.y + 2);
    } else {
      for (const a of s.attendees) {
        if (doc.y > doc.page.height - 60) doc.addPage();
        drawRow([
          a.name || "—",
          a.email || "—",
          usd(a.amount),
          a.paymentMethod,
          a.status,
        ]);
      }
    }
  }

  doc.end();
  return done;
}
