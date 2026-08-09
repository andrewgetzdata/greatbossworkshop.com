/**
 * Pure PDF rendering for the weekly report — pdfkit + report types only, no
 * Stripe/Resend, so it's unit-testable and importable without side effects.
 *
 * Design follows the EOS Great Boss brand: navy/orange primary + navy-gray and
 * light blue-gray secondary, all-caps section headings with an orange accent
 * bar, and restrained "less is more" layout. Charts use the palette only.
 */
import PDFDocument from "pdfkit";
import type { ReportSession } from "./report-types.js";
import { computeTotals, forecastSession, DEFAULT_FILL_RATE } from "../../src/lib/report-forecast.js";

// EOS brand palette (no gold, no invented hues).
const NAVY = "#142233";
const ORANGE = "#FF7900";
const NAVY_GRAY = "#445777";
const BLUE_GRAY = "#E5E8EB";
const PEACH = "#FBEDE2";
const INK = "#1a1a1a";
const MUTED = "#6b7280";

const MARGIN = 50;

const usd = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

type Doc = InstanceType<typeof PDFDocument>;

/** All-caps section heading with the brand's orange accent bar to its left. */
function sectionHeading(doc: Doc, text: string, x: number, y: number) {
  doc.rect(x, y + 1, 4, 14).fill(ORANGE);
  doc
    .fillColor(NAVY)
    .font("Helvetica-Bold")
    .fontSize(12)
    .text(text.toUpperCase(), x + 12, y, { characterSpacing: 0.5 });
  return doc.y;
}

/** A row of evenly-sized metric tiles. */
function metricTiles(
  doc: Doc,
  tiles: Array<{ label: string; value: string; accent?: boolean }>,
  x: number,
  y: number,
  totalWidth: number,
  height = 58
) {
  const gap = 10;
  const w = (totalWidth - gap * (tiles.length - 1)) / tiles.length;
  tiles.forEach((t, i) => {
    const tx = x + i * (w + gap);
    doc.roundedRect(tx, y, w, height, 6).fill(t.accent ? PEACH : BLUE_GRAY);
    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(8)
      .text(t.label.toUpperCase(), tx + 10, y + 10, { width: w - 20, characterSpacing: 0.5 });
    doc
      .fillColor(t.accent ? ORANGE : NAVY)
      .font("Helvetica-Bold")
      .fontSize(15)
      .text(t.value, tx + 10, y + 26, { width: w - 20, lineBreak: false, ellipsis: true });
  });
  return y + height;
}

/**
 * Horizontal bar chart of a single measure per label (magnitude → bars).
 * Orange bars on white, recessive axis, values direct-labeled. Print-legible.
 */
function barChart(
  doc: Doc,
  rows: Array<{ label: string; value: number; sub?: string }>,
  x: number,
  y: number,
  width: number
) {
  if (rows.length === 0) return y;
  const labelW = 92;
  const valueW = 64;
  const trackX = x + labelW;
  const trackW = width - labelW - valueW;
  const rowH = 20;
  const barH = 10;
  const max = Math.max(1, ...rows.map((r) => r.value));

  rows.forEach((r, i) => {
    const ry = y + i * rowH;
    // label
    doc
      .fillColor(INK)
      .font("Helvetica")
      .fontSize(8.5)
      .text(r.label, x, ry + 2, { width: labelW - 6, lineBreak: false, ellipsis: true });
    // track
    doc.roundedRect(trackX, ry + 1, trackW, barH, 3).fill(BLUE_GRAY);
    // bar (rounded end, anchored left)
    const bw = Math.max(3, (r.value / max) * trackW);
    doc.roundedRect(trackX, ry + 1, bw, barH, 3).fill(ORANGE);
    // value label
    doc
      .fillColor(NAVY)
      .font("Helvetica-Bold")
      .fontSize(8.5)
      .text(r.sub || usd(r.value), trackX + trackW + 6, ry + 2, { width: valueW, lineBreak: false });
  });
  return y + rows.length * rowH;
}

