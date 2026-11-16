#!/usr/bin/env node
// Daily listing refresh from the RentCast API (free plan: 50 calls/month, up to
// 500 listings per call). Runs two kinds of jobs from config/searches.json:
//   - new-listing sweeps: big circles limited to listings from the last few
//     days, so one call catches everything new across a wide area;
//   - region refreshes: every listing in one region, used to seed the data and
//     to catch price changes and listings that went off the market.
// Calls are paced so the month's budget is spread evenly across the month.
//
// Usage: RENTCAST_API_KEY=... node scripts/fetch-listings.mjs
// Without a key it exits cleanly and leaves the data alone.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { nearestWater, regionFor } from '../js/geo.js';
import { junkReason } from '../js/calc.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LISTINGS = path.join(root, 'data/listings.json');
const STATE = path.join(root, 'data/fetch-state.json');
const CONFIG = path.join(root, 'config/searches.json');
const API = 'https://api.rentcast.io/v1/listings/sale';
const PAGE = 500;
const PRUNE_DAYS = 60;
const DAY = 864e5;

const readJson = async (f, fallback) => { try { return JSON.parse(await readFile(f, 'utf8')); } catch { return fallback; } };

export function normalize(raw) {
  return {
    id: raw.id,
    formattedAddress: raw.formattedAddress,
    addressLine1: raw.addressLine1,
    city: raw.city, state: raw.state, zipCode: raw.zipCode, county: raw.county,
    latitude: raw.latitude, longitude: raw.longitude,
    propertyType: raw.propertyType,
    bedrooms: raw.bedrooms, bathrooms: raw.bathrooms, squareFootage: raw.squareFootage,
    lotSize: raw.lotSize, yearBuilt: raw.yearBuilt,
    hoaFee: raw.hoa?.fee,
    price: raw.price,
    listedDate: raw.listedDate, daysOnMarket: raw.daysOnMarket,
  };
}

/** Add region and distance to water; return null if the listing is outside coverage. */
export function annotate(l, config) {
  const f = config.filters || {};
  const region = regionFor(l.latitude, l.longitude, config.regions || []);
  if (!region) return null;
  const water = nearestWater(l.latitude, l.longitude);
  if (region.coastal && (!water || water.miles > (f.maxWaterMiles ?? 10))) return null;
  const types = (f.propertyType || '').split('|').filter(Boolean);
  if (types.length && l.propertyType && !types.includes(l.propertyType)) return null;
  const maxPrice = Number(String(f.price || '').split(':')[1]) || Infinity;
  if (l.price > maxPrice) return null;
  if (junkReason(l)) return null;
  if (f.maxDaysOld && l.listedDate && Date.now() - Date.parse(l.listedDate) > f.maxDaysOld * DAY) return null;
  return { ...l, region: region.id, waterMiles: water?.miles, waterName: water?.name };
}

/**
 * Merge fresh listings into the existing set. When `complete` is true for a
 * region refresh, listings in that region that weren't returned are marked Inactive.
 */
export function merge(existing, fresh, nowIso, { regionId = null, complete = false } = {}) {
  const byId = new Map(existing.filter((l) => !l.sample).map((l) => [l.id, l]));
  const seen = new Set();
  let added = 0, changed = 0, removed = 0;
  for (const f of fresh) {
    if (!f.id || !f.price) continue;
    seen.add(f.id);
    const l = { ...f, status: 'Active', lastSeen: nowIso };
    const old = byId.get(l.id);
    if (!old) { byId.set(l.id, { ...l, firstSeen: nowIso, priceHistory: [{ date: nowIso, price: l.price }] }); added++; continue; }
    const history = old.priceHistory || [];
    if (old.price !== l.price) { history.push({ date: nowIso, price: l.price }); changed++; }
    const next = { ...old, ...l, firstSeen: old.firstSeen, priceHistory: history.slice(-20) };
    delete next.removedAt;
    byId.set(l.id, next);
  }
  if (regionId && complete) {
    for (const l of byId.values()) {
      if (l.region === regionId && !seen.has(l.id) && l.status === 'Active') { l.status = 'Inactive'; l.removedAt = nowIso; removed++; }
    }
  }
  const cutoff = Date.parse(nowIso) - PRUNE_DAYS * DAY;
  const listings = [...byId.values()].filter((l) => !(l.status === 'Inactive' && Date.parse(l.removedAt) < cutoff));
  return { listings, added, changed, removed };
}

/**
 * Calls this run may spend: whatever is left this month after keeping enough
 * for the new-listing sweeps on the remaining days.
 */
export function callsAvailable(config, st, now) {
  const budget = config.monthlyCallBudget ?? 48;
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const daysLeft = daysInMonth - now.getUTCDate();
  const perDay = (config.newListingSweeps || []).reduce((s, x) => s + 1 / (x.everyDays || 3), 0);
  const reserve = Math.ceil(daysLeft * perDay);
  const left = budget - (st.calls || 0);
  // Always allow today's share of sweeps, even if the reserve is tight.
  return Math.max(0, Math.min(left, Math.max(left - reserve, Math.ceil(perDay))));
}

