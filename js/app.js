import * as store from './store.js';
import { evaluate, evaluateAll, applicableScenarios, maxPriceForBuy, evaluationFlags, money, fmtYears, isLand, guessCondition } from './calc.js';
import { mergePrefs, DEFAULT_PREFS, PROPERTY_TYPES, SCENARIOS, CONDITIONS, COST_PARAMS } from './defaults.js';
import { MARKETS, STATE_DEFAULTS, allMarkets, findMarket } from './markets.js';
import { nearestWater } from './geo.js';
import { bookmarkletHref } from './bookmarklet.js';

const state = {
  tab: 'listings',
  prefs: mergePrefs({}),
  data: { listings: [], updatedAt: null },
  saved: {},            // id -> { id, listing, opts, notes }
  lastVisit: null,
  filters: { verdict: 'all', market: 'all', q: '', sort: 'verdict' },
  user: null,
  detail: null,         // { listing, opts }
};

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (x, d = 0) => `${(x * 100).toFixed(d)}%`;

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2600);
}

// ---------------------------------------------------------------- boot
async function boot() {
  try {
    const res = await fetch(`data/listings.json?ts=${Date.now()}`);
    if (res.ok) state.data = await res.json();
  } catch { /* offline or missing file: manual evaluation still works */ }
  try {
    const res = await fetch('config/searches.json');
    if (res.ok) state.coverage = await res.json();
  } catch { /* coverage notes are optional */ }
  readPrefillFromHash();

  const { mode, error } = await store.init();
  if (error) toast(error);
  store.onAuth(async (u) => {
    state.user = u;
    renderAccount();
    if (!u) { renderSignedOut(); return; }
    const d = await store.loadUser();
    state.prefs = mergePrefs(d.prefs);
    state.lastVisit = d.lastVisit;
    state.saved = Object.fromEntries((await store.listProperties()).map((p) => [p.id, p]));
    render();
    if (state.data.updatedAt) store.markVisit(new Date().toISOString()).catch(() => {});
  });
  if (mode === 'firebase' && !store.currentUser()) renderSignedOut();
}

// The bookmarklet opens the app as #evaluate?address=...&price=...
function readPrefillFromHash() {
  const h = location.hash;
  if (!h.startsWith('#evaluate')) return;
  const qs = h.split('?')[1] || '';
  state.prefill = Object.fromEntries(new URLSearchParams(qs).entries());
  state.tab = 'evaluate';
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === 'evaluate'));
  history.replaceState(null, '', location.pathname + location.search);
}

function renderAccount() {
  const el = $('#account');
  if (store.getMode() === 'local') { el.innerHTML = `<span class="muted" title="Add your Firebase config to sync across devices">Local mode</span>`; return; }
  if (!state.user) { el.innerHTML = `<button class="btn primary" data-act="signin">Sign in</button>`; return; }
  el.innerHTML = `<span class="muted">${esc(state.user.displayName || '')}</span><button class="btn" data-act="signout">Sign out</button>`;
}

function renderSignedOut() {
  $('#main').innerHTML = `<div class="empty"><h1>RentalRater</h1><p>Rates Washington and Oregon listings as short-term rental investments.</p><button class="btn primary" data-act="signin">Sign in with Google</button></div>`;
}

document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-act],[data-tab],[data-open]');
  if (!t) return;
  if (t.dataset.tab) { state.tab = t.dataset.tab; document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b === t)); render(); return; }
  if (t.dataset.open) { openDetail(t.dataset.open); return; }
  const act = t.dataset.act;
  if (act === 'signin') store.signIn().catch((err) => toast(`Sign-in failed: ${err.message}`));
  if (act === 'signout') store.signOut();
  if (act === 'close') closeDetail();
  if (act === 'save-prop') saveDetail();
  if (act === 'unsave-prop') unsaveDetail();
  if (act === 'reset-cost') { delete state.detail.opts.startupOverrides[t.dataset.key]; renderDetail(); }
  if (act === 'verdict-chip') { state.filters.verdict = t.dataset.v; renderListings(); }
  if (act === 'save-settings') saveSettings();
  if (act === 'reset-settings') { if (confirmReset()) { state.prefs = mergePrefs({}); await store.savePrefs(DEFAULT_PREFS); render(); toast('Settings reset'); } }
  if (act === 'eval-manual') evalManual();
  if (act === 'copy-bookmarklet') { try { await navigator.clipboard.writeText($('#bookmarklet').dataset.code); toast('Bookmarklet code copied'); } catch { toast("Couldn't copy. Long-press the button instead."); } }
});

function confirmReset() { return window.confirm('Reset all settings to defaults?'); }

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.detail) closeDetail(); });

function render() {
  if (!state.user) return;
  if (state.tab === 'listings') renderListings();
  if (state.tab === 'evaluate') renderEvaluate();
  if (state.tab === 'saved') renderSaved();
  if (state.tab === 'settings') renderSettings();
}

// ---------------------------------------------------------------- listings
function matchesPrefs(l, p) {
  const market = findMarket(l, p.marketOverrides);
  if (p.locations.length && !p.locations.includes(market.id)) return false;
  const type = normalizeType(l.propertyType);
  if (p.propertyTypes.length && !p.propertyTypes.includes(type)) return false;
  if (p.maxPrice && l.price > p.maxPrice) return false;
  if (p.minBeds && !isLand(l) && (l.bedrooms || 0) < p.minBeds) return false;
  return true;
}

function normalizeType(t = '') {
  if (/land|lot/i.test(t)) return 'Land';
  if (/condo|apartment/i.test(t)) return 'Condo';
  if (/town/i.test(t)) return 'Townhouse';
  if (/manufactured|mobile/i.test(t)) return 'Manufactured';
  if (/multi/i.test(t)) return 'Multi-Family';
  return 'Single Family';
}

