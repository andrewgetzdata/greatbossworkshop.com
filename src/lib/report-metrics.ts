import {
  DEFAULT_FILL_RATE,
  forecastYear,
  type SessionStat,
} from "./report-forecast.js";

/** Labels the admin Report view must render for each aggregation. */
export const REPORT_LABELS = {
  totalRevenue: "Total Revenue",
  refunds: "Refunds",
  netRevenue: "Net Revenue",
  ach: "ACH",
  card: "Card",
  signups: "Signups",
  fullSellout: "Full sellout",
  projected: "Projected",
  revenuePerSession: "Revenue per Session",
  signupsPerSession: "Signups per Session",
  perSessionBreakdown: "Per-Session Breakdown",
  cumulativeAnnualRevenue: "Cumulative Annual Revenue",
  sessionRevenueSignups: "Session Revenue + Signups",
  forecastedRevenue: "Forecasted Revenue",
  expectedFillRate: "Expected Fill Rate",
} as const;

export interface SessionPaymentStats {
  achCount: number;
  cardCount: number;
  achRevenue: number;
  cardRevenue: number;
  revenue: number;
  refundCount: number;
  refundAmount: number;
}

export interface ReportRefund {
  amount: number;
}

export interface ReportMetrics {
  achRevenue: number;
  cardRevenue: number;
  totalRevenue: number;
  signups: number;
  achCount: number;
  cardCount: number;
  refundTotal: number;
  refundCount: number;
  netRevenue: number;
  fullSellout: number;
  projected: number;
  actual: number;
  selloutGap: number;
}

export interface LabeledReportCard {
  label: string;
  value: number;
  display: string;
  detail?: string;
}

export function emptySessionPaymentStats(): SessionPaymentStats {
  return {
    achCount: 0,
    cardCount: 0,
    achRevenue: 0,
    cardRevenue: 0,
    revenue: 0,
    refundCount: 0,
    refundAmount: 0,
  };
}

/**
 * Apply one completed Checkout Session to per-class payment stats.
 * Refunded checkouts add refund dollars only; booked ACH/Card revenue stays net of those.
 */
export function recordCompletedCheckout(
  stats: SessionPaymentStats,
  input: {
    isAch: boolean;
    amountDollars: number;
    isRefunded: boolean;
    refundAmountDollars?: number;
  },
): void {
  if (input.isRefunded) {
    stats.refundCount++;
    stats.refundAmount += input.refundAmountDollars ?? 0;
    return;
  }
  if (input.isAch) {
    stats.achCount++;
    stats.achRevenue += input.amountDollars;
  } else {
    stats.cardCount++;
    stats.cardRevenue += input.amountDollars;
  }
  stats.revenue += input.amountDollars;
}

export function formatReportMoney(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US")}`;
}

function sum(sessions: SessionStat[], key: keyof SessionStat): number {
  return sessions.reduce((total, session) => total + (Number(session[key]) || 0), 0);
}

/**
 * Year-level numbers behind the Report cards and forecast summary.
 * Full sellout is capacity × ACH price (same ceiling as the annual CSV), not booked revenue.
 */
export function aggregateReportMetrics(
  sessions: SessionStat[],
  refunds: ReportRefund[] = [],
  fillRate = DEFAULT_FILL_RATE,
): ReportMetrics {
  const achRevenue = sum(sessions, "achRevenue");
  const cardRevenue = sum(sessions, "cardRevenue");
  const totalRevenue = sum(sessions, "revenue");
  const refundTotal = sum(sessions, "refundAmount");
  const year = forecastYear(sessions, fillRate);

  return {
    achRevenue,
    cardRevenue,
    totalRevenue,
    signups: sum(sessions, "sold"),
    achCount: sum(sessions, "achCount"),
    cardCount: sum(sessions, "cardCount"),
    refundTotal,
    refundCount: refunds.length,
    netRevenue: totalRevenue - refundTotal,
    fullSellout: year.maxRevenue,
    projected: year.projected,
    actual: year.actual,
    selloutGap: year.maxRevenue - totalRevenue,
  };
}

export function labeledReportCards(metrics: ReportMetrics): LabeledReportCard[] {
  return [
    {
      label: REPORT_LABELS.totalRevenue,
      value: metrics.totalRevenue,
      display: formatReportMoney(metrics.totalRevenue),
      detail: `${REPORT_LABELS.ach} ${formatReportMoney(metrics.achRevenue)} · ${REPORT_LABELS.card} ${formatReportMoney(metrics.cardRevenue)}`,
    },
    {
      label: REPORT_LABELS.signups,
      value: metrics.signups,
      display: String(metrics.signups),
      detail: `${metrics.achCount} ${REPORT_LABELS.ach} · ${metrics.cardCount} ${REPORT_LABELS.card}`,
    },
    {
      label: REPORT_LABELS.refunds,
      value: metrics.refundTotal,
      display: formatReportMoney(-metrics.refundTotal),
    },
    {
      label: REPORT_LABELS.netRevenue,
      value: metrics.netRevenue,
      display: formatReportMoney(metrics.netRevenue),
    },
    {
      label: REPORT_LABELS.fullSellout,
      value: metrics.fullSellout,
      display: formatReportMoney(metrics.fullSellout),
    },
    {
      label: REPORT_LABELS.projected,
      value: metrics.projected,
      display: formatReportMoney(metrics.projected),
    },
  ];
}
