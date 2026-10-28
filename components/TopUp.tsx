"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { loadWhop } from "@whop/elements";
import { Checkout, CheckoutElement, WhopElements } from "@whop/elements-react";
import { ArrowIcon, LockIcon } from "@/components/Icons";
import { calculateTopUp, formatAmount, isValidAmount, isValidFeePercent, MAX_FEE_PERCENT, MAX_TOP_UP, MIN_FEE_PERCENT, MIN_TOP_UP, topUpMetadata, type TopUpCurrency } from "@/lib/top-up";
import { MAX_SEPA_TOTAL_CENTS } from "@/lib/payment-methods";
import { createPlanPreparer } from "@/lib/checkout-preparation";

const presets = [10_000, 25_000, 50_000, 75_000, 100_000];
const appearance = {
  theme: { appearance: "dark" as const, accentColor: "blue" as const, grayColor: "slate" as const },
};

function amountError(value: string, currency: TopUpCurrency): string | null {
  if (!value.trim()) return "Enter an amount to continue.";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Enter a valid amount.";
  if (amount < MIN_TOP_UP) return `The minimum top-up is ${formatAmount(MIN_TOP_UP, currency)}.`;
  if (amount > MAX_TOP_UP) return `The maximum top-up is ${formatAmount(MAX_TOP_UP, currency)}.`;
  if (!isValidAmount(amount)) return "Use no more than two decimal places.";
  return null;
}