function evalListing(l) {
  const savedOpts = state.saved[l.id]?.opts || {};
  if (savedOpts.scenario) return evaluate(l, state.prefs, savedOpts);
  const all = evaluateAll(l, state.prefs, savedOpts);
  return all[0];
}

const VERDICT_RANK = { BUY: 0, MAYBE: 1, NO: 2 };

function renderListings() {
  const p = state.prefs;
  const active = (state.data.listings || []).filter((l) => l.status !== 'Inactive');
  const inPrefs = active.filter((l) => matchesPrefs(l, p));
  let rows = inPrefs.map((l) => ({ l, r: evalListing(l) }));
  const counts = { all: rows.length, BUY: 0, MAYBE: 0, NO: 0 };
  rows.forEach(({ r }) => counts[r.verdict.code]++);
  const f = state.filters;
  if (f.verdict !== 'all') rows = rows.filter(({ r }) => r.verdict.code === f.verdict);
  if (f.market !== 'all') rows = rows.filter(({ r }) => r.market.id === f.market);
  if (f.q) { const q = f.q.toLowerCase(); rows = rows.filter(({ l }) => `${l.formattedAddress} ${l.city} ${l.zipCode}`.toLowerCase().includes(q)); }
  const pb = (r) => (r.includeEquity ? r.paybackWithEquityYear : r.paybackYear) ?? 99;
  const sorters = {
    verdict: (a, b) => VERDICT_RANK[a.r.verdict.code] - VERDICT_RANK[b.r.verdict.code] || pb(a.r) - pb(b.r),
    payback: (a, b) => pb(a.r) - pb(b.r),
    cashflow: (a, b) => b.r.monthlyCF - a.r.monthlyCF,
    price: (a, b) => a.l.price - b.l.price,
    newest: (a, b) => String(b.l.firstSeen || b.l.listedDate || '').localeCompare(String(a.l.firstSeen || a.l.listedDate || '')),
  };
  rows.sort(sorters[f.sort] || sorters.verdict);

  const marketsInData = [...new Map(inPrefs.map((l) => { const m = findMarket(l, p.marketOverrides); return [m.id, m]; })).values()];
  const updated = state.data.updatedAt ? new Date(state.data.updatedAt).toLocaleString() : null;
  const sampleOnly = active.length && active.every((l) => l.sample);
  const goalTxt = p.goal === 'breakeven' ? 'break even on the mortgage indefinitely' : `earn back your cash within ${p.goalYears} years${p.includeEquity ? ' (counting equity)' : ''}`;

  $('#main').innerHTML = `
    ${coverageNotice()}
    ${sampleOnly ? `<div class="notice"><strong>Sample data.</strong> These are made-up listings so you can try the app. Real WA and OR listings appear once the daily job has a RentCast API key (see the README).</div>` : ''}
    <div class="row" style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:baseline">
      <h1>Listings</h1>
      <span class="muted small">${sampleOnly ? 'Sample data' : updated ? `Updated ${esc(updated)}` : 'No listing data yet'} · Goal: ${esc(goalTxt)} · ${p.useVacasa ? 'Vacasa managed' : 'Self-managed'}</span>
    </div>
    <div class="stats">
      ${['all', 'BUY', 'MAYBE', 'NO'].map((v) => `<button class="chip ${f.verdict === v ? 'on' : ''}" data-act="verdict-chip" data-v="${v}">${v === 'all' ? 'All' : v === 'NO' ? "Don't buy" : v === 'MAYBE' ? 'Close' : 'Buy'} · ${counts[v]}</button>`).join('')}
    </div>
    <div class="filters">
      <label>Search<input type="search" id="f-q" value="${esc(f.q)}" placeholder="Address, city, ZIP"></label>
      <label>Area<select id="f-market"><option value="all">All areas</option>${marketsInData.map((m) => `<option value="${m.id}" ${f.market === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>
      <label>Sort<select id="f-sort">${[['verdict', 'Best verdict'], ['payback', 'Fastest payback'], ['cashflow', 'Monthly cash flow'], ['price', 'Lowest price'], ['newest', 'Newest']].map(([k, v]) => `<option value="${k}" ${f.sort === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    </div>
    ${rows.length ? `<div class="grid">${rows.slice(0, 300).map(({ l, r }) => card(l, r)).join('')}</div>${rows.length > 300 ? `<p class="muted">Showing 300 of ${rows.length}. Narrow the filters to see more.</p>` : ''}`
      : `<div class="empty">${active.length ? 'No listings match your filters and Settings (areas, property types, max price).' : 'No listings yet. Use the Evaluate tab to rate a property by hand.'}</div>`}
  `;
  $('#f-q').addEventListener('input', (e) => { f.q = e.target.value; debounce(renderListingsKeepFocus, 200); });
  $('#f-market').addEventListener('change', (e) => { f.market = e.target.value; renderListings(); });
  $('#f-sort').addEventListener('change', (e) => { f.sort = e.target.value; renderListings(); });
}

function coverageNotice() {
  const c = state.coverage;
  if (!c) return '';
  const f = c.filters || {};
  const maxPrice = Number(String(f.price || '').split(':')[1]);
  const regions = c.regions || [];
  const live = (state.data.coverage?.regions || []).reduce((m, r) => ((m[r.id] = r), m), {});
  const when = (id) => { const d = live[id]?.lastRefreshed; return d ? `checked ${new Date(d).toLocaleDateString()}` : 'not fetched yet'; };
  return `<details class="notice coverage"><summary><strong>What's covered:</strong> ${esc((f.propertyType || '').split('|').join(', '))} under ${money(maxPrice || 0)}, within ${f.maxWaterMiles ?? 10} miles of the Pacific, Puget Sound, the Columbia River and similar water, plus ${regions.filter((r) => !r.coastal).length} inland STR hotspots.</summary>
    <p>To stay on RentCast's free plan (50 calls a month), new listings in each area are picked up every few days and every listing is fully re-checked about every two weeks. Distances to water are approximate. Anything outside this can still be rated on the Evaluate tab or with the bookmarklet.</p>
    <div class="two"><div><b>Coastal and river areas</b><ul>${regions.filter((r) => r.coastal).map((r) => `<li>${esc(r.name)} <span class="muted small">(${when(r.id)})</span></li>`).join('')}</ul></div>
    <div><b>Inland areas included anyway</b><ul>${regions.filter((r) => !r.coastal).map((r) => `<li>${esc(r.name)} <span class="muted small">(${when(r.id)})</span><br><span class="small">${esc(r.why || '')}</span></li>`).join('')}</ul>
    <b>Left out on purpose</b><ul>${(c.excluded || []).map((x) => `<li class="small">${esc(x)}</li>`).join('')}</ul></div></div>
  </details>`;
}

function waterText(l) {
  const w = l.waterMiles != null ? { miles: l.waterMiles, name: l.waterName } : nearestWater(l.latitude, l.longitude);
  if (!w || !w.name) return '';
  return w.miles < 0.5 ? `On or by the ${w.name}` : `~${w.miles} mi to the ${w.name}`;
}

function renderListingsKeepFocus() { const pos = $('#f-q').selectionStart; renderListings(); const q = $('#f-q'); q.focus(); q.setSelectionRange(pos, pos); }
function debounce(fn, ms) { clearTimeout(debounce._t); debounce._t = setTimeout(fn, ms); }

function isNew(l) { return state.lastVisit && l.firstSeen && l.firstSeen > state.lastVisit; }

function card(l, r) {
  const pb = r.includeEquity ? r.paybackWithEquityYear : r.paybackYear;
  const facts = isLand(l)
    ? `Land · ${l.lotSize ? (l.lotSize / 43560).toFixed(2) + ' ac' : 'lot size n/a'}`
    : `${l.bedrooms ?? '?'} bd · ${l.bathrooms ?? '?'} ba · ${l.squareFootage ? l.squareFootage.toLocaleString() + ' sqft' : 'sqft n/a'} · ${esc(normalizeType(l.propertyType))}${l.yearBuilt ? ' · ' + l.yearBuilt : ''}`;
  return `<button class="card" data-open="${esc(l.id)}">
    <div class="row"><span class="badge ${r.verdict.code}">${esc(r.verdict.label)}</span>
      <span>${isNew(l) ? '<span class="badge new">New</span> ' : ''}${l.sample ? '<span class="badge sample">Sample</span> ' : ''}${state.saved[l.id] ? '★' : ''}</span></div>
    <div class="addr">${esc(l.formattedAddress || l.addressLine1 || 'Unknown address')}</div>
    <div class="facts">${money(l.price)} · ${facts}</div>
    <div class="facts">${esc(r.market.name)} · ${esc(SCENARIOS[r.scenario].short)}${waterText(l) ? ' · ' + esc(waterText(l)) : ''}</div>
    <div class="nums">
      <div><span>Cash flow</span><b class="${r.monthlyCF >= 0 ? 'pos' : 'neg'}">${money(r.monthlyCF)}/mo</b></div>
      <div><span>Payback</span><b>${fmtYears(pb)}</b></div>
      <div><span>Cash needed</span><b>${money(r.cashNeeded)}</b></div>
    </div>
  </button>`;
}

// ---------------------------------------------------------------- detail
function findListing(id) {
  return (state.data.listings || []).find((l) => l.id === id) || state.saved[id]?.listing;
}

function openDetail(id) {
  const listing = findListing(id);
  if (!listing) return;
  const savedOpts = state.saved[id]?.opts || {};
  const best = savedOpts.scenario ? savedOpts.scenario : evaluateAll(listing, state.prefs, savedOpts)[0].scenario;
  state.detail = { listing, opts: { startupOverrides: {}, ...JSON.parse(JSON.stringify(savedOpts)), scenario: best } };
  $('#drawer').hidden = false;
  document.body.style.overflow = 'hidden';
  renderDetail();
}

function closeDetail() { state.detail = null; $('#drawer').hidden = true; document.body.style.overflow = ''; render(); }

function renderDetail() {
  const { listing: l, opts } = state.detail;
  const p = state.prefs;
  const r = evaluate(l, p, opts);
  const maxBuy = maxPriceForBuy(l, p, opts);
  const flags = evaluationFlags(l, r.market);
  const scen = applicableScenarios(l, { ...p, scenarios: Object.keys(SCENARIOS) });
  const pb = r.includeEquity ? r.paybackWithEquityYear : r.paybackYear;
  const saved = !!state.saved[l.id];
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent((l.formattedAddress || '') + ' for sale')}`;
  const opt = (v, label, cur) => `<option value="${esc(v)}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(label)}</option>`;
  const numField = (id, label, val, step = 'any', attrs = '') => `<label class="field">${label}<input type="number" id="${id}" value="${val ?? ''}" step="${step}" ${attrs}></label>`;

  const expenses = [
    ['Mortgage (P&I)', r.monthlyPI * 12], ...(r.pmiAnnual ? [['PMI', r.pmiAnnual]] : []),
    ...Object.entries(r.fixedExpenses).filter(([, v]) => v > 0), ...Object.entries(r.variableExpenses),
  ];

  $('#drawer').innerHTML = `<div class="sheet" role="dialog" aria-label="Property evaluation">
    <header>
      <div><h1>${esc(l.formattedAddress || 'Property')}</h1>
        <div class="muted small">${esc(r.market.name)}, ${esc(r.market.state)} · ${l.sample ? 'Sample listing' : `<a href="${searchUrl}" target="_blank" rel="noopener">Look up this listing</a>`}${l.daysOnMarket != null ? ` · ${l.daysOnMarket} days on market` : ''}${waterText(l) ? ` · ${esc(waterText(l))}` : ''}${l.src ? ` · <a href="${esc(l.src)}" target="_blank" rel="noopener">Original listing</a>` : ''}</div></div>
      <div style="display:flex;gap:8px">${saved ? `<button class="btn" data-act="unsave-prop">★ Saved</button>` : `<button class="btn primary" data-act="save-prop">☆ Save</button>`}<button class="btn" data-act="close" aria-label="Close">✕</button></div>
    </header>

    <div class="verdict ${r.verdict.code}">
      <div class="big">${esc(r.verdict.label)}</div>
      <p>${esc(r.summary)}</p>
      <p class="small muted">${esc(r.verdict.reason)} ${maxBuy && maxBuy < r.price ? `It becomes a Buy at about <b>${money(maxBuy)}</b> or less.` : ''}${maxBuy == null ? 'No purchase price gets this to a Buy under these settings.' : ''}</p>
    </div>

    <section class="panel">
      <h2>Your assumptions</h2>
      <div class="controls">
        <label class="field">Plan<select id="d-scenario">${scen.map((s) => opt(s, SCENARIOS[s].label, r.scenario)).join('')}</select></label>
        ${numField('d-price', 'Offer price ($)', Math.round(r.price), 1000)}
        <label class="field">Financing<select id="d-fin">${p.financeOptions.map((f) => opt(f.id, f.label, r.finance.id)).join('')}</select></label>
        ${numField('d-down', 'Down payment (%)', r.downPct, 1, r.finance.id === 'cash' ? 'disabled' : '')}
        ${numField('d-rate', 'Interest rate (%)', r.finance.rate, 0.05, r.finance.id === 'cash' ? 'disabled' : '')}
        <label class="field">Management<select id="d-vacasa">${opt('0', 'Self-managed', r.useVacasa ? 1 : 0)}${opt('1', `Vacasa (${p.costParams.vacasaFeePct}%)`, r.useVacasa ? 1 : 0)}</select></label>
        ${isLand(l) ? '' : `<label class="field">Condition<select id="d-cond">${Object.entries(CONDITIONS).map(([k, v]) => opt(k, v.label, r.condition)).join('')}</select></label>`}
        ${numField('d-adr', 'Nightly rate, 2BR baseline ($)', r.adr, 5)}
        ${numField('d-occ', 'Occupancy (%)', Math.round(r.occupancy * 100), 1)}
      </div>
      <p class="small muted" style="margin-bottom:0">${esc(r.finance.note || '')} Area estimates for ${esc(r.market.name)}: $${r.market.adr}/night for a 2BR, ${pct(r.market.occupancy)} occupancy. Units here: ${r.units.map((u) => `${esc(u.label)} ~$${u.nightly}/night`).join(', ')}.</p>
    </section>

    <div class="kpis" style="margin-bottom:16px">
      ${kpi('Cash needed', money(r.cashNeeded))}
      ${kpi('Monthly mortgage', money(r.monthlyPI + r.pmiAnnual / 12))}
      ${kpi('Gross revenue / yr', money(r.grossRevenue))}
      ${kpi('Expenses / yr', money(r.opexAnnual))}
      ${kpi('Cash flow / mo', `<span class="${r.monthlyCF >= 0 ? 'pos' : 'neg'}">${money(r.monthlyCF)}</span>`)}
      ${kpi('Cash back in', fmtYears(r.paybackYear))}
      ${kpi('With equity, in', fmtYears(r.paybackWithEquityYear))}
      ${kpi('Debt coverage', isFinite(r.dscr) ? r.dscr.toFixed(2) + '×' : 'No debt')}
      ${kpi('Cash-on-cash', pct(r.cashOnCash, 1))}
      ${kpi('Loan paid off', r.payoffYear === 0 ? 'No loan' : r.payoffYear ? `Year ${r.payoffYear}` : 'Interest-only')}
    </div>

    <section class="panel chart"><h2>Your position over time</h2>${chart(r)}
      <div class="legend"><span><i style="background:var(--accent)"></i>Cash returned minus cash put in</span><span><i style="background:var(--info)"></i>Including equity if sold</span>${p.goal === 'profit' ? `<span><i style="background:var(--maybe)"></i>Your ${p.goalYears}-year goal</span>` : ''}</div>
    </section>

    <div class="two">
      <section class="panel">
        <h2>Startup costs</h2>
        <p class="small muted">Estimated from the property and area. Type a number to replace an estimate.</p>
        <div class="table-wrap"><table><thead><tr><th>Category</th><th class="r">Amount</th><th></th></tr></thead><tbody>
          <tr><td>Down payment</td><td class="r num">${money(r.downPayment)}</td><td></td></tr>
          ${r.startupItems.filter((i) => i.key !== 'points').map((i) => `<tr><td>${esc(i.label)}<div class="small muted">${esc(i.overridden ? `Estimate was ${money(i.estimate)}` : i.note)}</div></td>
            <td class="r"><input type="number" step="100" data-cost="${esc(i.key)}" value="${Math.round(i.amount)}" class="${i.overridden ? 'overridden' : ''}"></td>
            <td>${i.overridden ? `<button class="btn link" data-act="reset-cost" data-key="${esc(i.key)}" title="Use estimate">↺</button>` : ''}</td></tr>`).join('')}
          ${r.startupItems.filter((i) => i.key === 'points').map((i) => `<tr><td>${esc(i.label)}<div class="small muted">${esc(i.note)}</div></td><td class="r num">${money(i.amount)}</td><td></td></tr>`).join('')}
          <tr><th>Total cash needed</th><th class="r num">${money(r.cashNeeded)}</th><th></th></tr>
        </tbody></table></div>
      </section>
      <section class="panel">
        <h2>Yearly operating costs</h2>
        <p class="small muted">Stabilized year. ${r.bookedNights.toFixed(0)} booked nights, ${p.ownerNights} nights for your own use.</p>
        <table><tbody>
          ${expenses.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="r num">${money(v)}</td></tr>`).join('')}
          <tr><th>Total</th><th class="r num">${money(r.opexAnnual + r.debtAnnual)}</th></tr>
          <tr><td>Revenue</td><td class="r num">${money(r.grossRevenue)}</td></tr>
          <tr><th>Cash flow</th><th class="r num ${r.stabilizedCF >= 0 ? 'pos' : 'neg'}">${money(r.stabilizedCF)}</th></tr>
        </tbody></table>
      </section>
    </div>

    ${flags.length ? `<section class="panel"><h2>Zoning and STR rules to check</h2><ul class="flags">${flags.map((f) => `<li class="${f.kind}">${esc(f.text)}</li>`).join('')}</ul><p class="small muted">Heads-up only, from general knowledge of the area. Confirm with the city or county.</p></section>` : ''}

    <section class="panel"><details><summary>Year-by-year projection</summary><div class="table-wrap"><table>
      <thead><tr><th>Year</th><th class="r">Revenue</th><th class="r">Expenses</th><th class="r">Mortgage</th><th class="r">Cash flow</th><th class="r">Cash position</th><th class="r">With equity</th></tr></thead>
      <tbody>${r.years.filter((y) => y.year <= 10 || y.year % 5 === 0).map((y) => `<tr><td>${y.year}</td><td class="r num">${money(y.revenue)}</td><td class="r num">${money(y.opex)}</td><td class="r num">${money(y.debt)}</td><td class="r num ${y.cashFlow >= 0 ? 'pos' : 'neg'}">${money(y.cashFlow)}</td><td class="r num">${money(y.position)}</td><td class="r num">${money(y.positionWithEquity)}</td></tr>`).join('')}</tbody>
    </table></div><p class="small muted">Assumes ${p.costParams.revenueGrowthPct}% revenue growth, ${p.costParams.expenseGrowthPct}% expense growth, ${p.costParams.appreciationPct}% appreciation, year one at ${p.costParams.firstYearRampPct}% while reviews build, and 6% selling costs in the equity column.</p></details></section>
  </div>`;

  const sheet = $('#drawer .sheet');
  const bind = (id, fn) => { const el = $(id, sheet); if (el) el.addEventListener('change', (e) => { fn(e.target.value); renderDetailKeepScroll(); }); };
  bind('#d-scenario', (v) => { opts.scenario = v; });
  bind('#d-price', (v) => { opts.price = v === '' ? undefined : Number(v); });
  bind('#d-fin', (v) => { opts.financeId = v; delete opts.rate; delete opts.downPct; const f = p.financeOptions.find((x) => x.id === v); if (f && p.downPct < f.minDownPct) opts.downPct = f.minDownPct; });
  bind('#d-down', (v) => { opts.downPct = Number(v); });
  bind('#d-rate', (v) => { opts.rate = Number(v); });
  bind('#d-vacasa', (v) => { opts.useVacasa = v === '1'; });
  bind('#d-cond', (v) => { opts.condition = v; });
  bind('#d-adr', (v) => { opts.adr = v === '' ? undefined : Number(v); });
  bind('#d-occ', (v) => { opts.occupancy = v === '' ? undefined : Number(v) / 100; });
  sheet.querySelectorAll('[data-cost]').forEach((inp) => inp.addEventListener('change', (e) => {
    const key = e.target.dataset.cost; const v = e.target.value;
    if (v === '') delete opts.startupOverrides[key]; else opts.startupOverrides[key] = Number(v);
    renderDetailKeepScroll();
  }));
}

function renderDetailKeepScroll() { const s = $('#drawer .sheet'); const top = s ? s.scrollTop : 0; renderDetail(); $('#drawer .sheet').scrollTop = top; if (state.saved[state.detail.listing.id]) saveDetail(true); }

const kpi = (label, val) => `<div class="kpi"><span>${label}</span><b>${val}</b></div>`;

function chart(r) {
  const W = 760, H = 240, P = { l: 64, r: 12, t: 12, b: 26 };
  const ys = r.years;
  const vals = ys.flatMap((y) => [y.position, y.positionWithEquity]).concat([-r.cashAtRisk, 0]);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (max - min < 1) max = min + 1;
  const x = (yr) => P.l + (yr / ys.length) * (W - P.l - P.r);
  const y = (v) => P.t + (1 - (v - min) / (max - min)) * (H - P.t - P.b);
  const line = (key) => `M${x(0)},${y(-r.cashAtRisk)} ` + ys.map((d) => `L${x(d.year).toFixed(1)},${y(d[key]).toFixed(1)}`).join(' ');
  const ticks = 4;
  const tickVals = Array.from({ length: ticks + 1 }, (_, i) => min + (i * (max - min)) / ticks);
  const short = (v) => { const a = Math.abs(v); const s = a >= 1e6 ? (a / 1e6).toFixed(1) + 'M' : (a / 1e3).toFixed(0) + 'k'; return (v < 0 ? '-$' : '$') + s; };
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cash position by year">
    ${tickVals.map((v) => `<line class="axis" x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${P.l - 6}" y="${y(v) + 4}" text-anchor="end">${short(v)}</text>`).join('')}
    <line class="zero" x1="${P.l}" x2="${W - P.r}" y1="${y(0)}" y2="${y(0)}"/>
    ${[0, 5, 10, 15, 20, 25, 30].map((yr) => `<text x="${x(yr)}" y="${H - 8}" text-anchor="middle">${yr === 0 ? 'Buy' : 'Yr ' + yr}</text>`).join('')}
    ${r.goal === 'profit' ? `<line class="goal" x1="${x(r.goalYears)}" x2="${x(r.goalYears)}" y1="${P.t}" y2="${H - P.b}"/>` : ''}
    <path class="l2" d="${line('positionWithEquity')}"/>
    <path class="l1" d="${line('position')}"/>
  </svg>`;
}

async function saveDetail(silent = false) {
  const { listing, opts } = state.detail;
  const rec = { id: listing.id, listing, opts, notes: state.saved[listing.id]?.notes || '' };
  state.saved[listing.id] = rec;
  try { await store.saveProperty(rec); if (!silent) { toast('Saved'); renderDetailKeepScrollNoSave(); } }
  catch (e) { toast(`Couldn't save: ${e.message}`); }
}

