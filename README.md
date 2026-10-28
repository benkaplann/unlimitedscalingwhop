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

The amount screen has a USD/EUR currency toggle. The preset buttons are 10k, 25k, 50k, 75k and 100k in the selected currency, with USD 10k initially selected. Switching currency does not apply an exchange rate: the customer selects the currency of their top-up and reviews that currency's total. The ad spend fee defaults to 2.5%, allows 2.5%–5% with up to two decimal places, and is rounded once to cents before adding it to base spend.

Adaptive pricing is **disabled** (`adaptive_pricing_enabled: false`) on every plan created or reused by this flow. The payment step remains Whop Elements 1.9.0's `Checkout` / `CheckoutElement`, with the exact selected-currency plan. It has no Make USD override or automatic currency conversion.

USD plans enable only ACH (`us_bank_account`) and Bank Wire (`bank_wire`). EUR plans up to €20,000 total including the ad spend fee enable SEPA (`sepa_debit`) and EU bank transfer (`eu_bank_transfer`). Above €20,000, SEPA is explicitly disabled and EU bank transfer is the sole enabled method, so Whop selects it by default. Larger EUR top-ups are allowed rather than blocked by SEPA's individual cap. Whop still applies its other country and amount eligibility rules. Card, crypto, US bank transfer and opposite-currency methods are disabled, and platform defaults are excluded.

**Current Whop account restriction (October 28, 2026):** creating a €25,625 plan was rejected with “Purchases over $20000 USD are not enabled for this account unless paid by bank wire on a one-time USD plan.” The application supports EU-bank-transfer-only checkout above SEPA's cap, but this business needs Whop approval for higher-value non-USD purchases before that path can be used. `/api/checkout` returns an actionable `ACCOUNT_PURCHASE_LIMIT` error (HTTP 422), directing the buyer to USD Bank Wire or a Whop limit increase. The limit is not hard-coded into quote calculation; once Whop enables the account, these EUR amounts work without changing the fallback logic.

The business is Unlimited Scaling (`biz_3bscA1qgC9BH6X`), using a dedicated hidden top-up product. Payment and plan metadata record fixed-currency pricing, base spend and fee separately; only base spend should be credited as ad budget.

Create a webhook in **Dashboard → Developer → Webhooks**, select **`payment.succeeded`**, and point it to **`https://<domain>/api/webhooks/whop`**. Store its signing secret as `WHOP_WEBHOOK_SECRET`.

Deploy with `npx vercel`, configure the environment variables above in the Vercel project, set `NEXT_PUBLIC_SITE_URL` to the HTTPS deployment origin, and rebuild. Bank/wire redirects require an **HTTPS return URL**; test those on a Vercel deployment rather than localhost. Follow [Whop's payment elements guidance](https://whop.com/network/components/checkout/) for account configuration.

## Payment and balance handling

The page sends Whop's official SDK preload and connection hints and initializes the Elements provider while the amount step is visible. Once a valid amount and fee stay unchanged for 400 ms, the browser prepares their plan in the background. Continue shares that request/result. The browser and Next's Data Cache retain successful plan IDs for five minutes, keyed by account/product, exact base amount, fee and selected currency. Payment tokens, sessions and payment results are not cached.

`/api/checkout` validates amount, fee and USD/EUR currency, calculates the selected-currency total using integer cents, and returns the matching non-adaptive plan ID and quote. Plan reuse verifies the breakdown, fixed-currency pricing mode and exact method configuration, including the SEPA threshold. `CheckoutElement` owns payment collection, confirmation, next actions and return navigation.

`/api/pay` is retained as a guarded lower-level compatibility endpoint; the current UI does not call it. It supports USD/EUR and recomputes the fee, checks the pending confirmation token, and retrieves/verifies the plan account, product, currency, total, fee metadata, disabled adaptive pricing and allowed methods before charging.

**Only the signed `payment.succeeded` webhook is trusted to credit a balance.** `applyTopUp` currently logs the payment ID, order reference, base top-up, fee breakdown, currency, total and customer email, as requested. Before using this to credit real client balances, replace its TODO with a durable ledger transaction that retrieves and verifies the payment, the selected currency and associated base plan, maps the buyer to a client, credits only base ad spend (excluding the fee), and deduplicates on `payment.id`. Handle retries durably. The return page is display-only; its query string is never proof of payment.

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
