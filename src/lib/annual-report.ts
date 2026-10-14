import type { ClassStatusSession } from "./class-status.js";
import { forecastSession, type SessionStat } from "./report-forecast.js";

export interface AnnualSelloutRow {
  productId: string;
  name: string;
  date: string;
  dateDisplay: string;
  /** maxSeats × ACH price. Same ceiling as the weekly report's maxRevenue. */
  fullSellout: number;
  actual: number;
  gap: number;
}

export interface AnnualSelloutReport {
  year: string;
  rows: AnnualSelloutRow[];
  totalFullSellout: number;
  totalActual: number;
  totalGap: number;
}

function asSessionStat(session: ClassStatusSession, today: string): SessionStat {
  return {
    productId: session.productId,
    date: session.date,
    dateDisplay: session.dateDisplay,
    location: session.location,
    maxSeats: session.maxSeats,
    sold: session.sold,
    remaining: session.remaining,
    isPast: session.date < today,
    achCount: session.achCount,
    cardCount: session.cardCount,
    achRevenue: 0,
    cardRevenue: 0,
    revenue: session.revenue,
    refundCount: 0,
    refundAmount: 0,
    priceAchAmount: session.priceAchAmount,
    priceCardAmount: null,
  };
}

/**
 * Full-sellout revenue, actual revenue, and the gap, for every class in a year.
 * Uses forecastSession so the ceiling matches the weekly PDF (ACH price, or $950
 * when a class has no ACH price). Past classes still use a full room, not actuals.
 */
export function annualSelloutReport(
  sessions: ClassStatusSession[],
  year: string,
  today: string,
): AnnualSelloutReport {
  const rows = sessions
    .filter((session) => session.date.startsWith(`${year}-`))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((session) => {
      const forecast = forecastSession(asSessionStat(session, today));
      return {
        productId: session.productId,
        name: session.name,
        date: session.date,
        dateDisplay: session.dateDisplay,
        fullSellout: forecast.maxRevenue,
        actual: forecast.actual,
        gap: forecast.maxRevenue - forecast.actual,
      };
    });

  const totalFullSellout = rows.reduce((sum, row) => sum + row.fullSellout, 0);
  const totalActual = rows.reduce((sum, row) => sum + row.actual, 0);
  return {
    year,
    rows,
    totalFullSellout,
    totalActual,
    totalGap: totalFullSellout - totalActual,
  };
}

function escapeCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function annualReportCsv(report: AnnualSelloutReport): string {
  const lines = ["Class,Date,Full sellout,Actual revenue,Gap"];
  for (const row of report.rows) {
    lines.push(
      [row.dateDisplay || row.name, row.date, String(row.fullSellout), String(row.actual), String(row.gap)]
        .map(escapeCell)
        .join(","),
    );
  }
  lines.push(
    ["Total", "", String(report.totalFullSellout), String(report.totalActual), String(report.totalGap)].join(","),
  );
  return lines.join("\r\n");
}

export function annualReportFilename(year: string): string {
  return `annual-report-${year}.csv`;
}