function renderDetailKeepScrollNoSave() { const s = $('#drawer .sheet'); const top = s.scrollTop; renderDetail(); $('#drawer .sheet').scrollTop = top; }

async function unsaveDetail() {
  const id = state.detail.listing.id;
  delete state.saved[id];
  try { await store.deleteProperty(id); toast('Removed from saved'); } catch (e) { toast(`Couldn't remove: ${e.message}`); }
  if (!findListing(id)) { closeDetail(); return; }
  renderDetailKeepScrollNoSave();
}

// ---------------------------------------------------------------- evaluate (manual)
function renderEvaluate() {
  const markets = allMarkets();
  $('#main').innerHTML = `<h1>Evaluate a property</h1>
    <p class="muted">Enter a listing you found anywhere. Leave fields blank if you don't know them; RentalRater fills in estimates.</p>
    <form class="panel" id="manual" onsubmit="return false">
      <div class="settings-grid">
        <label class="field" style="grid-column:1/-1">Address<input type="text" name="address" placeholder="123 Main St, Bend, OR 97701" required></label>
        <label class="field">City<input type="text" name="city" placeholder="Bend"></label>
        <label class="field">State<select name="state"><option>WA</option><option>OR</option></select></label>
        <label class="field">Area (optional)<select name="market"><option value="">Match by city</option>${markets.map((m) => `<option value="${m.id}">${esc(m.name)}, ${m.state}</option>`).join('')}</select></label>
        <label class="field">Type<select name="type">${PROPERTY_TYPES.map((t) => `<option>${t}</option>`).join('')}</select></label>
        <label class="field">Asking price ($)<input type="number" name="price" required step="1000"></label>
        <label class="field">Bedrooms<input type="number" name="beds" min="0"></label>
        <label class="field">Bathrooms<input type="number" name="baths" min="0" step="0.5"></label>
        <label class="field">Square feet<input type="number" name="sqft" min="0"></label>
        <label class="field">Lot size (acres)<input type="number" name="acres" min="0" step="0.01"></label>
        <label class="field">Year built<input type="number" name="year" min="1800" max="2030"></label>
        <label class="field">Condition<select name="condition"><option value="">Guess from year built</option>${Object.entries(CONDITIONS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></label>
        <label class="field">HOA ($/mo)<input type="number" name="hoa" min="0"></label>
      </div>
      <input type="hidden" name="lat"><input type="hidden" name="lon"><input type="hidden" name="src">
      <p><button class="btn primary" data-act="eval-manual">Evaluate</button></p>
    </form>
    <section class="panel"><h2>Rate listings from Zillow, Redfin or Realtor.com</h2>
      <p>Drag this button to your bookmarks bar: <a class="btn primary" id="bookmarklet" href="#">Rate on RentalRater</a></p>
      <p class="small muted">While you're looking at a listing, click the bookmark. It reads that one page and opens this form with the address, price, beds, baths, size, lot, year built and HOA filled in. Check the numbers, since every site lays its pages out differently. On a phone, add any page as a bookmark, then edit it and paste <button class="btn link" data-act="copy-bookmarklet">this code</button> in as the address.</p>
    </section>`;
  const appUrl = location.origin + location.pathname;
  const href = bookmarkletHref(appUrl);
  const bm = $('#bookmarklet');
  bm.setAttribute('href', href);
  bm.addEventListener('click', (e) => { e.preventDefault(); toast('Drag this button to your bookmarks bar'); });
  bm.dataset.code = href;
  if (state.prefill) fillForm(state.prefill);
}

