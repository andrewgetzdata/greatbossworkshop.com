/**
 * Pure reporting + forecasting math for the weekly PDF, replicating the
 * admin dashboard's client-side calculations (src/pages/admin.astro) so the
 * report matches what's shown there. Dependency-free for unit testing.
 */

/** Per-session stats, mirroring the /api/report session shape (dollars). */
export interface SessionStat {
  productId: string;
  date: string; // YYYY-MM-DD
  dateDisplay: string;
  location: string;
  maxSeats: number;
  sold: number;
  remaining: number;
  isPast: boolean;
  achCount: number;
  cardCount: number;
  achRevenue: number;
  cardRevenue: number;
  revenue: number; // whole dollars, non-refunded
  refundCount: number;
  refundAmount: number; // whole dollars
  priceAchAmount: number | null; // whole dollars (base price)
  priceCardAmount: number | null;
}

/** Default fill-rate assumption for forecasting future seats (matches admin.astro). */
export const DEFAULT_FILL_RATE = 90;

export interface SessionForecast {
  maxRevenue: number; // maxSeats * basePrice
  expected: number; // past: actual revenue; future: (sold + round(remaining*fill%)) * basePrice
  actual: number; // revenue to date
}

/**
 * Forecast one session. Base price is the ACH amount (fallback 950), matching
 * the dashboard; maxSeats fallback 25. Past sessions expect their actual
 * revenue; future sessions expect sold + a fill-rate share of remaining seats.
 */
export function forecastSession(s: SessionStat, fillRate = DEFAULT_FILL_RATE): SessionForecast {
  const actual = s.revenue || 0;
  const maxSeats = s.maxSeats || 25;
  const basePrice = s.priceAchAmount || 950;
  const maxRevenue = maxSeats * basePrice;

  let expected: number;
  if (s.isPast) {
    expected = actual;
  } else {
    const remaining = s.remaining || 0;
    const sold = s.sold || 0;
    const expectedSeats = sold + Math.round(remaining * (fillRate / 100));
    expected = expectedSeats * basePrice;
  }

  return { maxRevenue, expected, actual };
}

export interface ReportTotals {
  totalRevenue: number;
  achRevenue: number;
  cardRevenue: number;
  totalSold: number;
  totalACH: number;
  totalCard: number;
  refundTotal: number;
  refundCount: number;
  netRevenue: number; // totalRevenue - refundTotal
  cumMax: number; // Σ maxRevenue
  cumExpected: number; // Σ expected — "Projected Year Total"
  cumActual: number; // Σ actual
}

/** Aggregate report totals across sessions (mirrors admin.astro report view). */
export function computeTotals(sessions: SessionStat[], fillRate = DEFAULT_FILL_RATE): ReportTotals {
  const t: ReportTotals = {
    totalRevenue: 0,
    achRevenue: 0,
    cardRevenue: 0,
    totalSold: 0,
    totalACH: 0,
    totalCard: 0,
    refundTotal: 0,
    refundCount: 0,
    netRevenue: 0,
    cumMax: 0,
    cumExpected: 0,
    cumActual: 0,
  };

  for (const s of sessions) {
    t.totalRevenue += s.revenue || 0;
    t.achRevenue += s.achRevenue || 0;
    t.cardRevenue += s.cardRevenue || 0;
    t.totalSold += s.sold || 0;
    t.totalACH += s.achCount || 0;
    t.totalCard += s.cardCount || 0;
    t.refundTotal += s.refundAmount || 0;
    t.refundCount += s.refundCount || 0;

    const f = forecastSession(s, fillRate);
    t.cumMax += f.maxRevenue;
    t.cumExpected += f.expected;
    t.cumActual += f.actual;
  }

  t.netRevenue = t.totalRevenue - t.refundTotal;
  return t;
}

/** One month's cumulative revenue point for the YTD line chart. */
export interface MonthlyPoint {
  month: number; // 1-12
  label: string; // "Jan" … "Dec"
  cumulative: number; // running total through this month
  isProjected: boolean; // true once the month is in the future
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Cumulative monthly revenue for a year: each session contributes to its
 * month (past → actual revenue, future → projected via forecastSession), then
 * months accumulate. A month is "projected" once it is after the current month
 * (todayMonth, 1-12) — that's where the chart switches from actual to forecast.
 */
export function monthlyCumulative(
  sessions: SessionStat[],
  year: string,
  todayMonth: number,
  fillRate = DEFAULT_FILL_RATE
): MonthlyPoint[] {
  const perMonth = new Array(12).fill(0);
  for (const s of sessions) {
    if (!s.date.startsWith(year)) continue;
    const m = parseInt(s.date.slice(5, 7), 10); // 1-12
    if (m < 1 || m > 12) continue;
    perMonth[m - 1] += forecastSession(s, fillRate).expected;
  }

  const points: MonthlyPoint[] = [];
  let running = 0;
  for (let m = 1; m <= 12; m++) {
    running += perMonth[m - 1];
    points.push({
      month: m,
      label: MONTH_LABELS[m - 1],
      cumulative: running,
      isProjected: m > todayMonth,
    });
  }
  return points;
}