/** Cover sheet. */
function renderCover(doc: Doc, sessions: ReportSession[], generatedOn: string) {
  const pageW = doc.page.width - MARGIN * 2;
  const currentYear = generatedOn.slice(0, 4);
  const ytd = sessions.filter((s) => s.date.startsWith(currentYear));
  const totals = computeTotals(ytd);
  const upcoming = sessions.filter((s) => !s.isPast).sort((a, b) => a.date.localeCompare(b.date));

  // Header band
  doc.rect(0, 0, doc.page.width, 96).fill(NAVY);
  doc.rect(0, 96, doc.page.width, 4).fill(ORANGE);
  doc.fillColor("white").font("Helvetica-Bold").fontSize(24).text("GREAT BOSS WORKSHOP", MARGIN, 30, { characterSpacing: 1 });
  doc.fillColor("#cbd5e1").font("Helvetica").fontSize(11).text(`WEEKLY REPORT  ·  ${generatedOn}`, MARGIN, 62, { characterSpacing: 1 });

  let y = 128;
  y = sectionHeading(doc, `${currentYear} Year-to-Date`, MARGIN, y) + 8;

  y = metricTiles(
    doc,
    [
      { label: "Net Revenue", value: usd(totals.netRevenue), accent: true },
      { label: "Gross Revenue", value: usd(totals.totalRevenue) },
      { label: "Seats Sold", value: String(totals.totalSold) },
      { label: "Refunds", value: `-${usd(totals.refundTotal)}` },
    ],
    MARGIN,
    y,
    pageW
  );
  y += 22;

  // Forecast
  y = sectionHeading(doc, "Forecast", MARGIN, y) + 8;
  y = metricTiles(
    doc,
    [
      { label: `Projected ${currentYear} (at ${DEFAULT_FILL_RATE}% fill)`, value: usd(totals.cumExpected), accent: true },
      { label: "Maximum if every seat sells", value: usd(totals.cumMax) },
    ],
    MARGIN,
    y,
    pageW
  );
  y += 22;

  // Revenue-by-session chart (YTD, most recent first)
  const chartRows = ytd
    .filter((s) => s.revenue > 0)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8)
    .map((s) => ({ label: s.dateDisplay, value: s.revenue }));
  if (chartRows.length > 0) {
    y = sectionHeading(doc, "Revenue by Session", MARGIN, y) + 10;
    y = barChart(doc, chartRows, MARGIN, y, pageW) + 20;
  }

  // Upcoming events — even columns
  y = sectionHeading(doc, "Upcoming Events", MARGIN, y) + 8;
  if (upcoming.length === 0) {
    doc.fillColor(MUTED).font("Helvetica-Oblique").fontSize(10).text("No upcoming events scheduled.", MARGIN, y);
  } else {
    upcomingTable(doc, upcoming, MARGIN, y, pageW);
  }
}

/** Fixed-column upcoming-events table (evenly aligned). */
function upcomingTable(doc: Doc, upcoming: ReportSession[], x: number, y: number, width: number) {
  const cols = [
    { key: "date", header: "Date", w: 0.34 },
    { key: "seats", header: "Seats Left", w: 0.22 },
    { key: "sold", header: "Sold", w: 0.14 },
    { key: "projected", header: "Projected", w: 0.30 },
  ] as const;
  const xs: number[] = [];
  let acc = x;
  for (const c of cols) {
    xs.push(acc);
    acc += c.w * width;
  }
  const rowH = 20;

  // header
  doc.rect(x, y, width, 18).fill(NAVY);
  cols.forEach((c, i) => {
    doc.fillColor("white").font("Helvetica-Bold").fontSize(8).text(c.header.toUpperCase(), xs[i] + 6, y + 5, { width: c.w * width - 12, characterSpacing: 0.5 });
  });
  let ry = y + 18;

  upcoming.forEach((s, idx) => {
    if (idx % 2 === 1) doc.rect(x, ry, width, rowH).fill(BLUE_GRAY);
    const f = forecastSession(s);
    const low = s.remaining <= 5;
    const vals = [
      { t: s.dateDisplay, color: INK, bold: true },
      { t: `${s.remaining} of ${s.maxSeats}`, color: low ? ORANGE : NAVY_GRAY, bold: low },
      { t: String(s.sold), color: NAVY_GRAY, bold: false },
      { t: usd(f.expected), color: NAVY_GRAY, bold: false },
    ];
    cols.forEach((c, i) => {
      doc
        .fillColor(vals[i].color)
        .font(vals[i].bold ? "Helvetica-Bold" : "Helvetica")
        .fontSize(9)
        .text(vals[i].t, xs[i] + 6, ry + 5, { width: c.w * width - 12, lineBreak: false, ellipsis: true });
    });
    ry += rowH;
  });
}

