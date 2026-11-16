import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, evaluateAll, monthlyPayment, maxPriceForBuy, applicableScenarios, guessCondition } from '../js/calc.js';
import { mergePrefs } from '../js/defaults.js';
import { findMarket } from '../js/markets.js';
import { merge } from '../scripts/fetch-listings.mjs';

const prefs = mergePrefs({});
const house = { id: 'h', city: 'Bend', state: 'OR', price: 500000, bedrooms: 3, bathrooms: 2, squareFootage: 1500, yearBuilt: 2015, propertyType: 'Single Family', lotSize: 7000 };
const land = { id: 'l', city: 'Packwood', state: 'WA', price: 100000, propertyType: 'Land', lotSize: 43560 };

test('monthly payment matches the standard amortization formula', () => {
  assert.equal(Math.round(monthlyPayment(300000, 6, 30)), 1799);
  assert.equal(Math.round(monthlyPayment(100000, 8, 10, true)), 667);
  assert.equal(monthlyPayment(0, 7, 30), 0);
});

test('markets match by city, then fall back to the state default', () => {
  assert.equal(findMarket({ city: 'Bend', state: 'OR' }).id, 'or-bend');
  assert.equal(findMarket({ city: 'Nowhere', state: 'WA' }).id, 'wa-other');
  assert.equal(findMarket({ city: 'Bend', state: 'OR' }, { 'or-bend': { adr: 999 } }).adr, 999);
});

test('scenarios depend on property type and lot size', () => {
  assert.deepEqual(applicableScenarios(land, prefs), ['tiny_home', 'build']);
  assert.deepEqual(applicableScenarios(house, prefs), ['str_ready']); // turnkey, small lot
  assert.ok(applicableScenarios({ ...house, yearBuilt: 1975, lotSize: 20000 }, prefs).includes('tiny_home'));
  assert.equal(guessCondition({ yearBuilt: 1950 }), 'poor');
});

test('revenue, expenses and cash flow add up', () => {
  const r = evaluate(house, prefs, { scenario: 'str_ready' });
  const m = findMarket(house);
  const expectedRev = Math.round(m.adr * 1.3) * (365 - prefs.ownerNights) * m.occupancy;
  assert.ok(Math.abs(r.grossRevenue - expectedRev) < 1);
  assert.ok(Math.abs(r.stabilizedCF - (r.grossRevenue - r.opexAnnual - r.debtAnnual)) < 1e-6);
  assert.equal(r.downPayment, 125000);
  assert.equal(r.loanAmount, 375000);
  assert.ok(r.summary.startsWith('Buying this property for $500,000 with $125,000 down'));
});

test('Vacasa takes 35% of revenue', () => {
  const r = evaluate(house, prefs, { scenario: 'str_ready', useVacasa: true });
  const fee = Object.entries(r.variableExpenses).find(([k]) => k.startsWith('Vacasa'))[1];
  assert.ok(Math.abs(fee - r.grossRevenue * 0.35) < 1e-6);
});

test('startup cost overrides replace estimates', () => {
  const r = evaluate(house, prefs, { scenario: 'str_ready', startupOverrides: { furnishing: 1000 } });
  const f = r.startupItems.find((i) => i.key === 'furnishing');
  assert.equal(f.amount, 1000);
  assert.ok(f.overridden && f.estimate > 1000);
});

test('cash purchase has no debt', () => {
  const r = evaluate(house, prefs, { scenario: 'str_ready', financeId: 'cash' });
  assert.equal(r.loanAmount, 0);
  assert.equal(r.debtAnnual, 0);
  assert.equal(r.downPct, 100);
});

test('land costs include well, septic and power unless the lot has them', () => {
  const r = evaluate(land, prefs, { scenario: 'build' });
  const keys = r.startupItems.map((i) => i.key);
  for (const k of ['well', 'septic', 'power', 'build']) assert.ok(keys.includes(k), k);
  const r2 = evaluate(land, { ...prefs, landHasWater: true, landHasSewer: true, landHasPower: true }, { scenario: 'build' });
  assert.ok(!r2.startupItems.some((i) => ['well', 'septic', 'power'].includes(i.key)));
});

test('break-even goal is a Buy whenever cash flow is positive', () => {
  const be = { ...prefs, goal: 'breakeven' };
  const cheap = evaluate({ ...house, price: 150000 }, be, { scenario: 'str_ready' });
  assert.ok(cheap.stabilizedCF > 0);
  assert.equal(cheap.verdict.code, 'BUY');
});

test('a lower price never makes the verdict worse, and max price is a Buy', () => {
  const max = maxPriceForBuy(house, prefs, { scenario: 'str_ready' });
  assert.ok(max != null && max < house.price);
  assert.equal(evaluate(house, prefs, { scenario: 'str_ready', price: max }).verdict.code, 'BUY');
  assert.notEqual(evaluate(house, prefs, { scenario: 'str_ready', price: max + 50000 }).verdict.code, 'BUY');
});

test('evaluateAll ranks best verdict first', () => {
  const rs = evaluateAll({ ...house, yearBuilt: 1975, lotSize: 20000 }, prefs);
  const rank = { BUY: 0, MAYBE: 1, NO: 2 };
  for (let i = 1; i < rs.length; i++) assert.ok(rank[rs[i - 1].verdict.code] <= rank[rs[i].verdict.code]);
});

test('listing merge tracks new, price changes and removals', () => {
  const t1 = '2026-11-01T00:00:00Z', t2 = '2026-11-02T00:00:00Z';
  const a = { id: 'a', price: 100, searchKey: 'k' }, b = { id: 'b', price: 200, searchKey: 'k' };
  let m = merge([{ id: 's', sample: true }], [a, b], 'k', t1);
  assert.equal(m.added, 2);
  assert.ok(!m.listings.some((l) => l.sample));
  m = merge(m.listings, [{ ...a, price: 90 }], 'k', t2);
  assert.equal(m.changed, 1);
  assert.equal(m.removed, 1);
  assert.equal(m.listings.find((l) => l.id === 'a').firstSeen, t1);
  assert.equal(m.listings.find((l) => l.id === 'b').status, 'Inactive');
});
