#!/usr/bin/env node
// Daily listing refresh. Pulls active for-sale listings from the RentCast API
// (free plan: 50 calls/month) for one search area per run, merges them into
// data/listings.json, and tracks new / price-changed / removed listings.
//
// Usage: RENTCAST_API_KEY=... node scripts/fetch-listings.mjs
// Without a key it exits cleanly and leaves the data alone.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LISTINGS = path.join(root, 'data/listings.json');
const STATE = path.join(root, 'data/fetch-state.json');
const CONFIG = path.join(root, 'config/searches.json');
const API = 'https://api.rentcast.io/v1/listings/sale';
const PAGE = 500;
const PRUNE_DAYS = 60;

const readJson = async (f, fallback) => { try { return JSON.parse(await readFile(f, 'utf8')); } catch { return fallback; } };

export function searchKey(s) {
  return s.name || [s.city, s.state, s.latitude, s.longitude, s.radius, s.propertyType].filter(Boolean).join('|');
}

export function normalize(raw, key, nowIso) {
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
    status: 'Active', searchKey: key, lastSeen: nowIso,
  };
}

/** Merge one search's fresh results into the existing listing set. */
export function merge(existing, fresh, key, nowIso) {
  const byId = new Map(existing.filter((l) => !l.sample).map((l) => [l.id, l]));
  const seen = new Set();
  let added = 0, changed = 0, removed = 0;
  for (const f of fresh) {
    if (!f.id || !f.price) continue;
    const l = { ...f, status: 'Active', searchKey: key, lastSeen: nowIso };
    delete l.removedAt;
    seen.add(l.id);
    const old = byId.get(l.id);
    if (!old) { byId.set(l.id, { ...l, firstSeen: nowIso, priceHistory: [{ date: nowIso, price: l.price }] }); added++; continue; }
    const history = old.priceHistory || [];
    if (old.price !== l.price) { history.push({ date: nowIso, price: l.price }); changed++; }
    const next = { ...old, ...l, firstSeen: old.firstSeen, priceHistory: history.slice(-20) };
    delete next.removedAt;
    byId.set(l.id, next);
  }
  for (const l of byId.values()) {
    if (l.searchKey === key && !seen.has(l.id) && l.status === 'Active') { l.status = 'Inactive'; l.removedAt = nowIso; removed++; }
  }
  const cutoff = Date.parse(nowIso) - PRUNE_DAYS * 864e5;
  const listings = [...byId.values()].filter((l) => !(l.status === 'Inactive' && Date.parse(l.removedAt) < cutoff));
  return { listings, added, changed, removed };
}

async function fetchSearch(s, apiKey, budgetLeft) {
  const out = [];
  let calls = 0;
  for (let offset = 0; calls < budgetLeft; offset += PAGE) {
    const q = new URLSearchParams({ status: 'Active', limit: String(PAGE), offset: String(offset) });
    for (const k of ['city', 'state', 'zipCode', 'latitude', 'longitude', 'radius', 'propertyType']) if (s[k] != null) q.set(k, String(s[k]));
    if (s.maxPrice) q.set('price', `*:${s.maxPrice}`);
    const res = await fetch(`${API}?${q}`, { headers: { 'X-Api-Key': apiKey, Accept: 'application/json' } });
    calls++;
    if (!res.ok) throw new Error(`RentCast ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const page = await res.json();
    out.push(...page);
    if (page.length < PAGE) break;
  }
  return { results: out, calls };
}

async function main() {
  const apiKey = process.env.RENTCAST_API_KEY;
  if (!apiKey) { console.log('RENTCAST_API_KEY not set; skipping listing refresh.'); return; }
  const config = await readJson(CONFIG, { searches: [] });
  if (!config.searches?.length) { console.log('No searches configured.'); return; }
  const now = new Date();
  const nowIso = now.toISOString();
  const month = nowIso.slice(0, 7);
  const st = await readJson(STATE, {});
  if (st.month !== month) { st.month = month; st.calls = 0; }
  st.nextIndex = st.nextIndex || 0;
  const budget = config.monthlyCallBudget ?? 40;
  let runCalls = config.callsPerRun ?? 1;

  const data = await readJson(LISTINGS, { listings: [] });
  let listings = data.listings || [];
  const log = [];
  while (runCalls > 0 && st.calls < budget) {
    const s = config.searches[st.nextIndex % config.searches.length];
    const key = searchKey(s);
    const { results, calls } = await fetchSearch(s, apiKey, Math.min(runCalls, budget - st.calls));
    st.calls += calls; runCalls -= calls;
    const fresh = results.map((r) => normalize(r, key, nowIso));
    const m = merge(listings, fresh, key, nowIso);
    listings = m.listings;
    st.nextIndex = (st.nextIndex + 1) % config.searches.length;
    (st.lastRun = st.lastRun || {})[key] = nowIso;
    log.push(`${key}: ${fresh.length} active, ${m.added} new, ${m.changed} price changes, ${m.removed} removed`);
  }
  if (!log.length) { console.log(`Monthly budget used (${st.calls}/${budget}); skipping.`); }
  await writeFile(LISTINGS, JSON.stringify({ updatedAt: nowIso, source: 'RentCast', searches: st.lastRun, listings }, null, 0) + '\n');
  await writeFile(STATE, JSON.stringify(st, null, 2) + '\n');
  console.log(log.join('\n'));
  console.log(`Calls this month: ${st.calls}/${budget}. Total listings: ${listings.length}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