/** One session block (half a page): summary tiles + 3-column paid-attendee names. */
function renderSessionBlock(doc: Doc, s: ReportSession, x: number, y: number, width: number, height: number) {
  // Block header bar
  doc.roundedRect(x, y, width, 34, 6).fill(NAVY);
  doc.rect(x, y + 6, 4, 22).fill(ORANGE);
  doc.fillColor("white").font("Helvetica-Bold").fontSize(13).text(s.dateDisplay, x + 14, y + 6, { width: width - 120 });
  doc
    .fillColor("#cbd5e1")
    .font("Helvetica")
    .fontSize(8.5)
    .text(`${s.location.toUpperCase()}  ·  ${s.isPast ? "COMPLETED" : "UPCOMING"}`, x + 14, y + 22, { width: width - 28, characterSpacing: 0.5 });

  let by = y + 44;

  // Summary tiles
  by = metricTiles(
    doc,
    [
      { label: "Seats", value: `${s.sold}/${s.maxSeats}` },
      { label: "Left", value: String(s.remaining) },
      { label: "Revenue", value: usd(s.revenue) },
      { label: "ACH/Card", value: `${s.achCount}/${s.cardCount}` },
    ],
    x,
    by,
    width,
    46
  );
  by += 16;

  // Attendees — names only, 3 columns
  const paid = s.attendees.filter((a) => a.status === "paid");
  by = sectionHeading(doc, `Attendees — ${paid.length} Paid`, x, by) + 8;

  if (paid.length === 0) {
    doc.fillColor(MUTED).font("Helvetica-Oblique").fontSize(9).text("No paid attendees yet.", x, by);
    return;
  }

  const colCount = 3;
  const colW = width / colCount;
  const lineH = 14;
  const bottom = y + height - 8;
  const rowsPerCol = Math.max(1, Math.floor((bottom - by) / lineH));
  const capacity = rowsPerCol * colCount;
  const shown = paid.slice(0, capacity);

  shown.forEach((a, i) => {
    const col = Math.floor(i / rowsPerCol);
    const row = i % rowsPerCol;
    const cx = x + col * colW;
    const cy = by + row * lineH;
    doc
      .fillColor(INK)
      .font("Helvetica")
      .fontSize(9)
      .text(`•  ${a.name || "—"}`, cx, cy, { width: colW - 8, lineBreak: false, ellipsis: true });
  });

  if (paid.length > shown.length) {
    doc
      .fillColor(MUTED)
      .font("Helvetica-Oblique")
      .fontSize(8)
      .text(`+ ${paid.length - shown.length} more`, x, by + rowsPerCol * lineH + 2);
  }
}

export function renderPdf(sessions: ReportSession[], generatedOn: string): Promise<Buffer> {
  const doc = new PDFDocument({ size: "LETTER", margin: MARGIN });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const pageW = doc.page.width - MARGIN * 2;
  const contentTop = MARGIN;
  const contentBottom = doc.page.height - MARGIN;
  const blockGap = 24;
  const blockH = (contentBottom - contentTop - blockGap) / 2;

  renderCover(doc, sessions, generatedOn);

  // Session blocks, two per page, most-recent-first.
  sessions.forEach((s, i) => {
    const slot = i % 2;
    if (slot === 0) doc.addPage();
    const y = contentTop + slot * (blockH + blockGap);
    renderSessionBlock(doc, s, MARGIN, y, pageW, blockH);
    // divider between the two blocks
    if (slot === 0 && i < sessions.length - 1) {
      doc.moveTo(MARGIN, contentTop + blockH + blockGap / 2).lineTo(MARGIN + pageW, contentTop + blockH + blockGap / 2).lineWidth(0.5).strokeColor(BLUE_GRAY).stroke();
    }
  });

  doc.end();
  return done;
}