function fillForm(p) {
  const form = $('#manual');
  const set = (name, val) => { if (val != null && val !== '' && form.elements[name]) form.elements[name].value = val; };
  set('address', p.address); set('city', p.city);
  if (/^(WA|OR)$/i.test(p.state || '')) set('state', p.state.toUpperCase());
  if (PROPERTY_TYPES.includes(p.type)) set('type', p.type);
  set('price', p.price && Math.round(Number(p.price))); set('beds', p.beds); set('baths', p.baths); set('sqft', p.sqft);
  set('acres', p.acres); set('year', p.year); set('hoa', p.hoa); set('lat', p.lat); set('lon', p.lon); set('src', p.src);
  state.prefill = null;
  toast('Filled in from the listing. Check the numbers, then press Evaluate.');
}

function evalManual() {
  const form = $('#manual');
  if (!form.reportValidity()) return;
  const v = Object.fromEntries(new FormData(form).entries());
  const n = (x) => (x === '' || x == null ? undefined : Number(x));
  let city = v.city.trim(), st = v.state;
  if (v.market) { const m = allMarkets().find((mk) => mk.id === v.market); st = m.state; if (!city && m.cities[0]) city = m.cities[0]; }
  const listing = {
    id: `manual-${Date.now()}`, manual: true, formattedAddress: v.address.trim(), city, state: st,
    propertyType: v.type, price: n(v.price), bedrooms: n(v.beds), bathrooms: n(v.baths), squareFootage: n(v.sqft),
    lotSize: v.acres ? Number(v.acres) * 43560 : undefined, yearBuilt: n(v.year), condition: v.condition || undefined, hoaFee: n(v.hoa),
    latitude: n(v.lat), longitude: n(v.lon), src: v.src || undefined,
  };
  if (v.market) listing.marketId = v.market;
  state.saved[listing.id] = { id: listing.id, listing, opts: {} };
  store.saveProperty(state.saved[listing.id]).catch(() => {});
  openDetail(listing.id);
}

