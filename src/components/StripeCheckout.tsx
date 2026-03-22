import { useState } from "react";

interface StripeCheckoutProps {
  achPrice: number;
  cardPrice: number;
  workshopTitle: string;
}

export default function StripeCheckout({
  achPrice,
  cardPrice,
}: StripeCheckoutProps) {
  const [loading, setLoading] = useState<"ach" | "card" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const formatPrice = (amount: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(amount);

  const handleCheckout = async (method: "ach" | "card") => {
    setLoading(method);
    setError(null);

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
    } catch {
      setError(
        "Something went wrong. Please try again or contact us for assistance."
      );
      setLoading(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "1rem", width: "100%" }}>
        <button
          onClick={() => handleCheckout("ach")}
          disabled={loading !== null}
          style={{
            minHeight: "44px",
            padding: "1rem 1.5rem",
            fontSize: "1.125rem",
            fontWeight: 700,
            color: "#fff",
            backgroundColor: loading === "ach" ? "#cc6100" : "#FF7900",
            border: "none",
            borderRadius: "0.5rem",
            cursor: loading !== null ? "wait" : "pointer",
            opacity: loading !== null && loading !== "ach" ? 0.7 : 1,
            boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
            transition: "background-color 0.2s, box-shadow 0.2s",
            flex: "1 1 auto",
            maxWidth: "320px",
          }}
          onMouseEnter={(e) => { if (!loading) e.currentTarget.style.backgroundColor = "#FF9933"; }}
          onMouseLeave={(e) => { if (!loading) e.currentTarget.style.backgroundColor = "#FF7900"; }}
        >
          {loading === "ach"
            ? "Redirecting..."
            : `Pay ${formatPrice(achPrice)} by Bank Transfer`}
        </button>

        <button
          onClick={() => handleCheckout("card")}
          disabled={loading !== null}
          style={{
            minHeight: "44px",
            padding: "1rem 1.5rem",
            fontSize: "1.125rem",
            fontWeight: 700,
            color: "#fff",
            backgroundColor: "transparent",
            border: "2px solid #fff",
            borderRadius: "0.5rem",
            cursor: loading !== null ? "wait" : "pointer",
            opacity: loading !== null && loading !== "card" ? 0.7 : 1,
            boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
            transition: "background-color 0.2s, box-shadow 0.2s",
            flex: "1 1 auto",
            maxWidth: "320px",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
        >
          {loading === "card"
            ? "Redirecting..."
            : `Pay ${formatPrice(cardPrice)} by Card`}
        </button>
      </div>

      {error && (
        <p style={{ width: "100%", textAlign: "center", fontSize: "0.875rem", color: "#fca5a5" }}>
          {error}
        </p>
      )}
    </div>
  );
}