/** Order the jobs that are due: never-fetched regions, then new-listing sweeps, then stale regions. */
export function planJobs(config, st, now) {
  const last = st.lastRun || {};
  const age = (id) => (last[id] ? (now - Date.parse(last[id])) / DAY : Infinity);
  const regions = (config.regions || []).map((r) => ({ ...r, kind: 'region' }));
  const sweeps = (config.newListingSweeps || []).map((s) => ({ ...s, kind: 'sweep' }));
  const unseeded = regions.filter((r) => age(r.id) === Infinity);
  const dueSweeps = sweeps.filter((s) => age(s.id) >= (s.everyDays ?? 3) - 0.25);
  const stale = regions.filter((r) => age(r.id) !== Infinity && age(r.id) >= (config.regionRefreshEveryDays ?? 14))
    .sort((a, b) => age(b.id) - age(a.id));
  // While regions are still being seeded, the sweeps would only re-find the same listings.
  return unseeded.length ? [...unseeded, ...stale] : [...dueSweeps, ...stale];
}

function query(job, config, offset) {
  const f = config.filters || {};
  const q = new URLSearchParams({ status: 'Active', limit: String(PAGE), offset: String(offset), latitude: String(job.latitude), longitude: String(job.longitude), radius: String(job.radius) });
  if (f.propertyType) q.set('propertyType', f.propertyType);
  if (f.price) q.set('price', f.price);
  const maxAge = job.daysOld || f.maxDaysOld;
  if (maxAge) q.set('daysOld', `*:${maxAge}`);
  return `${API}?${q}`;
}

async function runJob(job, config, apiKey, budget) {
  const out = [];
  let calls = 0, complete = false;
  for (let offset = 0; calls < budget; offset += PAGE) {
    const res = await fetch(query(job, config, offset), { headers: { 'X-Api-Key': apiKey, Accept: 'application/json' } });
    calls++;
    if (!res.ok) { const e = new Error(`RentCast ${res.status} on ${job.id}: ${(await res.text()).slice(0, 300)}`); e.status = res.status; e.calls = calls; throw e; }
    const page = await res.json();
    out.push(...page);
    if (page.length < PAGE) { complete = true; break; }
  }
  return { results: out, calls, complete };
}

async function main() {
  const apiKey = process.env.RENTCAST_API_KEY;
  if (!apiKey) { console.log('RENTCAST_API_KEY not set; skipping listing refresh.'); return; }
  const config = await readJson(CONFIG, {});
  const now = new Date();
  const nowIso = now.toISOString();
  const st = await readJson(STATE, {});
  const month = nowIso.slice(0, 7);
  if (st.month !== month) { st.month = month; st.calls = 0; }
  st.lastRun = st.lastRun || {};

  const data = await readJson(LISTINGS, { listings: [] });
  // Re-check existing listings against the current coverage rules.
  let listings = (data.listings || []).filter((l) => !l.sample).map((l) => annotate(l, config)).filter(Boolean);
  let available = callsAvailable(config, st, now);
  const jobs = planJobs(config, st, now);
  const log = [];
  let seeded = false;
  for (const job of jobs) {
    if (available <= 0) break;
    let r;
    try { r = await runJob(job, config, apiKey, available); }
    catch (e) {
      console.error(e.message);
      process.exitCode = 1;
      st.calls += e.calls || 1; available -= e.calls || 1;
      if ([401, 403, 429].includes(e.status)) break; // bad key or out of quota: stop for today
      continue;
    }
    st.calls += r.calls; available -= r.calls;
    const fresh = r.results.map(normalize).map((l) => annotate(l, config)).filter(Boolean);
    const m = merge(listings, fresh, nowIso, job.kind === 'region' ? { regionId: job.id, complete: r.complete } : {});
    listings = m.listings;
    if (r.complete || job.kind === 'sweep') st.lastRun[job.id] = nowIso;
    if (job.kind === 'region') seeded = true;
    log.push(`${job.name}: ${r.results.length} returned, ${fresh.length} in coverage, ${m.added} new, ${m.changed} price changes, ${m.removed} removed (${r.calls} call${r.calls > 1 ? 's' : ''}${r.complete ? '' : ', incomplete'})`);
  }
  // A full seed also covers the new-listing sweeps.
  if (seeded && (config.regions || []).every((rg) => st.lastRun[rg.id])) for (const s of config.newListingSweeps || []) st.lastRun[s.id] = st.lastRun[s.id] || nowIso;

  const coverage = {
    budget: config.monthlyCallBudget ?? 48, callsThisMonth: st.calls,
    regions: (config.regions || []).map((rg) => ({ id: rg.id, name: rg.name, coastal: rg.coastal, why: rg.why, lastRefreshed: st.lastRun[rg.id] || null })),
    sweeps: (config.newListingSweeps || []).map((s) => ({ id: s.id, name: s.name, lastRun: st.lastRun[s.id] || null })),
  };
  await writeFile(LISTINGS, JSON.stringify({ updatedAt: log.length ? nowIso : data.updatedAt || null, source: 'RentCast', coverage, listings }) + '\n');
  await writeFile(STATE, JSON.stringify(st, null, 2) + '\n');
  console.log(log.join('\n') || 'Nothing due or no budget left today.');
  console.log(`Calls this month: ${st.calls}/${coverage.budget}. Listings in coverage: ${listings.filter((l) => l.status === 'Active').length} active.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
