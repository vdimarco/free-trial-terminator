import type { PriceInterval } from "./types.js";

export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency || "USD"}`;
  }
}

export function formatPrice(
  amount: number | null,
  currency: string,
  interval: PriceInterval,
): string {
  if (amount == null) return "Price not found";
  const money = formatMoney(amount, currency || "USD");
  if (interval === "month") return `${money}/month`;
  if (interval === "year") return `${money}/year`;
  return money;
}

export function monthlyContribution(
  amount: number | null,
  currency: string,
  interval: PriceInterval,
): number | null {
  if (amount == null || currency !== "USD") return null;
  if (interval === "month") return amount;
  if (interval === "year") return amount / 12;
  return null;
}

export function annualContribution(
  amount: number | null,
  currency: string,
  interval: PriceInterval,
): number | null {
  if (amount == null || currency !== "USD") return null;
  if (interval === "month") return amount * 12;
  if (interval === "year") return amount;
  return null;
}
