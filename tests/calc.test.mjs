import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, evaluateAll, monthlyPayment, maxPriceForBuy, applicableScenarios, guessCondition } from '../js/calc.js';
import { mergePrefs } from '../js/defaults.js';
import { findMarket } from '../js/markets.js';
import { merge, annotate, callsAvailable, planJobs } from '../scripts/fetch-listings.mjs';
import { readFileSync } from 'node:fs';
const config = JSON.parse(readFileSync(new URL('../config/searches.json', import.meta.url)));

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
  const a = { id: 'a', price: 100, region: 'r' }, b = { id: 'b', price: 200, region: 'r' };
  let m = merge([{ id: 's', sample: true }], [a, b], t1, { regionId: 'r', complete: true });
  assert.equal(m.added, 2);
  assert.ok(!m.listings.some((l) => l.sample));
  // A new-listing sweep never marks anything removed.
  m = merge(m.listings, [{ ...a, price: 90 }], t2);
  assert.equal(m.changed, 1);
  assert.equal(m.removed, 0);
  // An incomplete region refresh doesn't either.
  assert.equal(merge(m.listings, [a], t2, { regionId: 'r', complete: false }).removed, 0);
  m = merge(m.listings, [{ ...a, price: 90 }], t2, { regionId: 'r', complete: true });
  assert.equal(m.removed, 1);
  assert.equal(m.listings.find((l) => l.id === 'a').firstSeen, t1);
  assert.equal(m.listings.find((l) => l.id === 'b').status, 'Inactive');
});

test('coverage keeps coastal listings within 10 miles of water and inland hotspots', () => {
  const at = (latitude, longitude, extra = {}) => ({ id: 'x', price: 400000, propertyType: 'Single Family', latitude, longitude, ...extra });
  assert.equal(annotate(at(45.99, -123.92), config).region, 'or-northcoast'); // Seaside
  assert.ok(annotate(at(45.99, -123.92), config).waterMiles < 2);
  assert.equal(annotate(at(44.06, -121.31), config).region, 'x-centraloregon'); // Bend, lifted filter
  assert.equal(annotate(at(47.6, -122.33), config), null); // Seattle excluded
  assert.equal(annotate(at(45.52, -122.67), config), null); // Portland excluded
  assert.equal(annotate(at(47.95, -124.39), config), null); // Forks, >10 mi from the ocean
  assert.equal(annotate(at(45.99, -123.92, { price: 1200000 }), config), null);
  assert.equal(annotate(at(45.99, -123.92, { propertyType: 'Multi-Family' }), config), null);
});

test('daily calls are paced across the month and seeding comes first', () => {
  const st = { calls: 0, lastRun: {} };
  // Nov 1: keep 29 days x 1 sweep call/day in reserve.
  assert.equal(callsAvailable(config, st, new Date('2026-11-01T14:00:00Z')), 19);
  assert.equal(callsAvailable(config, { calls: 40 }, new Date('2026-11-30T14:00:00Z')), 8);
  assert.equal(callsAvailable(config, { calls: 48 }, new Date('2026-11-30T14:00:00Z')), 0);
  // Even with a tight reserve, today's sweep still runs.
  assert.equal(callsAvailable(config, { calls: 40 }, new Date('2026-11-20T14:00:00Z')), 1);
  const now = new Date('2026-11-16T14:00:00Z');
  let jobs = planJobs(config, st, now);
  assert.equal(jobs.length, config.regions.length);
  assert.ok(jobs.every((j) => j.kind === 'region'));
  const lastRun = Object.fromEntries([...config.regions, ...config.newListingSweeps].map((j) => [j.id, '2026-11-15T14:00:00Z']));
  assert.equal(planJobs(config, { lastRun }, now).length, 0);
  lastRun['new-wa-west'] = '2026-11-12T14:00:00Z';
  lastRun['wa-kitsap'] = '2026-09-25T14:00:00Z';
  jobs = planJobs(config, { lastRun }, now);
  assert.deepEqual(jobs.map((j) => j.id), ['new-wa-west', 'wa-kitsap']);
});

test('timeshares and mobile-home-park listings are filtered out', async () => {
  const { junkReason, hoaFor } = await import('../js/calc.js');
  assert.ok(junkReason({ propertyType: 'Condo', price: 7500 }));
  assert.ok(junkReason({ propertyType: 'Manufactured', price: 67400, formattedAddress: '3371 SE Bielmeier Rd, Trlr 78, Port Orchard, WA' }));
  assert.ok(junkReason({ propertyType: 'Manufactured', price: 49950, formattedAddress: '111 Dryke Rd, Spc 73, Sequim, WA' }));
  assert.equal(junkReason({ propertyType: 'Manufactured', price: 249000, formattedAddress: '12 Elk Ln, Sequim, WA' }), '');
  assert.equal(junkReason({ propertyType: 'Land', price: 25000 }), '');
  assert.deepEqual(hoaFor({ propertyType: 'Condo' }), { amount: 350, estimated: true });
  assert.deepEqual(hoaFor({ propertyType: 'Condo', hoaFee: 120 }), { amount: 120, estimated: false });
});
