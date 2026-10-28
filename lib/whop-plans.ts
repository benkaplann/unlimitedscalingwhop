import type { Whop, WhopClient } from "@whop/sdk";
import { getTopUpPaymentConfiguration } from "@/lib/payment-methods";
import { topUpMetadata, topUpQuoteKey, type TopUpQuote } from "@/lib/top-up";

function hasTopUpMethods(configuration: Record<string, unknown> | null, quote: TopUpQuote) {
  if (!configuration || configuration.include_platform_defaults !== false) return false;
  const expected = getTopUpPaymentConfiguration(quote);
  return ["enabled", "disabled"].every((key) => {
    const actual = configuration[key];
    const methods = expected[key as "enabled" | "disabled"];
    return Array.isArray(actual) && actual.length === methods.length && methods.every((method) => actual.includes(method));
  });
}

export function isTopUpPlanForAmount(plan: Whop.Plan, accountId: string, productId: string, quote: TopUpQuote) {
  return plan.account?.id === accountId && plan.product?.id === productId &&
    plan.currency === quote.currency && plan.plan_type === "one_time" && plan.visibility === "quick_link" &&
    plan.adaptive_pricing_enabled === false && plan.metadata?.pricing_mode === "fixed_currency" &&
    Math.round(plan.initial_price * 100) === quote.totalCents &&
    plan.metadata?.topup_amount === String(quote.amount) &&
    plan.metadata?.ad_spend_fee_percent === String(quote.feePercent) &&
    plan.metadata?.ad_spend_fee_amount === String(quote.fee) &&
    hasTopUpMethods(plan.payment_method_configuration, quote);
}

export async function getTopUpPlan(whop: WhopClient, accountId: string, productId: string, quote: TopUpQuote) {
  const configuration = getTopUpPaymentConfiguration(quote);
  const plans = await whop.plans.list({ account_id: accountId, product_ids: [productId], plan_types: ["one_time"], visibilities: ["quick_link"], first: 100 });
  for await (const plan of plans) {
    if (plan.currency !== quote.currency || Math.round(plan.initial_price * 100) !== quote.totalCents ||
      plan.metadata?.topup_amount !== String(quote.amount) ||
      plan.metadata?.ad_spend_fee_percent !== String(quote.feePercent) ||
      plan.metadata?.ad_spend_fee_amount !== String(quote.fee) || plan.metadata?.pricing_mode !== "fixed_currency") continue;
    if (hasTopUpMethods(plan.payment_method_configuration, quote) && plan.adaptive_pricing_enabled === false) return plan;
    // This product belongs only to this site's top-ups; other products are untouched.
    return whop.plans.update({ id: plan.id, adaptive_pricing_enabled: false, payment_method_configuration: configuration });
  }
  return whop.plans.create({
    account_id: accountId, product_id: productId, currency: quote.currency, initial_price: quote.total,
    adaptive_pricing_enabled: false, plan_type: "one_time", title: "Ad spend top-up", visibility: "quick_link",
    unlimited_stock: true, payment_method_configuration: configuration, metadata: topUpMetadata(quote),
  }, { idempotencyKey: `unlimited-scaling-topup-${topUpQuoteKey(quote)}-fixed-currency-v5` });
}
