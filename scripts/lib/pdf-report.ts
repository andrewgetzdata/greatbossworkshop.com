/**
 * Pure PDF rendering for the weekly report — pdfkit + report types only, no
 * Stripe/Resend, so it's unit-testable and importable without side effects.
 *
 * Design follows the EOS Great Boss brand: Montserrat typography, navy/orange
 * primary + navy-gray / blue-gray / peach secondary, all-caps section headings
 * with an orange accent bar, restrained "less is more" layout.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import PDFDocument from "pdfkit";
import type { ReportSession } from "./report-types.js";
import {
  computeTotals,
  forecastSession,
  monthlyCumulative,
  DEFAULT_FILL_RATE,
} from "../../src/lib/report-forecast.js";

// EOS brand palette (no gold, no invented hues).
const NAVY = "#142233";
const ORANGE = "#FF7900";
const NAVY_GRAY = "#445777";
const BLUE_GRAY = "#E5E8EB";
const PEACH = "#FBEDE2";
const INK = "#1a1a1a";
const MUTED = "#6b7280";

const MARGIN = 50;

// Montserrat font faces (registered on the doc; fall back to Helvetica if absent).
const FONTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../assets/fonts");
const FONT_FILES: Record<string, string> = {
  Mont: "Montserrat-Regular.ttf",
  "Mont-Med": "Montserrat-Medium.ttf",
  "Mont-Semi": "Montserrat-SemiBold.ttf",
  "Mont-Bold": "Montserrat-Bold.ttf",
  "Mont-XBold": "Montserrat-ExtraBold.ttf",
};

const usd = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

type Doc = InstanceType<typeof PDFDocument>;

// Resolved font names — Montserrat when embedded, else Helvetica equivalents.
let F = {
  regular: "Helvetica",
  medium: "Helvetica",
  semi: "Helvetica-Bold",
  bold: "Helvetica-Bold",
  xbold: "Helvetica-Bold",
};

function registerFonts(doc: Doc) {
  const have = existsSync(join(FONTS_DIR, FONT_FILES["Mont"]));
  if (!have) return; // keep Helvetica fallback
  for (const [name, file] of Object.entries(FONT_FILES)) {
    doc.registerFont(name, join(FONTS_DIR, file));
  }
  F = { regular: "Mont", medium: "Mont-Med", semi: "Mont-Semi", bold: "Mont-Bold", xbold: "Mont-XBold" };
}

/** All-caps section heading with the brand's orange accent bar to its left. */
function sectionHeading(doc: Doc, text: string, x: number, y: number) {
  doc.rect(x, y + 1, 4, 13).fill(ORANGE);
  doc
    .fillColor(NAVY)
    .font(F.xbold)
    .fontSize(11)
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
      .font(F.semi)
      .fontSize(7.5)
      .text(t.label.toUpperCase(), tx + 10, y + 10, { width: w - 20, characterSpacing: 0.5 });
    doc
      .fillColor(t.accent ? ORANGE : NAVY)
      .font(F.bold)
      .fontSize(14)
      .text(t.value, tx + 10, y + 26, { width: w - 20, lineBreak: false, ellipsis: true });
  });
  return y + height;
}

/**
 * Cumulative monthly YTD revenue line chart. Actual (past) months = solid
 * orange; projected (future) months = navy-gray dashed. One y-axis, recessive
 * gridlines, minimal labels.
 */
