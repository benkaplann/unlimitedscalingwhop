const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTypeScript } = require('./load-ts.cjs');
const { calculateTopUp, isValidFeePercent, topUpMetadata } = loadTypeScript('lib/top-up.ts');
test('fee is added to ad spend at both percentage bounds', () => {
  assert.equal(calculateTopUp(1000, 2.5).total, 1025);
  assert.equal(calculateTopUp(1000, 5).total, 1050);
  assert.equal(calculateTopUp(500000, 5).total, 525000);
});
test('fee rounds once to the nearest cent using integer cents and basis points', () => {
  assert.equal(calculateTopUp(100.20, 2.5).fee, 2.51);
  assert.equal(calculateTopUp(100.20, 2.5).total, 102.71);
  assert.equal(calculateTopUp(100.01, 2.5).total, 102.51);
  assert.equal(calculateTopUp(1234.56, 3.75).fee, 46.30);
});
test('rejects missing, nonnumeric, out-of-range and excessive-precision fees', () => {
  for (const fee of [undefined, null, '2.5', NaN, Infinity, 0, 2.49, 5.01, 3.125]) {
    assert.equal(isValidFeePercent(fee), false);
    assert.throws(() => calculateTopUp(1000, fee));
  }
});
test('payment metadata identifies adaptive versus forced USD pricing', () => {
  const quote = calculateTopUp(10000, 2.5);
  assert.equal(topUpMetadata(quote).pricing_mode, 'adaptive');
  assert.equal(topUpMetadata(quote, true).pricing_mode, 'forced_usd');
  assert.equal(topUpMetadata(quote, true).topup_amount_usd, '10000');
});
