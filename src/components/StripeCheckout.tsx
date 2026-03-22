import { useState } from "react";

interface StripeCheckoutProps {
  achPrice: number;
  cardPrice: number;
  workshopTitle: string;
}

export default function StripeCheckout({
  achPrice,
  cardPrice,
  workshopTitle,
}: StripeCheckoutProps) {
  const [loading, setLoading] = useState<"ach" | "card" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const formatPrice = (cents: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(cents);

  const handleCheckout = async (method: "ach" | "card") => {
    setLoading(method);
    setError(null);

    // PostHog tracking
    if (typeof window !== "undefined" && (window as any).posthog) {
      (window as any).posthog.capture("checkout_started", {
        method,
        price: method === "ach" ? achPrice : cardPrice,
      });
    }

    try {
      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethod: method }),
      });

      if (!res.ok) {
        throw new Error("Failed to create checkout session");
      }

      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      setError(
        "Something went wrong. Please try again or contact us for assistance."
      );
      setLoading(null);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
      <button
        onClick={() => handleCheckout("ach")}
        disabled={loading !== null}
        className="w-full rounded-lg bg-eos-gold px-6 py-4 text-lg font-bold text-eos-navy shadow-lg transition hover:bg-yellow-500 hover:shadow-xl disabled:cursor-wait disabled:opacity-70 sm:w-auto"
        style={{ minHeight: "44px" }}
      >
        {loading === "ach"
          ? "Redirecting..."
          : `Pay ${formatPrice(achPrice)} by Bank Transfer`}
      </button>

      <button
        onClick={() => handleCheckout("card")}
        disabled={loading !== null}
        className="w-full rounded-lg border-2 border-white bg-transparent px-6 py-4 text-lg font-bold text-white shadow-lg transition hover:bg-white/10 hover:shadow-xl disabled:cursor-wait disabled:opacity-70 sm:w-auto"
        style={{ minHeight: "44px" }}
      >
        {loading === "card"
          ? "Redirecting..."
          : `Pay ${formatPrice(cardPrice)} by Card`}
      </button>

      {error && (
        <p className="w-full text-center text-sm text-red-300">{error}</p>
      )}
    </div>
  );
}
