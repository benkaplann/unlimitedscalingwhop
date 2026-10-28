const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTypeScript } = require('./load-ts.cjs');
const pricing = loadTypeScript('lib/top-up.ts');
const preferences = loadTypeScript('lib/payment-methods.ts');
const { getTopUpPlan, isTopUpPlanForAmount } = loadTypeScript('lib/whop-plans.ts', {
  '@/lib/payment-methods': preferences, '@/lib/top-up': pricing,
});
function planFor(quote, changes = {}) {
  return { id: 'plan_existing', account: { id: 'biz_test' }, product: { id: 'prod_test' },
    currency: quote.currency, initial_price: quote.total, adaptive_pricing_enabled: false, plan_type: 'one_time', visibility: 'quick_link',
    metadata: pricing.topUpMetadata(quote), payment_method_configuration: preferences.getTopUpPaymentConfiguration(quote), ...changes };
}
function mockClient(items) {
  const calls = [];
  return { calls, plans: {
    async list(request) { calls.push(['list', request]); return { async *[Symbol.asyncIterator]() { yield* items; } }; },
    async update(request) { calls.push(['update', request]); return { id: request.id }; },
    async create(request, options) { calls.push(['create', request, options]); return { id: 'plan_new' }; },
  } };
}
test('reuses the exact fee-inclusive plan with transfer-only preferences', async () => {
  const quote = pricing.calculateTopUp(2500, 2.5);
  const client = mockClient([planFor(quote)]);
  assert.equal((await getTopUpPlan(client, 'biz_test', 'prod_test', quote)).id, 'plan_existing');
  assert.equal(client.calls.length, 1);
  assert.deepEqual(Array.from(client.calls[0][1].product_ids), ['prod_test']);
});
test('repairs method preferences on a matching top-up plan', async () => {
  const quote = pricing.calculateTopUp(2500, 2.5);
  const client = mockClient([planFor(quote, { payment_method_configuration: null })]);
  await getTopUpPlan(client, 'biz_test', 'prod_test', quote);
  assert.equal(client.calls[1][0], 'update');
  assert.deepEqual(Array.from(client.calls[1][1].payment_method_configuration.enabled), ['us_bank_account', 'bank_wire']);
  assert.equal(client.calls[1][1].payment_method_configuration.include_platform_defaults, false);
});
test('creates the marked-up price and keeps fee and ad spend separate in metadata', async () => {
  const quote = pricing.calculateTopUp(1000, 5, 'eur');
  const client = mockClient([]);
  await getTopUpPlan(client, 'biz_test', 'prod_test', quote);
  const [, request, options] = client.calls[1];
  assert.equal(request.initial_price, 1050);
  assert.equal(request.currency, 'eur');
  assert.equal(request.metadata.topup_amount, '1000');
  assert.equal(request.metadata.ad_spend_fee_percent, '5');
  assert.equal(request.metadata.ad_spend_fee_amount, '50');
  assert.equal(request.adaptive_pricing_enabled, false);
  assert.equal(options.idempotencyKey, 'unlimited-scaling-topup-eur-100000-500-fixed-currency-v5');
});
test('does not reuse another fee or currency even at the same total', async () => {
  const quote = pricing.calculateTopUp(1000, 5);
  const client = mockClient([
    planFor(quote, { currency: 'eur' }),
    planFor(quote, { metadata: { ...pricing.topUpMetadata(quote), ad_spend_fee_percent: '2.5' } }),
    planFor(quote, { metadata: { ...pricing.topUpMetadata(quote), topup_amount: '1024.39' } }),
    planFor(quote, { initial_price: 1000 }),
  ]);
  await getTopUpPlan(client, 'biz_test', 'prod_test', quote);
  assert.equal(client.calls[1][0], 'create');
});
test('searches all returned plans before creating one', async () => {
  const quote = pricing.calculateTopUp(10000, 2.5);
  const client = mockClient([planFor(pricing.calculateTopUp(5000, 2.5)), planFor(quote)]);
  assert.equal((await getTopUpPlan(client, 'biz_test', 'prod_test', quote)).id, 'plan_existing');
  assert.equal(client.calls.length, 1);
});
test('charging rejects an old business, wrong price, fee metadata or card-enabled plan', () => {
  const quote = pricing.calculateTopUp(1000, 2.5);
  const plan = planFor(quote);
  assert.equal(isTopUpPlanForAmount(plan, 'biz_test', 'prod_test', quote), true);
  for (const change of [
    { account: { id: 'biz_other' } }, { product: { id: 'prod_other' } }, { currency: 'eur' },
    { initial_price: 1000 }, { plan_type: 'renewal' }, { visibility: 'archived' }, { adaptive_pricing_enabled: true },
    { metadata: { ...plan.metadata, ad_spend_fee_percent: '5' } },
    { metadata: { ...plan.metadata, ad_spend_fee_amount: '0' } },
    { payment_method_configuration: { ...preferences.getTopUpPaymentConfiguration(quote), enabled: ['card'] } },
  ]) assert.equal(isTopUpPlanForAmount({ ...plan, ...change }, 'biz_test', 'prod_test', quote), false);
});

test('large EUR top-ups create a non-adaptive EU-bank-transfer-only plan', async () => {
  const quote = pricing.calculateTopUp(25000, 2.5, 'eur');
  const client = mockClient([]);
  await getTopUpPlan(client, 'biz_test', 'prod_test', quote);
  const [, request] = client.calls[1];
  assert.equal(request.currency, 'eur');
  assert.equal(request.initial_price, 25625);
  assert.equal(request.adaptive_pricing_enabled, false);
  assert.deepEqual(Array.from(request.payment_method_configuration.enabled), ['eu_bank_transfer']);
  assert.ok(request.payment_method_configuration.disabled.includes('sepa_debit'));
});
test('currency and enabled methods are validated before charging', () => {
  const quote = pricing.calculateTopUp(25000, 2.5, 'eur');
  const plan = planFor(quote);
  assert.equal(isTopUpPlanForAmount(plan, 'biz_test', 'prod_test', quote), true);
  assert.equal(isTopUpPlanForAmount({ ...plan, currency: 'usd' }, 'biz_test', 'prod_test', quote), false);
  assert.equal(isTopUpPlanForAmount({ ...plan, payment_method_configuration: preferences.getTopUpPaymentConfiguration(pricing.calculateTopUp(1000, 2.5, 'eur')) }, 'biz_test', 'prod_test', quote), false);
});
