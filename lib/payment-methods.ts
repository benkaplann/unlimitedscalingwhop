import type { Whop } from "@whop/sdk";
import type { TopUpQuote } from "@/lib/top-up";

// Whop's current SEPA limit is €20,000 for the full charge, including the fee.
export const MAX_SEPA_TOTAL_CENTS = 2_000_000;
const allMethods: Whop.PaymentMethodTypes[] = [
  "us_bank_account", "bank_wire", "sepa_debit", "eu_bank_transfer", "card", "crypto", "us_bank_transfer",
];

export function getTopUpPaymentMethods(quote: TopUpQuote): Whop.PaymentMethodTypes[] {
  if (quote.currency === "usd") return ["us_bank_account", "bank_wire"];
  return quote.totalCents <= MAX_SEPA_TOTAL_CENTS
    ? ["sepa_debit", "eu_bank_transfer"]
    : ["eu_bank_transfer"];
}

export function getTopUpPaymentConfiguration(quote: TopUpQuote) {
  const enabled = getTopUpPaymentMethods(quote);
  return { enabled, disabled: allMethods.filter((method) => !enabled.includes(method)), include_platform_defaults: false };
}
