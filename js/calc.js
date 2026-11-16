// RentalRater evaluation engine. Pure functions, no DOM, so it runs in the
// browser, in Node tests, and in the daily GitHub Action.

import { findMarket } from './markets.js';
import { BEDROOM_ADR_MULT, TINY_HOME_ADR_MULT, CONDITIONS, SCENARIOS } from './defaults.js';

const PROJECTION_YEARS = 30;
const SELLING_COST_PCT = 0.06;
const SQFT_PER_ACRE = 43560;

export const round = (n, step = 1) => Math.round(n / step) * step;

export function isLand(listing) {
  return /land|lot/i.test(listing.propertyType || '') || (!listing.bedrooms && !listing.squareFootage && listing.propertyType !== 'Condo');
}

/**
 * Listings that look like a rental investment on paper but usually aren't:
 * timeshares and fractional shares (tiny prices), and homes in mobile-home
 * parks (space rent, and parks rarely allow short-term rentals).
 * Returns a reason string, or '' if the listing is fine.
 */
export function junkReason(l) {
  const land = /land|lot/i.test(l.propertyType || '');
  if (!land && l.price < 40000) return 'Under $40k: usually a timeshare, fractional share or a home on leased land.';
  if (land && l.price < 5000) return 'Under $5k: usually an unbuildable or timeshare lot.';
  if (land && /\bunit\s*#?\s*\w+/i.test(`${l.formattedAddress || ''}`)) return 'Lot sold as a condo unit (usually an RV-resort lot where you can\'t build).';
  if (!land && l.bedrooms != null && l.bedrooms < 1) return 'No bedrooms: usually a storage, garage, boathouse or commercial unit.';
  const addr = `${l.formattedAddress || ''} ${l.addressLine1 || ''}`;
  if (/\b(usfs|forest service|leasehold|lease)\b/i.test(addr)) return 'Forest Service or leased land: you can\'t own the land or rent it out freely.';
  const manufactured = /manufactured|mobile/i.test(l.propertyType || '');
  const parkAddress = /\b(spc|space|sp|trlr|trailer|lot|unit)\s*#?\s*\w+/i.test(addr) || /\b(mobile|mhp|ests?|estates|park)\b/i.test(addr);
  const noLand = !l.lotSize || l.lotSize < 4000;
  if (manufactured && (parkAddress || (noLand && l.price < 150000))) return 'In a mobile-home park: space rent applies and parks rarely allow short-term rentals.';
  return '';
}

/** Monthly HOA dues, estimated for condos and townhouses when the listing doesn't say. */
export function hoaFor(l) {
  if (l.hoaFee != null && l.hoaFee !== '') return { amount: Number(l.hoaFee), estimated: false };
  if (/condo|apartment/i.test(l.propertyType || '')) return { amount: 350, estimated: true };
  if (/town/i.test(l.propertyType || '')) return { amount: 200, estimated: true };
  return { amount: 0, estimated: false };
}

export function lotAcres(listing) {
  return listing.lotSize ? listing.lotSize / SQFT_PER_ACRE : 0;
}

/** Guess condition from year built when the user hasn't set it. */
export function guessCondition(listing) {
  if (listing.condition && CONDITIONS[listing.condition]) return listing.condition;
  const y = listing.yearBuilt;
  if (!y) return 'good';
  if (y >= 2012) return 'turnkey';
  if (y >= 1995) return 'good';
  if (y >= 1970) return 'dated';
  return 'poor';
}

export function estSqft(listing) {
  if (listing.squareFootage) return listing.squareFootage;
  const beds = listing.bedrooms || 2;
  return 300 + beds * 450;
}

export function applicableScenarios(listing, prefs) {
  const allowed = prefs.scenarios && prefs.scenarios.length ? prefs.scenarios : Object.keys(SCENARIOS);
  const land = isLand(listing);
  const out = [];
  if (land) {
    if (allowed.includes('tiny_home')) out.push('tiny_home');
    if (allowed.includes('build')) out.push('build');
  } else {
    if (allowed.includes('str_ready')) out.push('str_ready');
    if (allowed.includes('refurbish') && guessCondition(listing) !== 'turnkey') out.push('refurbish');
    if (allowed.includes('tiny_home') && listing.propertyType !== 'Condo' && lotAcres(listing) >= 0.25) out.push('tiny_home');
  }
  return out;
}

function bedMult(beds) {
  const b = Math.max(0, Math.min(6, Math.round(beds || 0)));
  return BEDROOM_ADR_MULT[b];
}

function typeMult(type = '') {
  if (/condo/i.test(type)) return 0.95;
  if (/manufactured|mobile/i.test(type)) return 0.85;
  return 1;
}

const RENO_STEPS = ['none', 'light', 'moderate', 'major'];

/**
 * Build the rentable units and the itemized startup costs for one scenario.
 * Returns { units, items, improvementValue }.
 */
export function estimateStartup(listing, scenario, market, prefs, opts = {}) {
  const cp = prefs.costParams;
  const ci = market.costIndex || 1;
  const price = opts.price ?? listing.price;
  const items = [];
  const units = [];
  let improvementValue = 0;
  const add = (key, label, amount, note = '', extra = {}) => items.push({ key, label, amount: round(amount, 50), note, ...extra });

  add('closing', 'Closing costs', price * cp.closingCostPct / 100, `${cp.closingCostPct}% of price`);

  const land = isLand(listing);
  const condition = opts.condition || guessCondition(listing);

  if (!land && (scenario === 'str_ready' || scenario === 'refurbish' || scenario === 'tiny_home')) {
    const sqft = estSqft(listing);
    let reno = CONDITIONS[condition].reno;
    if (scenario === 'refurbish') reno = RENO_STEPS[Math.min(3, RENO_STEPS.indexOf(reno) + 1)];
    const renoCost = (cp.renoPerSqft[reno] || 0) * sqft * ci;
    if (renoCost > 0) {
      add('renovation', 'Repairs / renovation', renoCost, `${reno} work, ${sqft.toLocaleString()} sqft × $${cp.renoPerSqft[reno]}/sqft × ${ci} area cost`);
      improvementValue += renoCost * 0.7; // not every dollar of reno shows up in value
    }
    const beds = listing.bedrooms || 2;
    add('furnishing', 'Furnishing', cp.furnishBase + cp.furnishPerBedroom * beds, `${beds} bedroom${beds === 1 ? '' : 's'}`);
    units.push({ label: 'Main home', beds, sqft, adrMult: bedMult(beds) * typeMult(listing.propertyType) * (scenario === 'refurbish' ? 1.15 : 1) });
  }

  if (scenario === 'tiny_home') {
    const n = land ? prefs.tinyHomesOnLand : prefs.tinyHomesOnLot;
    const unitCost = cp.tinyHomeUnitCost * ci;
    add('tiny_homes', `Tiny home${n > 1 ? 's' : ''} (${n})`, unitCost * n, `$${round(unitCost, 100).toLocaleString()} each delivered and finished, area-adjusted`, { build: true });
    add('tiny_furnish', 'Tiny home furnishing', (cp.furnishBase * 0.5 + cp.furnishPerBedroom) * n, `${n} unit${n > 1 ? 's' : ''}`);
    improvementValue += unitCost * n * 0.8;
    for (let i = 0; i < n; i++) units.push({ label: `Tiny home ${i + 1}`, beds: 1, sqft: cp.tinyHomeSqft, adrMult: TINY_HOME_ADR_MULT });
    if (land) {
      addLandCosts(add, prefs, ci, n);
    } else {
      add('utility_ext', 'Utility extensions to tiny home(s)', 12000 * ci * n, 'Water, sewer and power runs from the main house');
      add('permits', 'Permits', cp.landPermits * 0.6 * ci, 'ADU / placement permits');
    }
  }

  if (scenario === 'build') {
    const sqft = prefs.buildSqft;
    const beds = prefs.buildBeds;
    const cost = cp.newBuildPerSqft * sqft * ci;
    add('build', `New build (${sqft.toLocaleString()} sqft, ${beds} bed)`, cost, `$${cp.newBuildPerSqft}/sqft × ${ci} area cost`, { build: true });
    add('furnishing', 'Furnishing', cp.furnishBase + cp.furnishPerBedroom * beds, `${beds} bedrooms`);
    improvementValue += cost;
    units.push({ label: 'New cabin', beds, sqft, adrMult: bedMult(beds) * 1.1 /* new construction premium */ });
    addLandCosts(add, prefs, ci, 1);
  }

  const permitUnits = Math.max(1, units.length);
  add('str_permit', 'STR permit / license', (market.permitCost || 300) * permitUnits, market.name);
  add('setup', 'Setup (smart lock, photos, listing, supplies)', cp.setupCost * permitUnits, '');
  return { units, items, improvementValue, condition };
}

function addLandCosts(add, prefs, ci, unitCount) {
  const cp = prefs.costParams;
  add('site_prep', 'Site prep and driveway', cp.sitePrep * ci * (1 + 0.25 * (unitCount - 1)), 'Clearing, grading, pads');
  if (!prefs.landHasWater) add('well', 'Well', cp.wellCost * ci, 'Skip if the lot has city water');
  if (!prefs.landHasSewer) add('septic', 'Septic', cp.septicCost * ci * (unitCount > 2 ? 1.5 : 1), 'Skip if the lot has sewer');
  if (!prefs.landHasPower) add('power', 'Power hookup', cp.powerHookup * ci, 'Skip if power is at the lot line');
  add('permits', 'Building permits and fees', cp.landPermits * ci, '');
}

export function monthlyPayment(principal, annualRatePct, years, interestOnly = false) {
  if (principal <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (interestOnly) return principal * r;
  const n = years * 12;
  if (n <= 0) return 0;
  if (r === 0) return principal / n;
  return principal * r / (1 - Math.pow(1 + r, -n));
}

/**
 * Evaluate one property under one scenario.
 * opts may override: scenario, price, condition, financeId, downPct, rate,
 * useVacasa, adr, occupancy, startupOverrides { [itemKey]: amount }.
 */
export function evaluate(listing, prefs, opts = {}) {
  const market = opts.market || findMarket(listing, prefs.marketOverrides);
  const scenario = opts.scenario || applicableScenarios(listing, prefs)[0] || (isLand(listing) ? 'build' : 'str_ready');
  const price = opts.price ?? listing.price;
  const cp = prefs.costParams;
  const fin = prefs.financeOptions.find((f) => f.id === (opts.financeId || prefs.financeId)) || prefs.financeOptions[0];
  const useVacasa = opts.useVacasa ?? prefs.useVacasa;
  const rate = opts.rate ?? prefs.rateOverride ?? fin.rate;
  let downPct = opts.downPct ?? prefs.downPct;
  if (fin.id === 'cash') downPct = 100;
  downPct = Math.max(downPct, fin.minDownPct || 0);

  // ---- Startup costs ----
  const su = estimateStartup(listing, scenario, market, prefs, { price, condition: opts.condition });
  const overrides = opts.startupOverrides || {};
  for (const it of su.items) {
    if (overrides[it.key] != null && overrides[it.key] !== '') { it.estimate = it.amount; it.amount = Number(overrides[it.key]); it.overridden = true; }
  }
  const buildCosts = su.items.filter((i) => i.build).reduce((s, i) => s + i.amount, 0);

  // ---- Loan ----
  const financedBase = fin.financeBuild ? price + buildCosts : price;
  const downPayment = financedBase * downPct / 100;
  const loanAmount = Math.max(0, financedBase - downPayment);
  const pmt = monthlyPayment(loanAmount, rate, fin.termYears, fin.interestOnly);
  if (fin.pointsPct && loanAmount > 0) su.items.push({ key: 'points', label: 'Loan points / origination', amount: round(loanAmount * fin.pointsPct / 100, 50), note: `${fin.pointsPct}% of loan` });
  // Build costs rolled into a construction loan aren't paid in cash.
  const cashStartupItems = su.items.filter((i) => !(fin.financeBuild && i.build));

  // ---- Revenue ----
  const adr = opts.adr ?? market.adr;
  const occupancy = opts.occupancy ?? market.occupancy;
  const availableNights = Math.max(0, 365 - (prefs.ownerNights || 0));
  const unitNights = su.units.map((u) => ({ ...u, nightly: round(adr * u.adrMult), booked: availableNights * occupancy }));
  // Owner nights only block the main unit; extra units still rent.
  if (unitNights.length > 1) for (let i = 1; i < unitNights.length; i++) unitNights[i].booked = 365 * occupancy;
  const grossRevenue = unitNights.reduce((s, u) => s + u.nightly * u.booked, 0);
  const bookedNights = unitNights.reduce((s, u) => s + u.booked, 0);
  const stays = bookedNights / (cp.avgStayNights || 3);

  // ---- Operating expenses (stabilized year) ----
  const value0 = price + su.improvementValue;
  const totalSqft = su.units.reduce((s, u) => s + u.sqft, 0);
  const nUnits = Math.max(1, su.units.length);
  const fixed = {
    'Property tax': value0 * market.taxRate,
    Insurance: (cp.insuranceBase * nUnits + value0 * cp.insurancePctOfValue / 100) * (market.insuranceMult || 1),
    Utilities: (cp.utilitiesBaseMonthly * nUnits + cp.utilitiesPerSqftMonthly * totalSqft) * 12,
    'Internet / streaming': cp.internetMonthly * 12 * nUnits,
    Maintenance: price * cp.maintenancePctOfValue / 100 + su.improvementValue * cp.maintenancePctOfValue / 200,
    'STR license renewal': (market.permitAnnual || 0) * nUnits,
    'Software / accounting': useVacasa ? 0 : cp.softwarePerYear,
  };
  const hoa = hoaFor(listing);
  if (hoa.amount) fixed[hoa.estimated ? 'HOA (estimated, not in listing)' : 'HOA'] = hoa.amount * 12;
  const variablePct = (useVacasa ? cp.vacasaFeePct : cp.platformFeePct) + cp.capexPctOfRevenue;
  const variable = (rev) => ({
    [useVacasa ? `Vacasa management (${cp.vacasaFeePct}%)` : `Platform fees (${cp.platformFeePct}%)`]: rev * (useVacasa ? cp.vacasaFeePct : cp.platformFeePct) / 100,
    [`CapEx reserve (${cp.capexPctOfRevenue}%)`]: rev * cp.capexPctOfRevenue / 100,
    'Guest supplies': stays * (rev / (grossRevenue || 1)) * cp.suppliesPerStay,
  });
  const fixedTotal = Object.values(fixed).reduce((a, b) => a + b, 0);
  const stabilizedVar = variable(grossRevenue);
  const stabilizedOpex = fixedTotal + Object.values(stabilizedVar).reduce((a, b) => a + b, 0);
  const pmiAnnual = downPct < 20 ? loanAmount * (fin.pmiPct || 0) / 100 : 0;
  const debtAnnual = pmt * 12 + pmiAnnual;

  // Operating reserve (cash you keep, not spent).
  const reserve = cp.reserveMonths * (debtAnnual + stabilizedOpex) / 12;
  const reserveItem = { key: 'reserve', label: `Operating reserve (${cp.reserveMonths} mo)`, amount: round(reserve, 50), note: 'Cash set aside; still yours, so not counted against payback', recoverable: true };
  if (overrides.reserve != null && overrides.reserve !== '') { reserveItem.estimate = reserveItem.amount; reserveItem.amount = Number(overrides.reserve); reserveItem.overridden = true; }
  su.items.push(reserveItem);
  cashStartupItems.push(reserveItem);

  const startupCash = cashStartupItems.reduce((s, i) => s + i.amount, 0);
  const reserveCash = reserveItem.amount;
  const cashNeeded = downPayment + startupCash;
  const cashAtRisk = cashNeeded - reserveCash;

  // ---- Projection ----
  const g = cp.revenueGrowthPct / 100, eg = cp.expenseGrowthPct / 100, ap = cp.appreciationPct / 100;
  const r = rate / 100 / 12;
  let balance = loanAmount;
  let cum = 0;
  const years = [];
  let paybackYear = null, paybackWithEquityYear = null, firstPositiveYear = null;
  let prevPos = -cashAtRisk, prevPosEq = null;
  for (let y = 1; y <= PROJECTION_YEARS; y++) {
    const rev = grossRevenue * Math.pow(1 + g, y - 1) * (y === 1 ? cp.firstYearRampPct / 100 : 1);
    const opex = fixedTotal * Math.pow(1 + eg, y - 1) + Object.values(variable(rev)).reduce((a, b) => a + b, 0);
    let debt = 0;
    for (let m = 0; m < 12; m++) {
      if (balance <= 0.01 || (!fin.interestOnly && (y - 1) * 12 + m >= fin.termYears * 12)) { balance = Math.max(0, balance); if (!fin.interestOnly) balance = 0; continue; }
      const interest = balance * r;
      const pay = Math.min(pmt, fin.interestOnly ? interest : balance + interest);
      debt += pay;
      if (!fin.interestOnly) balance -= pay - interest;
    }
    if (downPct < 20 && balance / (price || 1) > 0.78) debt += pmiAnnual;
    const cf = rev - opex - debt;
    cum += cf;
    const value = value0 * Math.pow(1 + ap, y);
    const equity = value * (1 - SELLING_COST_PCT) - balance;
    const pos = cum - cashAtRisk;
    const posEq = cum - cashAtRisk + equity; // what you would walk away with if you sold
    years.push({ year: y, revenue: rev, opex, debt, cashFlow: cf, cumulative: cum, position: pos, positionWithEquity: posEq, balance, value, equity });
    if (firstPositiveYear == null && cf >= 0) firstPositiveYear = y;
    if (paybackYear == null && pos >= 0) paybackYear = interp(y, prevPos, pos);
    if (paybackWithEquityYear == null && posEq >= 0) paybackWithEquityYear = interp(y, prevPosEq ?? -cashAtRisk, posEq);
    prevPos = pos; prevPosEq = posEq;
  }

  const stabilizedCF = grossRevenue - stabilizedOpex - debtAnnual;
  const noi = grossRevenue - stabilizedOpex;
  const dscr = debtAnnual > 0 ? noi / debtAnnual : Infinity;
  const payoffYear = fin.id === 'cash' ? 0 : fin.interestOnly ? null : fin.termYears;

  const result = {
    listing, market, scenario, scenarioLabel: SCENARIOS[scenario]?.label || scenario,
    condition: su.condition,
    price, finance: { ...fin, rate }, downPct, downPayment, loanAmount, monthlyPI: pmt, pmiAnnual, debtAnnual,
    useVacasa, adr, occupancy, availableNights, units: unitNights, grossRevenue, bookedNights,
    fixedExpenses: fixed, variableExpenses: stabilizedVar, opexAnnual: stabilizedOpex, noi, dscr,
    stabilizedCF, monthlyCF: stabilizedCF / 12,
    startupItems: su.items, startupCash, reserveCash, cashNeeded, cashAtRisk,
    cashOnCash: cashAtRisk > 0 ? stabilizedCF / cashAtRisk : 0,
    capRate: value0 > 0 ? noi / (price + buildCosts) : 0,
    years, paybackYear, paybackWithEquityYear, firstPositiveYear, payoffYear,
    goal: prefs.goal, goalYears: prefs.goalYears, includeEquity: prefs.includeEquity,
  };
  result.verdict = verdictFor(result);
  result.summary = summarize(result);
  return result;
}

function interp(y, prev, cur) {
  if (prev == null || cur === prev) return y;
  const frac = (0 - prev) / (cur - prev);
  return Math.max(0, y - 1 + Math.min(1, Math.max(0, frac)));
}

export function verdictFor(r) {
  if (r.goal === 'breakeven') {
    if (r.stabilizedCF >= 0) return { code: 'BUY', label: 'Buy', reason: 'Rental income covers the mortgage and all expenses.' };
    if (r.dscr >= 0.9) return { code: 'MAYBE', label: 'Close', reason: `About $${fmt(-r.monthlyCF)}/mo short of breaking even. Worth it at a lower price.` };
    return { code: 'NO', label: "Don't buy", reason: `About $${fmt(-r.monthlyCF)}/mo short of covering the mortgage and expenses.` };
  }
  const pb = r.includeEquity ? r.paybackWithEquityYear : r.paybackYear;
  const n = r.goalYears;
  if (pb != null && pb <= n && r.stabilizedCF >= 0) return { code: 'BUY', label: 'Buy', reason: `Earns back your cash in ${fmtYears(pb)}, within your ${n}-year goal.` };
  if (pb != null && pb <= n * 1.5 && r.stabilizedCF >= -100 * 12) return { code: 'MAYBE', label: 'Close', reason: `Earns back your cash in ${fmtYears(pb)}, a little past your ${n}-year goal.` };
  if (r.stabilizedCF < 0) return { code: 'NO', label: "Don't buy", reason: `Loses about $${fmt(-r.monthlyCF)}/mo after the mortgage and expenses.` };
  return { code: 'NO', label: "Don't buy", reason: pb == null ? 'Does not earn back your cash within 30 years.' : `Takes ${fmtYears(pb)} to earn back your cash, past your ${n}-year goal.` };
}

export function fmt(n) { return Math.round(Math.abs(n)).toLocaleString('en-US'); }
export function money(n) { return (n < 0 ? '-$' : '$') + fmt(n); }
export function fmtYears(y) { if (y == null) return 'never'; if (y < 1) return 'under a year'; const v = Math.round(y * 10) / 10; return `${v} year${v === 1 ? '' : 's'}`; }

export function summarize(r) {
  const finTxt = r.finance.id === 'cash' ? 'in cash' : `with ${money(r.downPayment)} down (${r.downPct}%) on a ${r.finance.label.split(' (')[0]} at ${r.finance.rate}%`;
  const mgmt = r.useVacasa ? ' with Vacasa managing' : ' self-managed';
  const extra = r.startupCash - r.reserveCash;
  let s = `Buying this property for ${money(r.price)} ${finTxt}, plus about ${money(extra)} in startup costs${mgmt}, `;
  if (r.stabilizedCF >= 0) {
    s += `covers the mortgage and expenses with about ${money(r.monthlyCF)}/mo left over`;
    const pb = r.includeEquity ? r.paybackWithEquityYear : r.paybackYear;
    s += pb != null ? ` and earns back your ${money(r.cashAtRisk)} in ${fmtYears(pb)}${r.includeEquity ? ' (counting equity)' : ''}.` : `, but does not earn back your ${money(r.cashAtRisk)} within 30 years.`;
  } else {
    s += `falls about ${money(-r.monthlyCF)}/mo short of covering the mortgage and expenses`;
    s += r.firstPositiveYear ? `, turning positive around year ${r.firstPositiveYear}.` : '.';
  }
  return s;
}

/** Evaluate every applicable scenario and return them best-first. */
export function evaluateAll(listing, prefs, opts = {}) {
  const scen = applicableScenarios(listing, prefs);
  const list = (scen.length ? scen : [isLand(listing) ? 'build' : 'str_ready']).map((s) => evaluate(listing, prefs, { ...opts, scenario: s }));
  const rank = { BUY: 0, MAYBE: 1, NO: 2 };
  return list.sort((a, b) => rank[a.verdict.code] - rank[b.verdict.code] || score(b) - score(a));
}

function score(r) {
  const pb = r.includeEquity ? r.paybackWithEquityYear : r.paybackYear;
  return r.goal === 'breakeven' ? r.stabilizedCF : (pb == null ? -1e9 : -pb) + r.stabilizedCF / 1e6;
}

/** Highest purchase price that still gets a BUY verdict (null if none). */
export function maxPriceForBuy(listing, prefs, opts = {}) {
  const test = (p) => evaluate(listing, prefs, { ...opts, price: p }).verdict.code === 'BUY';
  const hi0 = (opts.price ?? listing.price) || 500000;
  if (test(hi0)) return hi0;
  let lo = 0, hi = hi0;
  if (!test(Math.max(1000, hi0 * 0.05))) return null;
  for (let i = 0; i < 25; i++) { const mid = (lo + hi) / 2; if (test(mid)) lo = mid; else hi = mid; }
  return Math.floor(lo / 1000) * 1000;
}

export function evaluationFlags(listing, market) {
  const flags = [];
  for (const f of market.strFlags || []) flags.push({ kind: /high risk/i.test(f) ? 'danger' : 'warn', text: f });
  for (const f of market.tinyHomeFlags || []) flags.push({ kind: 'info', text: f });
  if (listing.hoaFee) flags.push({ kind: 'warn', text: 'Has an HOA: check its rules allow short-term rentals.' });
  if (/condo/i.test(listing.propertyType || '')) flags.push({ kind: 'warn', text: 'Condos often ban or restrict STRs in their bylaws.' });
  if (market.id.endsWith('-other')) flags.push({ kind: 'info', text: 'Area rates are state-wide averages; set local ADR/occupancy for a sharper estimate.' });
  return flags;
}