function ytdLineChart(
  doc: Doc,
  points: ReturnType<typeof monthlyCumulative>,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const padL = 46;
  const padB = 16;
  const plotX = x + padL;
  const plotY = y;
  const plotW = width - padL;
  const plotH = height - padB;
  const max = Math.max(1, ...points.map((p) => p.cumulative));

  const px = (i: number) => plotX + (i / (points.length - 1)) * plotW;
  const py = (v: number) => plotY + plotH - (v / max) * plotH;

  // gridlines + y labels (0, mid, max)
  doc.font(F.regular).fontSize(7).fillColor(MUTED);
  [0, 0.5, 1].forEach((frac) => {
    const gy = plotY + plotH - frac * plotH;
    doc.moveTo(plotX, gy).lineTo(plotX + plotW, gy).lineWidth(0.5).strokeColor(BLUE_GRAY).stroke();
    doc.fillColor(MUTED).text(usd(max * frac), x, gy - 4, { width: padL - 6, align: "right" });
  });

  // month labels (x axis)
  points.forEach((p, i) => {
    if (i % 2 === 0) doc.fillColor(MUTED).fontSize(6.5).text(p.label, px(i) - 8, plotY + plotH + 4, { width: 16, align: "center" });
  });

  // Split into actual (solid orange) and projected (navy-gray dashed) segments.
  // The projected line continues from the last actual point for continuity.
  const lastActual = [...points].reverse().find((p) => !p.isProjected);
  const lastActualIdx = lastActual ? points.indexOf(lastActual) : -1;

  // actual segment
  if (lastActualIdx >= 0) {
    doc.strokeColor(ORANGE).lineWidth(2);
    points.slice(0, lastActualIdx + 1).forEach((p, i) => {
      const X = px(i);
      const Y = py(p.cumulative);
      if (i === 0) doc.moveTo(X, Y);
      else doc.lineTo(X, Y);
    });
    doc.stroke();
  }

  // projected segment (dashed), starting at the last actual point
  const projStart = Math.max(0, lastActualIdx);
  if (projStart < points.length - 1) {
    doc.strokeColor(NAVY_GRAY).lineWidth(1.5).dash(3, { space: 2 });
    for (let i = projStart; i < points.length; i++) {
      const X = px(i);
      const Y = py(points[i].cumulative);
      if (i === projStart) doc.moveTo(X, Y);
      else doc.lineTo(X, Y);
    }
    doc.stroke().undash();
  }

  // end-of-year value label
  const end = points[points.length - 1];
  doc.font(F.bold).fontSize(8).fillColor(NAVY_GRAY).text(usd(end.cumulative), px(points.length - 1) - 40, py(end.cumulative) - 12, { width: 44, align: "right" });

  // legend
  const ly = y + height + 8;
  doc.rect(plotX, ly + 3, 14, 2).fill(ORANGE);
  doc.fillColor(MUTED).font(F.regular).fontSize(7.5).text("Actual", plotX + 18, ly);
  doc.rect(plotX + 62, ly + 3, 14, 2).fill(NAVY_GRAY);
  doc.fillColor(MUTED).text("Projected", plotX + 80, ly);
  return ly + 14;
}

/**
 * Merged session table: Date · Seats Sold · Seats Remaining · Actual · Projected.
 * Even fixed columns, navy header, zebra rows, most-recent-first.
 */
function sessionTable(doc: Doc, sessions: ReportSession[], x: number, y: number, width: number) {
  const cols = [
    { header: "Date", w: 0.30, align: "left" as const },
    { header: "Sold", w: 0.14, align: "left" as const },
    { header: "Remaining", w: 0.18, align: "left" as const },
    { header: "Actual", w: 0.19, align: "right" as const },
    { header: "Projected", w: 0.19, align: "right" as const },
  ];
  const xs: number[] = [];
  let acc = x;
  for (const c of cols) {
    xs.push(acc);
    acc += c.w * width;
  }
  const rowH = 19;

  doc.rect(x, y, width, 18).fill(NAVY);
  cols.forEach((c, i) => {
    doc.fillColor("white").font(F.semi).fontSize(7.5).text(c.header.toUpperCase(), xs[i] + 6, y + 5, {
      width: c.w * width - 12,
      align: c.align,
      characterSpacing: 0.4,
    });
  });
  let ry = y + 18;

  sessions.forEach((s, idx) => {
    if (idx % 2 === 1) doc.rect(x, ry, width, rowH).fill(BLUE_GRAY);
    const f = forecastSession(s);
    const low = !s.isPast && s.remaining <= 5;
    const cells: Array<{ t: string; color: string; bold?: boolean }> = [
      { t: s.dateDisplay, color: INK, bold: true },
      { t: String(s.sold), color: NAVY_GRAY },
      { t: s.isPast ? "—" : `${s.remaining} of ${s.maxSeats}`, color: low ? ORANGE : NAVY_GRAY, bold: low },
      { t: usd(s.revenue), color: NAVY },
      { t: usd(f.expected), color: NAVY_GRAY },
    ];
    cols.forEach((c, i) => {
      doc
        .fillColor(cells[i].color)
        .font(cells[i].bold ? F.semi : F.regular)
        .fontSize(8.5)
        .text(cells[i].t, xs[i] + 6, ry + 5, { width: c.w * width - 12, align: c.align, lineBreak: false, ellipsis: true });
    });
    ry += rowH;
  });
  return ry;
}

