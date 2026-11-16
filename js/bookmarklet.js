// "Rate on RentalRater" bookmarklet. You click it while viewing a listing on
// Zillow, Redfin, Realtor.com or most other listing sites. It reads the page
// you're looking at (structured data first, then the visible text) and opens
// RentalRater's Evaluate tab with the details filled in. Nothing runs unless
// you click it, and it only reads the one page in front of you.

function grab(APP) {
  var t = document.body.innerText, q = {};
  var g = function (r) { var x = t.match(r); return x ? x[1].replace(/,/g, '') : ''; };
  var objs = [];
  var walk = function (o) { if (!o || typeof o !== 'object') return; objs.push(o); for (var k in o) walk(o[k]); };
  document.querySelectorAll('script[type="application/ld+json"]').forEach(function (s) { try { walk(JSON.parse(s.textContent)); } catch (e) {} });
  objs.forEach(function (o) {
    var a = o.address;
    if (a && a.streetAddress && !q.address) { q.address = [a.streetAddress, a.addressLocality, (a.addressRegion || '') + ' ' + (a.postalCode || '')].join(', ').trim(); q.city = a.addressLocality || ''; q.state = a.addressRegion || ''; }
    if (o.geo && o.geo.latitude && !q.lat) { q.lat = o.geo.latitude; q.lon = o.geo.longitude; }
    if (o.latitude && o.longitude && !q.lat) { q.lat = o.latitude; q.lon = o.longitude; }
    var off = o.offers && (o.offers.price ? o.offers : o.offers[0]);
    if (off && off.price && !q.price) q.price = String(off.price).replace(/[^\d.]/g, '');
    if (o.numberOfRooms && !q.beds) q.beds = o.numberOfRooms;
    if (o.floorSize && o.floorSize.value && !q.sqft) q.sqft = String(o.floorSize.value).replace(/,/g, '');
    if (o.yearBuilt && !q.year) q.year = o.yearBuilt;
  });
  if (!q.address) {
    var h = document.querySelector('h1');
    q.address = ((h && h.innerText) || document.title.split('|')[0]).replace(/\s+/g, ' ').trim();
    var m = q.address.match(/,\s*([^,]+),\s*(WA|OR)\b/i); if (m) { q.city = m[1].trim(); q.state = m[2].toUpperCase(); }
  }
  q.price = q.price || g(/\$\s?([\d,]{5,})/);
  q.beds = q.beds || g(/(\d+)\s*(?:bd|beds?|bedrooms?)\b/i);
  q.baths = g(/(\d+(?:\.\d+)?)\s*(?:ba|baths?|bathrooms?)\b/i);
  q.sqft = q.sqft || g(/([\d,]{3,})\s*(?:sq\.?\s?ft|sqft|square feet)/i);
  q.year = q.year || g(/(?:built in|year built:?)\s*(\d{4})/i);
  var acres = g(/([\d.,]+)\s*acres?\b/i), lotSqft = g(/lot[^\n]{0,25}?([\d,]{4,})\s*(?:sq\.?\s?ft|sqft)/i);
  q.acres = acres || (lotSqft ? (Number(lotSqft) / 43560).toFixed(2) : '');
  q.hoa = g(/HOA[^$\n]{0,25}\$\s?([\d,]+)/i);
  var ty = t.match(/\b(Single Family|Condo|Townhouse|Townhome|Manufactured|Mobile|Vacant Land|Land|Lot)\b/i);
  if (ty) { var v = ty[1].toLowerCase(); q.type = /condo/.test(v) ? 'Condo' : /town/.test(v) ? 'Townhouse' : /manuf|mobile/.test(v) ? 'Manufactured' : /land|lot/.test(v) ? 'Land' : 'Single Family'; }
  if (/\b(waterfront|beachfront|oceanfront|bayfront|riverfront|lakefront|beach access|private beach)\b/i.test(t)) q.waterfront = '1';
  q.src = location.href;
  for (var k in q) if (q[k] === '' || q[k] == null) delete q[k];
  window.open(APP + '#evaluate?' + new URLSearchParams(q).toString(), '_blank');
}

/** The javascript: URL for a bookmark that opens the app at `appUrl`. */
export function bookmarkletHref(appUrl) {
  return 'javascript:' + encodeURIComponent('(' + grab.toString() + ')(' + JSON.stringify(appUrl) + ')');
}
