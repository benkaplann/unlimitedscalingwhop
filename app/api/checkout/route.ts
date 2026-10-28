import { WhopClient } from "@whop/sdk";
import { unstable_cache } from "next/cache";
import { calculateTopUp, isValidAmount, isValidFeePercent } from "@/lib/top-up";
import { getTopUpPlan } from "@/lib/whop-plans";

export const runtime = "nodejs";

// Share successful plan lookups across requests and function cold starts. Credentials
// stay inside the resolver; the cache contains only the public plan ID for this price.
const resolvePlanId = unstable_cache(async (accountId: string, productId: string, amount: number, feePercent: number, forceUsd: boolean) => {
  const whop = new WhopClient({ token: process.env.WHOP_API_KEY! });
  const plan = await getTopUpPlan(whop, accountId, productId, calculateTopUp(amount, feePercent), forceUsd);
  return plan.id;
}, ["top-up-adaptive-checkout-v4"], { revalidate: 300 });

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Enter a valid JSON request body." }, { status: 400 });
  }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const { amount, feePercent } = input;
  const currency = input.currency ?? "usd";
  const forceUsd = input.forceUsd ?? false;
  if (!isValidAmount(amount)) {
    return Response.json({ error: "Top-up amount must be between 100 and 500,000 in the chosen currency, with no more than two decimal places." }, { status: 400 });
  }
  if (!isValidFeePercent(feePercent)) {
    return Response.json({ error: "Ad spend fee must be between 2.5% and 5%, with no more than two decimal places." }, { status: 400 });
  }
  if (currency !== "usd" || typeof forceUsd !== "boolean") {
    return Response.json({ error: "Top-ups are priced in USD. Whop handles local-currency conversion at checkout." }, { status: 400 });
  }
  const quote = calculateTopUp(amount, feePercent);

  const token = process.env.WHOP_API_KEY;
  const accountId = process.env.WHOP_ACCOUNT_ID;
  const productId = process.env.WHOP_TOPUP_PRODUCT_ID;
  if (!token || !accountId || !productId) {
    return Response.json({ error: "Payments are temporarily unavailable. Please try again later." }, { status: 503 });
  }
  try {
    const planId = await resolvePlanId(accountId, productId, quote.amount, quote.feePercent, forceUsd);
    return Response.json({ planId, quote, forceUsd }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const err = error as { error?: { message?: string }; message?: string };
    return Response.json({ error: err?.error?.message ?? err?.message ?? "Unable to load payment options." }, { status: 502 });
  }
}
