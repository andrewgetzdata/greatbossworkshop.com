/**
 * Per-session revenue forecast, matching the admin dashboard's client-side
 * math (src/pages/admin.astro). Dependency-free for unit testing.
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
  maxRevenue: number; // maxSeats * basePrice (theoretical ceiling from zero)
  maxRemaining: number; // actual + every remaining seat sold (past: just actual)
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
  let maxRemaining: number;
  if (s.isPast) {
    expected = actual;
    maxRemaining = actual; // no remaining seats to sell
  } else {
    const remaining = s.remaining || 0;
    const sold = s.sold || 0;
    const expectedSeats = sold + Math.round(remaining * (fillRate / 100));
    expected = expectedSeats * basePrice;
    // Best case: keep what's booked and sell every remaining seat.
    maxRemaining = actual + remaining * basePrice;
  }

  return { maxRevenue, maxRemaining, expected, actual };
}

export interface YearForecast {
  perMax: number[];
  perExpected: number[];
  perActual: number[];
  cumMax: number[];
  cumExpected: number[];
  cumActual: number[];
  maxRevenue: number;
  projected: number;
  actual: number;
}

/** Sum per-session forecasts into the year-level bar and cumulative series. */
export function forecastYear(sessions: SessionStat[], fillRate = DEFAULT_FILL_RATE): YearForecast {
  const perMax: number[] = [];
  const perExpected: number[] = [];
  const perActual: number[] = [];
  const cumMax: number[] = [];
  const cumExpected: number[] = [];
  const cumActual: number[] = [];
  let maxRevenue = 0;
  let projected = 0;
  let actual = 0;

  for (const session of sessions) {
    const forecast = forecastSession(session, fillRate);
    perMax.push(forecast.maxRevenue);
    perExpected.push(forecast.expected);
    perActual.push(forecast.actual);
    maxRevenue += forecast.maxRevenue;
    projected += forecast.expected;
    actual += forecast.actual;
    cumMax.push(maxRevenue);
    cumExpected.push(projected);
    cumActual.push(actual);
  }

  return { perMax, perExpected, perActual, cumMax, cumExpected, cumActual, maxRevenue, projected, actual };
}