function feeError(value: string): string | null {
  if (!value.trim()) return "Enter an ad spend fee.";
  if (!isValidFeePercent(Number(value))) return "Enter a fee from 2.5% to 5%, using up to two decimal places.";
  return null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export default function TopUp() {
  const [value, setValue] = useState("10000");
  const [feeValue, setFeeValue] = useState("2.5");
  const [feeTouched, setFeeTouched] = useState(false);
  const [currency, setCurrency] = useState<TopUpCurrency>("usd");
  const [completed, setCompleted] = useState(false);
  const [elementError, setElementError] = useState<string | null>(null);
  const [checkoutVersion, setCheckoutVersion] = useState(0);
  const [step, setStep] = useState<"amount" | "payment">("amount");
  const [touched, setTouched] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [planId, setPlanId] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const preparingRef = useRef(false);
  const [loadError, setLoadError] = useState<{ retry: () => void } | null>(null);
  const [elements, setElements] = useState<ReturnType<typeof loadWhop> | null>(null);
  const [preparePlan] = useState(() => createPlanPreparer(async (quote) => {
    const result = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: quote.amount, feePercent: quote.feePercent, currency: quote.currency }),
      signal: AbortSignal.timeout(15_000),
    });
    const response = await result.json();
    if (!result.ok || typeof response.planId !== "string" || !/^plan_[a-zA-Z0-9]+$/.test(response.planId) ||
      response.quote?.totalCents !== quote.totalCents || response.quote?.amountCents !== quote.amountCents ||
      response.quote?.feeBasisPoints !== quote.feeBasisPoints || response.quote?.currency !== quote.currency) {
      throw new Error(response.error || "We couldn’t load payment options. Please try again.");
    }
    return response.planId as string;
  }));
  const inputRef = useRef<HTMLInputElement>(null);
  const feeRef = useRef<HTMLInputElement>(null);
  const paymentTitleRef = useRef<HTMLHeadingElement>(null);
  const dollars = Number(value);
  const feePercent = Number(feeValue);
  const feeInputError = feeTouched ? feeError(feeValue) : null;
  const quote = useMemo(() => isValidAmount(dollars) && isValidFeePercent(feePercent) ? calculateTopUp(dollars, feePercent, currency) : null, [dollars, feePercent, currency]);
  const checkoutMetadata = useMemo(() => quote ? { ...topUpMetadata(quote), order_id: orderId } : undefined, [quote, orderId]);
  const error = (touched ? amountError(value, currency) : null);
  const accountId = process.env.NEXT_PUBLIC_WHOP_ACCOUNT_ID;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  const configured = Boolean(accountId?.startsWith("biz_") && siteUrl);

  // Load the hosted SDK while the buyer chooses an amount, rather than after Continue.
  useEffect(() => {
    if (configured) setElements(loadWhop());
  }, [configured]);

  useEffect(() => {
    if (!configured || step !== "amount" || !quote) return;
    // Wait for typing to settle; Continue shares this request if it is still in flight.
    const timer = setTimeout(() => { void preparePlan(quote).catch(() => {}); }, 400);
    return () => clearTimeout(timer);
  }, [configured, quote, preparePlan, step]);

  useEffect(() => {
    if (step === "payment") paymentTitleRef.current?.focus();
  }, [step]);

  async function continueToPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    setFeeTouched(true);
    if (amountError(value, currency)) {
      inputRef.current?.focus();
      return;
    }
    if (feeError(feeValue)) { feeRef.current?.focus(); return; }
    if (!quote) { inputRef.current?.focus(); return; }
    if (preparingRef.current) return;
    preparingRef.current = true;
    setPreparing(true);
    setCheckoutError(null);
    try {
      if (configured) {
        setPlanId(await preparePlan(quote));
        setElementError(null);
        setCompleted(false);
      }
      setOrderId(`topup_${Date.now().toString(36)}`);
      setStep("payment");
    } catch (error) {
      setCheckoutError(errorMessage(error));
    } finally {
      preparingRef.current = false;
      setPreparing(false);
    }
  }

  function changeAmount() {
    if (preparing || completed) return;
    setPlanId(null);
    setStep("amount");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <WhopElements elements={elements} appearance={appearance} onLoadError={(_error, retry) => setLoadError({ retry })}>
    <div className="checkout-wrap">
      <div className="checkout-panel">
        <div className="panel-topline">
          <span className="panel-caption">Your growth, on your terms</span>
          <span className="step-counter">{step === "amount" ? "01" : "02"}<span> / 02</span></span>
        </div>
        {step === "amount" ? (
          <form onSubmit={continueToPayment} noValidate aria-busy={preparing}>
            <h2 className="panel-title">Make room for more.</h2>
            <p className="panel-description">Choose how much you’d like to add.</p>

            <div className="currency-control">
              <span id="currency-label">Payment currency</span>
              <div className="currency-toggle" role="group" aria-labelledby="currency-label">
                {(["usd", "eur"] as const).map((option) => (
                  <button key={option} type="button" aria-pressed={currency === option} disabled={preparing} onClick={() => setCurrency(option)}>{option.toUpperCase()}</button>
                ))}
              </div>
            </div>
            <label className="amount-label" htmlFor="amount">Top-up amount <span>{currency.toUpperCase()}</span></label>
            <div className={`amount-field${error ? " has-error" : ""}`}>
              <span className="currency-symbol" aria-hidden="true">{currency === "usd" ? "$" : "€"}</span>
              <input
                id="amount"
                name="amount"
                ref={inputRef}
                type="number"
                inputMode="decimal"
                min={MIN_TOP_UP}
                max={MAX_TOP_UP}
                step="0.01"
                value={value}
                disabled={preparing}
                onChange={(event) => { setValue(event.target.value); setTouched(true); }}
                onBlur={() => setTouched(true)}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "amount-error amount-hint" : "amount-hint"}
                autoComplete="off"
                placeholder="0"
              />
            </div>
            <div className="amount-help">
              <p id="amount-hint">{formatAmount(MIN_TOP_UP, currency)} minimum <span>·</span> {formatAmount(MAX_TOP_UP, currency)} maximum</p>
              {error && <p className="form-error" id="amount-error" role="alert">{error}</p>}
            </div>

            <div className="preset-grid" aria-label="Suggested top-up amounts">
              {presets.map((amount) => (
                <button key={amount} className={`preset${dollars === amount ? " selected" : ""}`} type="button" disabled={preparing} aria-pressed={dollars === amount} onClick={() => { setValue(String(amount)); setTouched(true); }}>
                  {currency === "usd" ? "$" : "€"}{amount / 1000}k
                </button>
              ))}
            </div>

            <div className="fee-settings">
              <div><label htmlFor="ad-spend-fee">Ad spend fee (%)</label><p id="fee-hint">2.5%–5% of your ad spend</p></div>
              <div className={`fee-field${feeInputError ? " has-error" : ""}`}>
                <input id="ad-spend-fee" name="feePercent" ref={feeRef} type="number" inputMode="decimal" min={MIN_FEE_PERCENT} max={MAX_FEE_PERCENT} step="0.01" value={feeValue} disabled={preparing} onChange={(event) => { setFeeValue(event.target.value); setFeeTouched(true); }} onBlur={() => setFeeTouched(true)} aria-invalid={Boolean(feeInputError)} aria-describedby={feeInputError ? "fee-error fee-hint" : "fee-hint"} />
                <span aria-hidden="true">%</span>
              </div>
            </div>
            {feeInputError && <p className="form-error" id="fee-error" role="alert">{feeInputError}</p>}
            <div className="quote-summary" aria-live="polite">
              <div><span>Ad spend top-up</span><span>{isValidAmount(dollars) ? formatAmount(dollars, currency) : "—"}</span></div>
              <div><span>Ad spend fee{quote ? ` (${quote.feePercent}%)` : ""}</span><span>{quote ? formatAmount(quote.fee, currency) : "—"}</span></div>
              <div className="quote-total"><span>Total to pay</span><strong>{quote ? formatAmount(quote.total, currency) : "—"}</strong></div>
            </div>
            {checkoutError && <p className="form-error checkout-error" role="alert">{checkoutError}</p>}
            <button className="primary-button" type="submit" disabled={preparing}>{preparing ? "Loading payment options…" : "Continue to payment"} {!preparing && <ArrowIcon />}</button>
            <p className="panel-footnote">Choose your payment method in the next step.</p>
          </form>
        ) : (
          <>
            <h2 className="panel-title" ref={paymentTitleRef} tabIndex={-1}>One step from momentum.</h2>
            <p className="panel-description">Complete your top-up securely with Whop.</p>
            <div className="payment-summary">
              <div><span>Ad spend top-up</span><span>{formatAmount(dollars, currency)}</span></div>
              <div className="fee-summary-row"><span>Ad spend fee ({feePercent}%)</span><span>{quote ? formatAmount(quote.fee, currency) : "—"}</span></div>
              <div className="quote-total"><span>{currency.toUpperCase()} total</span><strong>{quote ? formatAmount(quote.total, currency) : "—"}</strong></div>
              <button className="text-button" type="button" onClick={changeAmount} disabled={preparing || completed}>Change amount, fee or currency</button>
            </div>
            {configured && planId && quote ? (
              <>
                {loadError && (
                  <div className="payment-load-error" role="alert">
                    <p className="form-error">We couldn’t load the secure payment form. Check your connection and try again.</p>
                    <button className="text-button" type="button" onClick={() => { loadError.retry(); setLoadError(null); }}>Reload payment form</button>
                  </div>
                )}
                <p className="currency-note">{currency === "usd" ? "Pay in USD with ACH or Bank Wire." : quote.totalCents > MAX_SEPA_TOTAL_CENTS ? "Pay in EUR by EU bank transfer. SEPA is unavailable above €20,000 including the fee." : "Pay in EUR with SEPA or EU bank transfer."}</p>
                {elementError && <div className="payment-load-error" role="alert">
                  <p className="form-error">{elementError}</p>
                  <button className="text-button" type="button" onClick={() => { setElementError(null); setCheckoutVersion((version) => version + 1); }}>Reload checkout</button>
                </div>}
                <Checkout key={`${planId}:${checkoutVersion}`} plan={planId}
                  metadata={checkoutMetadata}
                  returnUrl={`${siteUrl}/checkout/return?order=${orderId}`}
                  onComplete={() => setCompleted(true)}>
                  <CheckoutElement fallback={<div className="checkout-loading" role="status">Loading secure checkout…</div>}
                    onError={(event) => { setElementError(event.message || "Unable to load checkout. Please try again."); }} />
                </Checkout>
                {checkoutError && <p className="form-error" role="alert">{checkoutError}</p>}

              </>
            ) : (
              <div className="configuration-notice" role="status">
                <LockIcon />
                <h3>Payments are being connected.</h3>
                <p>Please check back shortly to complete your top-up.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
    </WhopElements>
  );
}
