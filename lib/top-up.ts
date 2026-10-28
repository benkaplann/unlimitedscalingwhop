export const MIN_TOP_UP = 100;
export const MAX_TOP_UP = 500_000;
export const MIN_FEE_PERCENT = 2.5;
export const MAX_FEE_PERCENT = 5;
export type TopUpCurrency = "usd" | "eur";

export function isValidCurrency(value: unknown): value is TopUpCurrency {
  return value === "usd" || value === "eur";
}

export function isValidFeePercent(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) &&
    value >= MIN_FEE_PERCENT && value <= MAX_FEE_PERCENT &&
    Math.abs(value * 100 - Math.round(value * 100)) < 0.000001;
}

export function calculateTopUp(amount: number, feePercent: number, currency: TopUpCurrency = "usd") {
  if (!isValidAmount(amount) || !isValidFeePercent(feePercent) || !isValidCurrency(currency)) {
    throw new Error("Enter a valid top-up amount and an ad spend fee between 2.5% and 5%.");
  }
  const amountCents = Math.round(amount * 100);
  const feeBasisPoints = Math.round(feePercent * 100);
  const feeCents = Math.round(amountCents * feeBasisPoints / 10_000);
  const totalCents = amountCents + feeCents;
  return { currency, amountCents, feeBasisPoints, feeCents, totalCents,
    amount: amountCents / 100, feePercent: feeBasisPoints / 100, fee: feeCents / 100, total: totalCents / 100 };
}

export type TopUpQuote = ReturnType<typeof calculateTopUp>;

export function topUpQuoteKey(quote: TopUpQuote) {
  return `${quote.currency}-${quote.amountCents}-${quote.feeBasisPoints}`;
}

export function topUpMetadata(quote: TopUpQuote, forceUsd = false) {
  return {
    source: "topup-site", currency: quote.currency, pricing_mode: forceUsd ? "forced_usd" : "adaptive",
    topup_amount: String(quote.amount), ad_spend_fee_percent: String(quote.feePercent),
    ad_spend_fee_amount: String(quote.fee), total_amount: String(quote.total),
    ...(quote.currency === "usd" ? { topup_amount_usd: String(quote.amount) } : {}),
  };
}

export function isValidAmount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MIN_TOP_UP &&
    value <= MAX_TOP_UP &&
    Math.abs(value * 100 - Math.round(value * 100)) < 0.000001
  );
}

export function formatAmount(value: number, currency: TopUpCurrency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}