// ---------------------------------------------------------------- saved
function renderSaved() {
  const recs = Object.values(state.saved);
  const rows = recs.map((rec) => {
    const l = (state.data.listings || []).find((x) => x.id === rec.id) || rec.listing;
    return { l, r: evalListing(l) };
  });
  rows.sort((a, b) => VERDICT_RANK[a.r.verdict.code] - VERDICT_RANK[b.r.verdict.code]);
  $('#main').innerHTML = `<h1>Saved</h1><p class="muted">Properties you saved or entered by hand, re-rated with your current settings.</p>
    ${rows.length ? `<div class="grid">${rows.map(({ l, r }) => card(l, r)).join('')}</div>` : '<div class="empty">Nothing saved yet. Open a listing and press Save.</div>'}`;
}

// ---------------------------------------------------------------- settings
function renderSettings() {
  const p = state.prefs;
  const cp = p.costParams;
  const chk = (name, val, checked, label) => `<label class="check"><input type="checkbox" name="${name}" value="${esc(val)}" ${checked ? 'checked' : ''}> ${esc(label)}</label>`;
  const num = (name, label, val, step = 'any') => `<label class="field">${label}<input type="number" name="${name}" value="${val}" step="${step}"></label>`;
  const byState = (st) => MARKETS.filter((m) => m.state === st).concat([STATE_DEFAULTS[st]]);
  const costFields = [
    ['closingCostPct', 'Closing costs (% of price)'], ['furnishBase', 'Furnishing base ($)'], ['furnishPerBedroom', 'Furnishing per bedroom ($)'], ['setupCost', 'Setup per unit ($)'],
    ['newBuildPerSqft', 'New build ($/sqft)'], ['tinyHomeUnitCost', 'Tiny home, each ($)'], ['sitePrep', 'Site prep ($)'], ['wellCost', 'Well ($)'], ['septicCost', 'Septic ($)'], ['powerHookup', 'Power hookup ($)'], ['landPermits', 'Building permits ($)'], ['reserveMonths', 'Operating reserve (months)'],
  ];
  const opFields = [
    ['utilitiesBaseMonthly', 'Utilities base ($/mo per unit)'], ['utilitiesPerSqftMonthly', 'Utilities ($/sqft/mo)'], ['internetMonthly', 'Internet ($/mo per unit)'], ['insuranceBase', 'Insurance base ($/yr per unit)'], ['insurancePctOfValue', 'Insurance (% of value/yr)'],
    ['maintenancePctOfValue', 'Maintenance (% of value/yr)'], ['capexPctOfRevenue', 'CapEx reserve (% of revenue)'], ['suppliesPerStay', 'Supplies per stay ($)'], ['avgStayNights', 'Average stay (nights)'], ['softwarePerYear', 'Software/accounting ($/yr)'],
    ['platformFeePct', 'Airbnb/VRBO host fee (%)'], ['vacasaFeePct', 'Vacasa fee (%)'], ['firstYearRampPct', 'Year-one revenue (% of normal)'], ['revenueGrowthPct', 'Revenue growth (%/yr)'], ['expenseGrowthPct', 'Expense growth (%/yr)'], ['appreciationPct', 'Appreciation (%/yr)'],
  ];
  $('#main').innerHTML = `<h1>Settings</h1>
  <form id="settings" onsubmit="return false">
    <section class="panel"><h2>Your goal</h2>
      <label class="check"><input type="radio" name="goal" value="profit" ${p.goal === 'profit' ? 'checked' : ''}> Earn back my cash and turn a profit within <input type="number" name="goalYears" value="${p.goalYears}" min="1" max="30" style="width:70px"> years</label><br>
      <label class="check"><input type="radio" name="goal" value="breakeven" ${p.goal === 'breakeven' ? 'checked' : ''}> Just break even: rent covers the mortgage and expenses indefinitely (own it and use it for free)</label><br>
      <label class="check"><input type="checkbox" name="includeEquity" ${p.includeEquity ? 'checked' : ''}> Count equity and appreciation toward the profit goal (what you'd walk away with if you sold)</label>
      <div class="settings-grid" style="margin-top:10px">
        ${num('ownerNights', 'Nights per year you use it', p.ownerNights, 1)}
        <label class="field">Management<select name="useVacasa"><option value="0" ${!p.useVacasa ? 'selected' : ''}>Self-managed</option><option value="1" ${p.useVacasa ? 'selected' : ''}>Vacasa (${cp.vacasaFeePct}%)</option></select></label>
      </div>
    </section>

    <section class="panel"><h2>Financing</h2>
      <div class="settings-grid">
        <label class="field">Default loan<select name="financeId">${p.financeOptions.map((f) => `<option value="${f.id}" ${p.financeId === f.id ? 'selected' : ''}>${esc(f.label)}</option>`).join('')}</select></label>
        ${num('downPct', 'Default down payment (%)', p.downPct, 1)}
      </div>
      <details style="margin-top:10px"><summary>Loan options and rates</summary><div class="table-wrap"><table>
        <thead><tr><th>Loan</th><th>Rate %</th><th>Term (yrs)</th><th>Min down %</th><th>Points %</th><th>PMI %</th></tr></thead>
        <tbody>${p.financeOptions.filter((f) => f.id !== 'cash').map((f) => `<tr><td>${esc(f.label)}</td>${['rate', 'termYears', 'minDownPct', 'pointsPct', 'pmiPct'].map((k) => `<td><input type="number" step="any" data-fin="${f.id}" data-k="${k}" value="${f[k]}" style="width:80px"></td>`).join('')}</tr>`).join('')}</tbody>
      </table></div><p class="small muted">Defaults are rough late-2026 guesses. Replace them with real quotes.</p></details>
    </section>

    <section class="panel"><h2>What to look for</h2>
      <div class="settings-grid">${num('maxPrice', 'Max price ($)', p.maxPrice, 1000)}${num('minBeds', 'Min bedrooms', p.minBeds, 1)}</div>
      <h3 style="margin-top:12px">Property types</h3>${PROPERTY_TYPES.map((t) => chk('propertyTypes', t, p.propertyTypes.includes(t), t)).join('')}
      <h3 style="margin-top:12px">Plans to consider</h3>${Object.entries(SCENARIOS).map(([k, v]) => chk('scenarios', k, p.scenarios.includes(k), v.label)).join('')}
      <h3 style="margin-top:12px">Areas <span class="muted small">(none checked = all of WA and OR)</span></h3>
      <div class="two">${['WA', 'OR'].map((st) => `<div><b>${st === 'WA' ? 'Washington' : 'Oregon'}</b><br>${byState(st).map((m) => chk('locations', m.id, p.locations.includes(m.id), m.name)).join('<br>')}</div>`).join('')}</div>
    </section>

    <section class="panel"><h2>Land and tiny homes</h2>
      <div class="settings-grid">
        ${num('tinyHomesOnLand', 'Tiny homes on raw land', p.tinyHomesOnLand, 1)}${num('tinyHomesOnLot', 'Tiny homes added to a house lot', p.tinyHomesOnLot, 1)}
        ${num('buildSqft', 'New build size (sqft)', p.buildSqft, 50)}${num('buildBeds', 'New build bedrooms', p.buildBeds, 1)}
      </div>
      <p>${chk('landHasWater', '1', p.landHasWater, 'Assume land has water')}${chk('landHasSewer', '1', p.landHasSewer, 'Assume land has sewer')}${chk('landHasPower', '1', p.landHasPower, 'Assume land has power')}</p>
    </section>

    <section class="panel"><h2>Startup cost estimates</h2>
      <p class="small muted">These drive the per-property estimates. Renovation and building costs are multiplied by each area's cost index. You can still override any line on a property.</p>
      <div class="settings-grid">${costFields.map(([k, l]) => num(`cp.${k}`, l, cp[k])).join('')}
        ${['light', 'moderate', 'major'].map((k) => num(`reno.${k}`, `Renovation, ${k} ($/sqft)`, cp.renoPerSqft[k])).join('')}</div>
    </section>

    <section class="panel"><h2>Operating cost estimates</h2>
      <div class="settings-grid">${opFields.map(([k, l]) => num(`cp.${k}`, l, cp[k])).join('')}</div>
    </section>

    <section class="panel"><details><summary>Area rates (nightly rate, occupancy, property tax)</summary>
      <p class="small muted">Starting estimates for a typical 2-bedroom whole-home STR. If you have AirDNA, PriceLabs or local comps, put the real numbers here.</p>
      <div class="table-wrap"><table><thead><tr><th>Area</th><th>Nightly $ (2BR)</th><th>Occupancy %</th><th>Tax rate %</th><th>Cost index</th></tr></thead><tbody>
      ${allMarkets().map((m0) => { const m = { ...m0, ...(p.marketOverrides[m0.id] || {}) }; return `<tr><td>${esc(m.name)}, ${m.state}</td>
        <td><input type="number" data-mkt="${m.id}" data-k="adr" value="${m.adr}" style="width:80px"></td>
        <td><input type="number" data-mkt="${m.id}" data-k="occupancy" value="${Math.round(m.occupancy * 100)}" style="width:70px"></td>
        <td><input type="number" step="0.01" data-mkt="${m.id}" data-k="taxRate" value="${(m.taxRate * 100).toFixed(2)}" style="width:80px"></td>
        <td><input type="number" step="0.05" data-mkt="${m.id}" data-k="costIndex" value="${m.costIndex}" style="width:70px"></td></tr>`; }).join('')}
      </tbody></table></div></details></section>

    <p style="display:flex;gap:8px"><button class="btn primary" data-act="save-settings">Save settings</button><button class="btn" data-act="reset-settings">Reset to defaults</button></p>
  </form>`;
}

