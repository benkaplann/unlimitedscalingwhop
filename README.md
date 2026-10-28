# Unlimited Scaling

A Next.js 15 App Router / React 19 / TypeScript ad spend top-up site. Uses Whop Elements 1.9.0 and Whop SDK 2.6.0. Whop renders the eligible payment methods from the merchant preferences in `lib/payment-methods.ts`.

The lockfile includes patched PostCSS and Zod overrides for the transitive versions shipped by Next.js 15 and Vercel's runtime utilities.

## Production

Live site: https://unlimitedscalingwhop.vercel.app

Vercel project: `unlimitedscalingwhop`, owned by **Ben Kaplan's projects** (`ben-kaplans-projects-9425f507`). The local workspace is linked to this project. Production environment variables are configured separately from the uploaded source.

The production homepage, amount validation, return page, and a Whop-signed `payment.succeeded` test delivery were verified on October 27, 2026. The test delivery returned HTTP 200. No buyer payment was charged. Balance credits still require the ledger implementation described below.

For later deployments:

```sh
vercel deploy --prod --project unlimitedscalingwhop --scope ben-kaplans-projects-9425f507
```

## Run locally

```sh
npm install
npm run dev
```

Open http://localhost:3000. Run `npm run build` for the production build, `npm start` to serve it, `npm run typecheck` for TypeScript checks, and `npm test` for the plan-selection checks. Place your final logo at `public/logo.jpeg`; a small rocket fallback is shown until that file is supplied.

## Environment

Keep secrets in `.env.local` (ignored by Git). `.env.example` lists the required names:

| Variable | Purpose |
| --- | --- |
| `WHOP_API_KEY` | Server-only Whop API credential with permission to create payments. |
| `WHOP_ACCOUNT_ID` | Your account's `biz_…` ID. Find it in **Whop Dashboard → Settings**. |
| `WHOP_TOPUP_PRODUCT_ID` | The dedicated hidden Ad Spend Top-Up product. Its amount-specific plans store this site's payment-method preferences. |
| `NEXT_PUBLIC_WHOP_ACCOUNT_ID` | The same `biz_…` ID, used by the payment elements. |
| `WHOP_WEBHOOK_SECRET` | The webhook signing secret. Server only. |
| `NEXT_PUBLIC_SITE_URL` | Site origin, `http://localhost:3000` locally or `https://<domain>` when deployed. |

Public variables are embedded at build time. Rebuild after changing them. Without the public configuration, amount selection works and the next step shows a payment setup message. No API keys or signing secrets are sent to the browser.

## Whop setup and deployment

Top-up amounts are based in USD. The preset buttons are $10k, $25k, $50k, $75k and $100k, with $10k initially selected. There is no USD/EUR selector. The ad spend fee defaults to 2.5%, accepts up to two decimal places, and allows 2.5%–5% inclusive. The fee is added to the base spend, rounded once to cents: $10,000 at 2.5% creates a $10,250 USD plan.

The payment step uses Whop Elements 1.9.0's `Checkout` / `CheckoutElement`. Unlike the lower-level `Payments` controller, this surface creates and owns a checkout session, live currency quote, eligible methods and confirmation. Default plans have **Accept local currency payments** (`adaptive_pricing_enabled: true`) enabled. Whop detects the buyer's region and handles local-currency conversion and supported-method availability; the site never substitutes a nominal EUR amount or computes its own exchange rate.

Plans enable only `eu_bank_transfer`, `sepa_debit`, `bank_wire`, and `us_bank_account`. Card, crypto and US bank transfer are explicitly disabled, and platform defaults are excluded. The current business is Unlimited Scaling (`biz_3bscA1qgC9BH6X`), with a dedicated hidden top-up product. Its catalogue reports EUR bank transfer, EUR SEPA, USD Bank Wire and USD ACH as eligible. Whop applies per-method country and amount limits to the converted charge: SEPA's €20,000 cap does not block larger checkouts from using EUR bank transfer.

The **Make USD** button sits below the payment element. It opens a distinct USD plan with adaptive pricing disabled and keeps base spend, fee and total unchanged. It never toggles adaptive pricing off on a plan another buyer may already be using. Adaptive and USD-only plans have separate metadata, idempotency keys and cache entries. Choosing a new amount starts an adaptive checkout again. Payment metadata records base spend and fee separately; only base spend should be credited as ad budget.

Create a webhook in **Dashboard → Developer → Webhooks**, select **`payment.succeeded`**, and point it to **`https://<domain>/api/webhooks/whop`**. Store its signing secret as `WHOP_WEBHOOK_SECRET`.

Deploy with `npx vercel`, configure the environment variables above in the Vercel project, set `NEXT_PUBLIC_SITE_URL` to the HTTPS deployment origin, and rebuild. Bank/wire redirects require an **HTTPS return URL**; test those on a Vercel deployment rather than localhost. Follow [Whop's payment elements guidance](https://whop.com/network/components/checkout/) for account configuration.

## Payment and balance handling

The page sends Whop's official SDK preload and connection hints and initializes the Elements provider while the amount step is visible. Once a valid amount and fee stay unchanged for 400 ms, the browser prepares their plan in the background. Continue shares that request/result. The browser and Next's Data Cache retain successful plan IDs for five minutes, keyed by account/product, exact base amount, fee and pricing mode. Payment tokens, sessions and payment results are not cached.

`/api/checkout` validates base amount, fee and the boolean `forceUsd` option, computes the USD total in integer cents, and returns the matching plan ID and USD quote. Nominal non-USD prices are rejected. Plan reuse verifies the breakdown, pricing mode and transfer-only configuration. `CheckoutElement` handles the actual payment through Whop, including any converted currency total, email and billing collection, next actions and return navigation. The return URL branches on Whop's status; webhook verification remains the fulfillment boundary.

`/api/pay` is retained as a guarded lower-level USD compatibility endpoint; the new adaptive payment UI does not call it. It recomputes the USD fee, checks the pending confirmation token, and retrieves/verifies the plan account, product, total, fee metadata, pricing mode and allowed methods before charging.

**Only the signed `payment.succeeded` webhook is trusted to credit a balance.** `applyTopUp` currently logs the payment ID, order reference, base top-up, fee breakdown, currency, total and customer email, as requested. Before using this to credit real client balances, replace its TODO with a durable ledger transaction that retrieves and verifies the payment, its FX quote and the associated USD base plan, maps the buyer to a client, credits only base ad spend (excluding the fee), and deduplicates on `payment.id`. Handle retries durably. The return page is display-only; its query string is never proof of payment.

## Smoke checks

With the development server running:

```sh
curl -i -X POST http://localhost:3000/api/pay \
  -H 'Content-Type: application/json' \
  -d '{"amount":99,"confirmationToken":"invalid","orderId":"topup_test"}'
# Expected: 400 (without calling Whop)

curl -i 'http://localhost:3000/checkout/return?status=succeeded&order=topup_test'
# Expected: 200 and "Funds received"
```

Complete end-to-end payment and signed webhook testing with a configured Whop account on HTTPS before accepting client payments.
