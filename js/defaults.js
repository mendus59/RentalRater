// Default settings. Every value is editable in the app's Settings tab.

// Rates are placeholders for late 2026; update them to the quotes you get.
export const FINANCE_OPTIONS = [
  { id: 'dscr30', label: 'DSCR loan, 30-yr (investor / STR)', rate: 7.5, termYears: 30, minDownPct: 20, pointsPct: 1.5, pmiPct: 0, interestOnly: false,
    note: 'Qualifies on the property\'s rental income rather than your W-2 income. The most common STR loan.' },
  { id: 'conv30inv', label: 'Conventional 30-yr (investment property)', rate: 7.0, termYears: 30, minDownPct: 15, pointsPct: 0, pmiPct: 0.6, interestOnly: false,
    note: 'Usually 15-25% down. PMI applies under 20% down.' },
  { id: 'conv15inv', label: 'Conventional 15-yr (investment property)', rate: 6.4, termYears: 15, minDownPct: 15, pointsPct: 0, pmiPct: 0.6, interestOnly: false,
    note: 'Bigger payment, much faster payoff. Good for the "own it free" goal.' },
  { id: 'conv30second', label: 'Conventional 30-yr (second home)', rate: 6.6, termYears: 30, minDownPct: 10, pointsPct: 0, pmiPct: 0.5, interestOnly: false,
    note: 'Lower rate and down payment, but lenders require real personal use and may not allow full-time rental. Ask your lender.' },
  { id: 'land', label: 'Land loan', rate: 9.0, termYears: 15, minDownPct: 30, pointsPct: 1, pmiPct: 0, interestOnly: false,
    note: 'For raw land. Typically 20-50% down and shorter terms.' },
  { id: 'construction', label: 'Construction-to-permanent', rate: 7.75, termYears: 30, minDownPct: 20, pointsPct: 1, pmiPct: 0, interestOnly: false,
    note: 'Finances the land plus the build. The build budget is added to the loan amount.', financeBuild: true },
  { id: 'heloc', label: 'HELOC / home equity (interest-only)', rate: 8.25, termYears: 10, minDownPct: 0, pointsPct: 0, pmiPct: 0, interestOnly: true,
    note: 'Borrow against equity in a home you own. Payments are interest-only during the draw period.' },
  { id: 'seller', label: 'Seller financing', rate: 6.5, termYears: 30, minDownPct: 10, pointsPct: 0, pmiPct: 0, interestOnly: false,
    note: 'Terms are whatever you negotiate with the seller.' },
  { id: 'cash', label: 'Cash (no loan)', rate: 0, termYears: 0, minDownPct: 100, pointsPct: 0, pmiPct: 0, interestOnly: false,
    note: 'No mortgage. Cash flow covers expenses only.' },
];

// Parameters behind the startup-cost and operating-cost estimates.
export const COST_PARAMS = {
  closingCostPct: 3.0,          // buyer closing costs, % of price
  furnishPerBedroom: 5000,      // furniture, beds, linens per bedroom
  furnishBase: 6000,            // living/kitchen/outdoor basics
  setupCost: 2500,              // smart lock, cameras, photos, listing setup, initial supplies
  renoPerSqft: { none: 0, light: 15, moderate: 45, major: 110 }, // national baseline $/sqft, scaled by area costIndex
  newBuildPerSqft: 275,         // stick-built cabin/home, national baseline $/sqft
  tinyHomeUnitCost: 85000,      // delivered tiny home / park model on foundation incl. finish-out
  tinyHomeSqft: 350,
  sitePrep: 15000,              // clearing, grading, pad, driveway
  wellCost: 25000,
  septicCost: 25000,
  powerHookup: 15000,
  landPermits: 8000,            // building permits, plan review, impact fees
  reserveMonths: 3,             // months of mortgage + expenses kept in reserve

  // Operating costs
  utilitiesBaseMonthly: 180,
  utilitiesPerSqftMonthly: 0.08,
  internetMonthly: 100,
  insuranceBase: 1200,
  insurancePctOfValue: 0.35,    // % of value per year, scaled by area insuranceMult
  maintenancePctOfValue: 1.0,   // % of value per year (0.5% for new builds)
  capexPctOfRevenue: 5,
  suppliesPerStay: 25,
  avgStayNights: 3,
  softwarePerYear: 400,         // dynamic pricing, accounting, etc.
  platformFeePct: 3,            // Airbnb/VRBO host fee when self-managing
  vacasaFeePct: 35,             // Vacasa full-service management, % of rental revenue
  firstYearRampPct: 85,         // year-one revenue as % of stabilized while reviews build
  revenueGrowthPct: 3,
  expenseGrowthPct: 3,
  appreciationPct: 3,
};

// Revenue multiplier on the market's 2-bedroom ADR.
export const BEDROOM_ADR_MULT = { 0: 0.6, 1: 0.75, 2: 1.0, 3: 1.3, 4: 1.6, 5: 1.9, 6: 2.2 };
export const TINY_HOME_ADR_MULT = 0.85; // novelty premium over a 1BR, below a 2BR

export const PROPERTY_TYPES = ['Single Family', 'Condo', 'Townhouse', 'Manufactured', 'Multi-Family', 'Land'];

export const SCENARIOS = {
  str_ready: { label: 'Rent as-is (repair to rentable)', short: 'As-is' },
  refurbish: { label: 'Refurbish (upgrade finishes, +15% nightly rate)', short: 'Refurbish' },
  tiny_home: { label: 'Add tiny home(s)', short: 'Tiny home' },
  build: { label: 'Build a cabin on the land', short: 'Build' },
};

export const CONDITIONS = {
  turnkey: { label: 'Turnkey / updated', reno: 'none' },
  good: { label: 'Good, minor touch-ups', reno: 'light' },
  dated: { label: 'Dated, needs updating', reno: 'moderate' },
  poor: { label: 'Needs major work', reno: 'major' },
};

export const DEFAULT_PREFS = {
  locations: [],                 // market ids; empty = all of WA and OR
  propertyTypes: ['Single Family', 'Condo', 'Townhouse', 'Manufactured', 'Land'],
  scenarios: ['str_ready', 'refurbish', 'tiny_home', 'build'],
  maxPrice: 1000000,
  minBeds: 0,
  financeId: 'dscr30',
  downPct: 25,
  rateOverride: null,            // null = use the finance option's rate
  goal: 'profit',                // 'profit' | 'breakeven'
  goalYears: 10,
  includeEquity: false,          // count principal paydown + appreciation toward the profit goal
  useVacasa: false,
  ownerNights: 14,               // nights per year you use it yourself
  tinyHomesOnLand: 2,
  tinyHomesOnLot: 1,
  buildSqft: 1000,
  buildBeds: 2,
  landHasWater: false,
  landHasSewer: false,
  landHasPower: false,
  costParams: { ...COST_PARAMS },
  financeOptions: FINANCE_OPTIONS.map((f) => ({ ...f })),
  marketOverrides: {},
};

export function mergePrefs(saved = {}) {
  const p = { ...DEFAULT_PREFS, ...saved };
  p.costParams = { ...COST_PARAMS, ...(saved.costParams || {}) };
  p.costParams.renoPerSqft = { ...COST_PARAMS.renoPerSqft, ...((saved.costParams || {}).renoPerSqft || {}) };
  const savedFin = Object.fromEntries((saved.financeOptions || []).map((f) => [f.id, f]));
  p.financeOptions = FINANCE_OPTIONS.map((f) => ({ ...f, ...(savedFin[f.id] || {}) }));
  p.marketOverrides = { ...(saved.marketOverrides || {}) };
  return p;
}