async function saveSettings() {
  const form = $('#settings');
  const fd = new FormData(form);
  const p = mergePrefs(JSON.parse(JSON.stringify(state.prefs)));
  const n = (k) => Number(fd.get(k));
  p.goal = fd.get('goal');
  p.goalYears = n('goalYears') || 10;
  p.includeEquity = fd.has('includeEquity');
  p.ownerNights = n('ownerNights') || 0;
  p.useVacasa = fd.get('useVacasa') === '1';
  p.financeId = fd.get('financeId');
  p.downPct = n('downPct');
  p.maxPrice = n('maxPrice');
  p.minBeds = n('minBeds');
  p.propertyTypes = fd.getAll('propertyTypes');
  p.scenarios = fd.getAll('scenarios');
  p.locations = fd.getAll('locations');
  for (const k of ['tinyHomesOnLand', 'tinyHomesOnLot', 'buildSqft', 'buildBeds']) p[k] = n(k);
  for (const k of ['landHasWater', 'landHasSewer', 'landHasPower']) p[k] = fd.has(k);
  for (const [k, v] of fd.entries()) {
    if (k.startsWith('cp.')) p.costParams[k.slice(3)] = Number(v);
    if (k.startsWith('reno.')) p.costParams.renoPerSqft[k.slice(5)] = Number(v);
  }
  form.querySelectorAll('[data-fin]').forEach((inp) => { const f = p.financeOptions.find((x) => x.id === inp.dataset.fin); f[inp.dataset.k] = Number(inp.value); });
  const overrides = {};
  form.querySelectorAll('[data-mkt]').forEach((inp) => {
    const base = allMarkets().find((m) => m.id === inp.dataset.mkt);
    const k = inp.dataset.k;
    let val = Number(inp.value);
    if (k === 'occupancy' || k === 'taxRate') val /= 100;
    if (Math.abs(val - base[k]) > 1e-9) (overrides[base.id] = overrides[base.id] || {})[k] = val;
  });
  p.marketOverrides = overrides;
  state.prefs = p;
  try { await store.savePrefs(p); toast('Settings saved'); } catch (e) { toast(`Couldn't save: ${e.message}`); }
}

boot();
