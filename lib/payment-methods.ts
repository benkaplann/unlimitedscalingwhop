import type { Whop } from "@whop/sdk";

// These are merchant preferences, not a custom list of checkout buttons.
// Whop still filters its rendered methods by account, currency and buyer eligibility.
export const topUpPaymentMethods: Whop.PaymentMethodTypes[] = [
  "sepa_debit",
  "eu_bank_transfer",
  "bank_wire",
  "us_bank_account",
];

export const topUpPaymentConfiguration = {
  enabled: topUpPaymentMethods,
  disabled: ["card", "crypto", "us_bank_transfer"] as Whop.PaymentMethodTypes[],
  include_platform_defaults: false,
};