/** Cover sheet. */
function renderCover(doc: Doc, sessions: ReportSession[], generatedOn: string) {
  const pageW = doc.page.width - MARGIN * 2;
  const currentYear = generatedOn.slice(0, 4);
  const todayMonth = parseInt(generatedOn.slice(5, 7), 10);
  const ytd = sessions.filter((s) => s.date.startsWith(currentYear));
  const totals = computeTotals(ytd);

  // Header band
  doc.rect(0, 0, doc.page.width, 96).fill(NAVY);
  doc.rect(0, 96, doc.page.width, 4).fill(ORANGE);
  doc.fillColor("white").font(F.xbold).fontSize(23).text("GREAT BOSS WORKSHOP", MARGIN, 30, { characterSpacing: 1 });
  doc.fillColor("#cbd5e1").font(F.medium).fontSize(11).text(`WEEKLY REPORT  ·  ${generatedOn}`, MARGIN, 64, { characterSpacing: 1 });

  let y = 126;
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
  y += 20;

  // Forecast tiles
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
  y += 20;

  // Revenue YTD — cumulative monthly line
  y = sectionHeading(doc, "Revenue YTD", MARGIN, y) + 10;
  const points = monthlyCumulative(ytd, currentYear, todayMonth);
  y = ytdLineChart(doc, points, MARGIN, y, pageW, 120) + 14;

  // Merged session table (most-recent-first)
  y = sectionHeading(doc, "Sessions", MARGIN, y) + 8;
  const ordered = [...sessions].sort((a, b) => b.date.localeCompare(a.date));
  sessionTable(doc, ordered, MARGIN, y, pageW);
}

/** One session block (half a page): summary tiles + 3-column paid-attendee names. */
function renderSessionBlock(doc: Doc, s: ReportSession, x: number, y: number, width: number, height: number) {
  doc.roundedRect(x, y, width, 34, 6).fill(NAVY);
  doc.rect(x, y + 6, 4, 22).fill(ORANGE);
  doc.fillColor("white").font(F.bold).fontSize(13).text(s.dateDisplay, x + 14, y + 7, { width: width - 28 });
  doc
    .fillColor("#cbd5e1")
    .font(F.medium)
    .fontSize(8)
    .text(`${s.location.toUpperCase()}  ·  ${s.isPast ? "COMPLETED" : "UPCOMING"}`, x + 14, y + 23, { width: width - 28, characterSpacing: 0.5 });

  let by = y + 44;
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

  const paid = s.attendees.filter((a) => a.status === "paid");
  by = sectionHeading(doc, `Attendees — ${paid.length} Paid`, x, by) + 8;

  if (paid.length === 0) {
    doc.fillColor(MUTED).font(F.regular).fontSize(9).text("No paid attendees yet.", x, by);
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
    doc
      .fillColor(INK)
      .font(F.regular)
      .fontSize(9)
      .text(`•  ${a.name || "—"}`, x + col * colW, by + row * lineH, { width: colW - 8, lineBreak: false, ellipsis: true });
  });

  if (paid.length > shown.length) {
    doc.fillColor(MUTED).font(F.regular).fontSize(8).text(`+ ${paid.length - shown.length} more`, x, by + rowsPerCol * lineH + 2);
  }
}

export function renderPdf(sessions: ReportSession[], generatedOn: string): Promise<Buffer> {
  const doc = new PDFDocument({ size: "LETTER", margin: MARGIN });
  registerFonts(doc);

  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const pageW = doc.page.width - MARGIN * 2;
  const contentTop = MARGIN;
  const contentBottom = doc.page.height - MARGIN;
  const blockGap = 24;
  const blockH = (contentBottom - contentTop - blockGap) / 2;

  renderCover(doc, sessions, generatedOn);

  sessions.forEach((s, i) => {
    const slot = i % 2;
    if (slot === 0) doc.addPage();
    const y = contentTop + slot * (blockH + blockGap);
    renderSessionBlock(doc, s, MARGIN, y, pageW, blockH);
    if (slot === 0 && i < sessions.length - 1) {
      doc.moveTo(MARGIN, contentTop + blockH + blockGap / 2).lineTo(MARGIN + pageW, contentTop + blockH + blockGap / 2).lineWidth(0.5).strokeColor(BLUE_GRAY).stroke();
    }
  });

  doc.end();
  return done;
}
