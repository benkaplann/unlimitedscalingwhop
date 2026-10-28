const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTypeScript } = require('./load-ts.cjs');
const { calculateTopUp } = loadTypeScript('lib/top-up.ts');
const { getTopUpPaymentConfiguration } = loadTypeScript('lib/payment-methods.ts');
const methods = (quote) => Array.from(getTopUpPaymentConfiguration(quote).enabled);
test('USD only enables ACH and Bank Wire, including large totals', () => {
  assert.deepEqual(methods(calculateTopUp(500000, 5)), ['us_bank_account', 'bank_wire']);
});
test('EUR enables SEPA and EU bank transfer up to the inclusive SEPA limit', () => {
  const quote = calculateTopUp(19047.62, 5, 'eur');
  assert.equal(quote.totalCents, 2000000);
  assert.deepEqual(methods(quote), ['sepa_debit', 'eu_bank_transfer']);
});
test('one cent over the SEPA limit defaults to EU bank transfer only', () => {
  const quote = calculateTopUp(19047.63, 5, 'eur');
  assert.equal(quote.totalCents, 2000001);
  const configuration = getTopUpPaymentConfiguration(quote);
  assert.deepEqual(Array.from(configuration.enabled), ['eu_bank_transfer']);
  assert.ok(configuration.disabled.includes('sepa_debit'));
});
test('fee-inclusive total controls SEPA availability and card/crypto remain disabled', () => {
  const quote = calculateTopUp(19900, 2.5, 'eur');
  assert.deepEqual(methods(quote), ['eu_bank_transfer']);
  const configuration = getTopUpPaymentConfiguration(quote);
  assert.equal(configuration.include_platform_defaults, false);
  for (const method of ['card', 'crypto', 'us_bank_account', 'bank_wire']) assert.ok(configuration.disabled.includes(method));
});
