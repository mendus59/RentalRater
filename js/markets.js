// Area data for Washington and Oregon short-term rental markets.
//
// Every number here is a starting ESTIMATE, not live data. ADR (average daily
// rate) is for a typical 2-bedroom whole-home listing; occupancy is the share of
// available nights booked across a year. Tax rate is the effective property tax
// rate. costIndex scales construction/renovation costs relative to a national
// baseline of 1.0. All of these can be overridden per market in Settings.
//
// strFlags / tinyHomeFlags are a quick heads-up only. Rules change often and
// vary by zone and parcel, so always confirm with the city or county before
// buying. They never block an evaluation.

export const MARKETS = [
  // ---------------- Washington ----------------
  {
    id: 'wa-seattle', name: 'Seattle', state: 'WA', county: 'King',
    cities: ['seattle'],
    adr: 185, occupancy: 0.68, taxRate: 0.0085, costIndex: 1.3, insuranceMult: 1.0, permitCost: 300, permitAnnual: 300,
    strFlags: ['City STR operator license required; operators are limited to their primary residence plus one additional unit.'],
    tinyHomeFlags: ['Seattle allows backyard cottages (DADUs) on most single-family lots; STR use still counts toward the 2-unit limit.'],
  },
  {
    id: 'wa-eastside', name: 'Bellevue / Eastside', state: 'WA', county: 'King',
    cities: ['bellevue', 'redmond', 'kirkland', 'issaquah', 'sammamish', 'bothell', 'renton', 'north bend', 'snoqualmie'],
    adr: 210, occupancy: 0.6, taxRate: 0.0085, costIndex: 1.3, insuranceMult: 1.0, permitCost: 300, permitAnnual: 200,
    strFlags: ['City rules vary; several Eastside cities require a business license and owner registration for STRs.'],
    tinyHomeFlags: ['WA HB 1337 (2023) requires cities to allow up to two ADUs per lot, but STR use of ADUs may be restricted.'],
  },
  {
    id: 'wa-tacoma', name: 'Tacoma / Pierce', state: 'WA', county: 'Pierce',
    cities: ['tacoma', 'puyallup', 'lakewood', 'university place', 'fife'],
    adr: 150, occupancy: 0.62, taxRate: 0.0095, costIndex: 1.15, insuranceMult: 1.0, permitCost: 250, permitAnnual: 150,
    strFlags: ['Tacoma requires a STR registration and business license.'],
    tinyHomeFlags: ['ADUs broadly allowed under WA HB 1337; check STR use for ADUs.'],
  },
  {
    id: 'wa-rainier', name: 'Mount Rainier (Ashford / Packwood / Greenwater)', state: 'WA', county: 'Lewis',
    cities: ['ashford', 'packwood', 'greenwater', 'elbe', 'eatonville', 'randle', 'mineral', 'morton'],
    adr: 225, occupancy: 0.5, taxRate: 0.0085, costIndex: 1.05, insuranceMult: 1.1, permitCost: 500, permitAnnual: 200,
    strFlags: ['Unincorporated Lewis/Pierce County: STRs generally allowed with permits; confirm septic capacity for occupancy.'],
    tinyHomeFlags: ['Rural parcels often allow cabins/tiny homes on foundations; tiny homes on wheels are usually treated as RVs.'],
  },
  {
    id: 'wa-leavenworth', name: 'Leavenworth', state: 'WA', county: 'Chelan',
    cities: ['leavenworth', 'peshastin', 'plain', 'cashmere'],
    adr: 265, occupancy: 0.55, taxRate: 0.0085, costIndex: 1.1, insuranceMult: 1.15, permitCost: 1000, permitAnnual: 500,
    strFlags: ['Chelan County caps and restricts STR permits in many zones; the City of Leavenworth limits STRs in residential zones. High risk: verify a permit is transferable or obtainable before buying.'],
    tinyHomeFlags: ['Additional rental units may not qualify for new STR permits under Chelan County rules.'],
  },
  {
    id: 'wa-chelan', name: 'Lake Chelan', state: 'WA', county: 'Chelan',
    cities: ['chelan', 'manson', 'entiat', 'chelan falls'],
    adr: 285, occupancy: 0.48, taxRate: 0.0085, costIndex: 1.1, insuranceMult: 1.1, permitCost: 1000, permitAnnual: 500,
    strFlags: ['Chelan County STR permit caps apply; the City of Chelan has its own STR licensing. Strong summer seasonality.'],
    tinyHomeFlags: [],
  },
  {
    id: 'wa-methow', name: 'Methow Valley (Winthrop / Mazama)', state: 'WA', county: 'Okanogan',
    cities: ['winthrop', 'twisp', 'mazama', 'carlton', 'pateros'],
    adr: 240, occupancy: 0.47, taxRate: 0.0090, costIndex: 1.1, insuranceMult: 1.25, permitCost: 300, permitAnnual: 100,
    strFlags: ['Okanogan County STRs generally allowed; wildfire risk can raise insurance a lot.'],
    tinyHomeFlags: ['Large rural lots often fit cabins or tiny homes; check septic and well rules.'],
  },
  {
    id: 'wa-coast', name: 'WA Coast (Ocean Shores / Long Beach)', state: 'WA', county: 'Grays Harbor',
    cities: ['ocean shores', 'westport', 'moclips', 'pacific beach', 'copalis beach', 'long beach', 'seaview', 'ocean park', 'ilwaco', 'grayland', 'tokeland', 'nahcotta', 'chinook', 'naselle', 'raymond', 'south bend', 'bay center', 'aberdeen', 'hoquiam', 'cosmopolis', 'taholah'],
    adr: 195, occupancy: 0.48, taxRate: 0.0105, costIndex: 1.0, insuranceMult: 1.2, permitCost: 300, permitAnnual: 150,
    strFlags: ['Ocean Shores and Long Beach require STR/business licenses; some HOAs prohibit STRs.'],
    tinyHomeFlags: [],
  },
  {
    id: 'wa-olympic', name: 'Olympic Peninsula (Port Angeles / Sequim / Forks)', state: 'WA', county: 'Clallam',
    cities: ['port angeles', 'sequim', 'forks', 'port townsend', 'joyce', 'port hadlock', 'nordland', 'chimacum', 'port ludlow', 'neah bay', 'sekiu', 'clallam bay'],
    adr: 180, occupancy: 0.55, taxRate: 0.0085, costIndex: 1.05, insuranceMult: 1.0, permitCost: 400, permitAnnual: 150,
    strFlags: ['Port Angeles and Port Townsend restrict STRs in residential zones; county areas more permissive.'],
    tinyHomeFlags: [],
  },
  {
    id: 'wa-sanjuan', name: 'San Juan Islands', state: 'WA', county: 'San Juan',
    cities: ['friday harbor', 'eastsound', 'orcas', 'lopez island', 'lopez', 'deer harbor', 'olga'],
    adr: 310, occupancy: 0.55, taxRate: 0.0070, costIndex: 1.4, insuranceMult: 1.1, permitCost: 1500, permitAnnual: 500,
    strFlags: ['San Juan County caps vacation rental permits; new permits can be very limited. High risk: confirm before buying.'],
    tinyHomeFlags: [],
  },
  {
    id: 'wa-boatonly', name: 'San Juan boat-access islands', state: 'WA', county: 'San Juan',
    cities: ['decatur island', 'stuart island', 'center island', 'blakely island', 'waldron', 'waldron island', 'sinclair island', 'cypress island', 'spieden island', 'johns island', 'henry island', 'obstruction island', 'crane island'],
    adr: 230, occupancy: 0.38, taxRate: 0.0070, costIndex: 1.9, insuranceMult: 1.2, permitCost: 1500, permitAnnual: 500,
    strFlags: ['No ferry service: guests need a boat or floatplane, which cuts demand. Building costs run far above the mainland because materials and crews come by barge.', 'San Juan County caps vacation rental permits. High risk: confirm before buying.'],
    tinyHomeFlags: ['Delivering a tiny home requires a barge.'],
  },
  {
    id: 'wa-bellingham', name: 'Bellingham / Whatcom', state: 'WA', county: 'Whatcom',
    cities: ['bellingham', 'ferndale', 'lynden', 'blaine', 'birch bay', 'glacier', 'maple falls', 'deming', 'point roberts', 'lummi island'],
    adr: 165, occupancy: 0.6, taxRate: 0.0085, costIndex: 1.1, insuranceMult: 1.0, permitCost: 300, permitAnnual: 150,
    strFlags: ['Bellingham requires STRs be registered and limits non-owner-occupied STRs in some zones.'],
    tinyHomeFlags: ['Glacier / Mt Baker area lots often support cabins.'],
  },
  {
    id: 'wa-spokane', name: 'Spokane', state: 'WA', county: 'Spokane',
    cities: ['spokane', 'spokane valley', 'liberty lake', 'cheney', 'airway heights', 'nine mile falls'],
    adr: 145, occupancy: 0.58, taxRate: 0.0100, costIndex: 0.95, insuranceMult: 0.95, permitCost: 200, permitAnnual: 100,
    strFlags: ['Spokane requires a STR permit; generally permissive.'],
    tinyHomeFlags: [],
  },
  {
    id: 'wa-tricities', name: 'Tri-Cities', state: 'WA', county: 'Benton',
    cities: ['kennewick', 'richland', 'pasco', 'west richland'],
    adr: 135, occupancy: 0.55, taxRate: 0.0095, costIndex: 0.95, insuranceMult: 0.95, permitCost: 200, permitAnnual: 100,
    strFlags: [], tinyHomeFlags: [],
  },
  {
    id: 'wa-vancouver', name: 'Vancouver WA / Clark', state: 'WA', county: 'Clark',
    cities: ['vancouver', 'camas', 'washougal', 'battle ground', 'ridgefield', 'la center'],
    adr: 150, occupancy: 0.58, taxRate: 0.0090, costIndex: 1.1, insuranceMult: 1.0, permitCost: 250, permitAnnual: 150,
    strFlags: ['Vancouver allows STRs with a business license; some HOA restrictions.'],
    tinyHomeFlags: [],
  },
  {
    id: 'wa-kitsap', name: 'Kitsap / Bainbridge / Gig Harbor', state: 'WA', county: 'Kitsap',
    cities: ['bainbridge island', 'poulsbo', 'port orchard', 'bremerton', 'kingston', 'silverdale', 'hansville', 'suquamish', 'indianola', 'keyport', 'manchester', 'olalla', 'gig harbor', 'lakebay', 'vaughn', 'home', 'fox island', 'vashon'],
    adr: 180, occupancy: 0.55, taxRate: 0.0095, costIndex: 1.15, insuranceMult: 1.0, permitCost: 300, permitAnnual: 150,
    strFlags: ['Kitsap County and Bainbridge Island require STR registration; Bainbridge limits STRs in some residential zones.'],
    tinyHomeFlags: ['ADUs broadly allowed under WA HB 1337; check whether the county allows STR use of an ADU.'],
  },
  {
    id: 'wa-southsound', name: 'Olympia / Shelton / South Sound', state: 'WA', county: 'Thurston',
    cities: ['olympia', 'lacey', 'tumwater', 'shelton', 'allyn', 'grapeview', 'steilacoom', 'anderson island', 'longbranch', 'harstine island'],
    adr: 150, occupancy: 0.52, taxRate: 0.0100, costIndex: 1.1, insuranceMult: 1.0, permitCost: 250, permitAnnual: 150,
    strFlags: ['Olympia requires a STR license; Thurston and Mason counties are generally permissive.'],
    tinyHomeFlags: [],
  },
  {
    id: 'wa-hoodcanal', name: 'Hood Canal', state: 'WA', county: 'Mason',
    cities: ['hoodsport', 'union', 'belfair', 'brinnon', 'quilcene', 'lilliwaup', 'tahuya', 'seabeck', 'potlatch', 'eldon', 'dabob'],
    adr: 210, occupancy: 0.5, taxRate: 0.0090, costIndex: 1.05, insuranceMult: 1.05, permitCost: 300, permitAnnual: 150,
    strFlags: ['Mason and Jefferson counties allow STRs with registration; check septic capacity on waterfront lots.'],
    tinyHomeFlags: ['Rural lots often fit a cabin or tiny home; shoreline setbacks apply near the water.'],
  },
  {
    id: 'wa-whidbey', name: 'Whidbey / Camano Islands', state: 'WA', county: 'Island',
    cities: ['oak harbor', 'coupeville', 'langley', 'clinton', 'freeland', 'greenbank', 'camano island', 'camano', 'stanwood'],
    adr: 195, occupancy: 0.55, taxRate: 0.0085, costIndex: 1.15, insuranceMult: 1.0, permitCost: 300, permitAnnual: 150,
    strFlags: ['Island County and Langley require STR registration or business licenses.'],
    tinyHomeFlags: [],
  },
  {
    id: 'wa-skagit', name: 'Anacortes / La Conner / Skagit', state: 'WA', county: 'Skagit',
    cities: ['anacortes', 'la conner', 'mount vernon', 'burlington', 'bow', 'edison', 'guemes island'],
    adr: 175, occupancy: 0.55, taxRate: 0.0090, costIndex: 1.1, insuranceMult: 1.0, permitCost: 300, permitAnnual: 150,
    strFlags: ['Anacortes requires a STR permit and limits them in some zones.'],
    tinyHomeFlags: [],
  },
  {
    id: 'wa-gorge', name: 'Columbia Gorge, WA side (White Salmon / Stevenson)', state: 'WA', county: 'Skamania',
    cities: ['white salmon', 'bingen', 'stevenson', 'carson', 'north bonneville', 'lyle', 'husum', 'trout lake', 'underwood', 'dallesport'],
    adr: 230, occupancy: 0.52, taxRate: 0.0090, costIndex: 1.1, insuranceMult: 1.1, permitCost: 500, permitAnnual: 200,
    strFlags: ['Skamania and Klickitat counties require STR permits; the National Scenic Area adds land-use review for new buildings.'],
    tinyHomeFlags: ['New structures inside the Columbia River Gorge National Scenic Area need scenic-area review.'],
  },
  {
    id: 'wa-lowercolumbia', name: 'Lower Columbia, WA (Cathlamet / Longview)', state: 'WA', county: 'Cowlitz',
    cities: ['cathlamet', 'skamokawa', 'longview', 'kelso', 'kalama', 'castle rock', 'puget island'],
    adr: 130, occupancy: 0.45, taxRate: 0.0095, costIndex: 1.0, insuranceMult: 1.0, permitCost: 200, permitAnnual: 100,
    strFlags: ['Lower demand market; generally permissive.'],
    tinyHomeFlags: [],
  },
  {
    id: 'wa-wenatchee', name: 'Wenatchee', state: 'WA', county: 'Chelan',
    cities: ['wenatchee', 'east wenatchee', 'malaga', 'rock island', 'orondo'],
    adr: 150, occupancy: 0.52, taxRate: 0.0090, costIndex: 1.05, insuranceMult: 1.05, permitCost: 500, permitAnnual: 250,
    strFlags: ['Wenatchee and Chelan County regulate STRs; county permits are capped in some zones.'],
    tinyHomeFlags: [],
  },
  // ---------------- Oregon ----------------
  {
    id: 'or-portland', name: 'Portland', state: 'OR', county: 'Multnomah',
    cities: ['portland'],
    adr: 145, occupancy: 0.6, taxRate: 0.0110, costIndex: 1.2, insuranceMult: 1.0, permitCost: 400, permitAnnual: 200,
    strFlags: ['Portland only permits STRs in residential zones as accessory to a resident host (host must live onsite most of the year). Whole-home investor STRs are generally not allowed. High risk.'],
    tinyHomeFlags: ['Portland allows ADUs, but STR use still requires the resident-host permit.'],
  },
  {
    id: 'or-bend', name: 'Bend', state: 'OR', county: 'Deschutes',
    cities: ['bend', 'tumalo'],
    adr: 245, occupancy: 0.58, taxRate: 0.0090, costIndex: 1.2, insuranceMult: 1.1, permitCost: 800, permitAnnual: 300,
    strFlags: ['Bend requires a STR permit; non-owner-occupied STRs in residential zones face a spacing requirement (roughly 250 ft from another STR). Check availability for the parcel.'],
    tinyHomeFlags: [],
  },
  {
    id: 'or-centraloregon', name: 'Sunriver / Sisters / Redmond / La Pine', state: 'OR', county: 'Deschutes',
    cities: ['sunriver', 'sisters', 'redmond', 'la pine', 'black butte ranch', 'camp sherman', 'terrebonne', 'prineville', 'madras', 'crooked river ranch'],
    adr: 260, occupancy: 0.55, taxRate: 0.0090, costIndex: 1.15, insuranceMult: 1.15, permitCost: 600, permitAnnual: 250,
    strFlags: ['Deschutes County requires STR registration; Sunriver has its own owners association rules.'],
    tinyHomeFlags: ['Rural Deschutes parcels can sometimes add a rural ADU (OR SB 391); STR use of it may be limited.'],
  },
  {
    id: 'or-northcoast', name: 'North Coast (Cannon Beach / Seaside / Manzanita)', state: 'OR', county: 'Clatsop',
    cities: ['cannon beach', 'seaside', 'gearhart', 'astoria', 'warrenton', 'arch cape', 'manzanita', 'nehalem', 'rockaway beach', 'wheeler', 'tillamook', 'pacific city', 'netarts', 'oceanside'],
    adr: 290, occupancy: 0.55, taxRate: 0.0090, costIndex: 1.15, insuranceMult: 1.2, permitCost: 800, permitAnnual: 400,
    strFlags: ['Cannon Beach, Gearhart and Manzanita cap or tightly limit STR permits, and Clatsop/Tillamook counties regulate them. High risk: confirm the permit transfers or one is available.'],
    tinyHomeFlags: [],
  },
  {
    id: 'or-centralcoast', name: 'Central Coast (Lincoln City / Newport / Depoe Bay)', state: 'OR', county: 'Lincoln',
    cities: ['lincoln city', 'newport', 'depoe bay', 'otter rock', 'gleneden beach', 'waldport', 'yachats', 'seal rock', 'neskowin'],
    adr: 230, occupancy: 0.55, taxRate: 0.0095, costIndex: 1.1, insuranceMult: 1.2, permitCost: 600, permitAnnual: 300,
    strFlags: ['Lincoln County voters phased out new STRs in unincorporated residential zones (2021); city rules apply inside Lincoln City, Newport and Depoe Bay. High risk outside city limits.'],
    tinyHomeFlags: [],
  },
  {
    id: 'or-southcoast', name: 'South Coast (Florence / Coos Bay / Bandon / Brookings)', state: 'OR', county: 'Coos',
    cities: ['florence', 'reedsport', 'coos bay', 'north bend', 'bandon', 'port orford', 'gold beach', 'brookings'],
    adr: 185, occupancy: 0.5, taxRate: 0.0095, costIndex: 1.0, insuranceMult: 1.1, permitCost: 400, permitAnnual: 200,
    strFlags: ['City licensing applies; generally more permissive than the north coast.'],
    tinyHomeFlags: [],
  },
  {
    id: 'or-hood', name: 'Hood River / Mt Hood', state: 'OR', county: 'Hood River',
    cities: ['hood river', 'government camp', 'welches', 'rhododendron', 'brightwood', 'zigzag', 'parkdale', 'odell', 'mosier'],
    adr: 255, occupancy: 0.52, taxRate: 0.0095, costIndex: 1.15, insuranceMult: 1.15, permitCost: 700, permitAnnual: 300,
    strFlags: ['Hood River city/county limit STRs (often owner-occupancy rules); Clackamas County (Mt Hood) requires STR registration.'],
    tinyHomeFlags: [],
  },
  {
    id: 'or-ashland', name: 'Ashland / Medford', state: 'OR', county: 'Jackson',
    cities: ['ashland', 'medford', 'jacksonville', 'talent', 'phoenix', 'central point', 'grants pass', 'shady cove'],
    adr: 180, occupancy: 0.52, taxRate: 0.0095, costIndex: 1.05, insuranceMult: 1.2, permitCost: 500, permitAnnual: 200,
    strFlags: ['Ashland restricts traveler accommodations in residential zones (often owner-occupancy); Medford more permissive. Wildfire insurance risk.'],
    tinyHomeFlags: [],
  },
  {
    id: 'or-willamette', name: 'Willamette Valley (Eugene / Salem / Corvallis)', state: 'OR', county: 'Lane',
    cities: ['eugene', 'springfield', 'salem', 'corvallis', 'albany', 'keizer', 'mcminnville', 'newberg', 'dundee', 'silverton'],
    adr: 140, occupancy: 0.55, taxRate: 0.0105, costIndex: 1.05, insuranceMult: 1.0, permitCost: 300, permitAnnual: 150,
    strFlags: ['Wine-country towns (McMinnville, Newberg) have STR licensing and some caps.'],
    tinyHomeFlags: [],
  },
  {
    id: 'or-lowercolumbia', name: 'Lower Columbia, OR (St Helens / Clatskanie)', state: 'OR', county: 'Columbia',
    cities: ['st helens', 'st. helens', 'scappoose', 'columbia city', 'rainier', 'clatskanie', 'deer island', 'westport'],
    adr: 125, occupancy: 0.45, taxRate: 0.0105, costIndex: 1.05, insuranceMult: 1.0, permitCost: 200, permitAnnual: 100,
    strFlags: ['Lower demand market; check city licensing.'],
    tinyHomeFlags: [],
  },
  {
    id: 'or-thedalles', name: 'The Dalles', state: 'OR', county: 'Wasco',
    cities: ['the dalles', 'dufur', 'rufus', 'biggs'],
    adr: 140, occupancy: 0.48, taxRate: 0.0100, costIndex: 1.0, insuranceMult: 1.0, permitCost: 300, permitAnnual: 150,
    strFlags: ['City licensing applies; lower demand than Hood River.'],
    tinyHomeFlags: [],
  },
];

// Fallbacks when a listing's city doesn't match a known market.
export const STATE_DEFAULTS = {
  WA: { id: 'wa-other', name: 'Washington (other)', state: 'WA', county: '', cities: [], adr: 155, occupancy: 0.52, taxRate: 0.0090, costIndex: 1.05, insuranceMult: 1.0, permitCost: 300, permitAnnual: 150, strFlags: ['Unmapped area: check city/county STR rules.'], tinyHomeFlags: [] },
  OR: { id: 'or-other', name: 'Oregon (other)', state: 'OR', county: '', cities: [], adr: 150, occupancy: 0.5, taxRate: 0.0095, costIndex: 1.05, insuranceMult: 1.0, permitCost: 300, permitAnnual: 150, strFlags: ['Unmapped area: check city/county STR rules.'], tinyHomeFlags: [] },
};

export function allMarkets() {
  return [...MARKETS, STATE_DEFAULTS.WA, STATE_DEFAULTS.OR];
}

/** Find the market for a city/state, then apply any user overrides. */
export function findMarket({ city = '', state = '', county = '', marketId = '' } = {}, overrides = {}) {
  if (marketId) return marketById(marketId, overrides);
  const c = city.trim().toLowerCase();
  const st = state.trim().toUpperCase();
  let m = MARKETS.find((mk) => mk.state === st && mk.cities.includes(c));
  if (!m && county) {
    const co = county.replace(/county/i, '').trim().toLowerCase();
    m = MARKETS.find((mk) => mk.state === st && mk.county.toLowerCase() === co);
  }
  if (!m) m = STATE_DEFAULTS[st] || STATE_DEFAULTS.WA;
  return { ...m, ...(overrides[m.id] || {}) };
}

export function marketById(id, overrides = {}) {
  const m = allMarkets().find((mk) => mk.id === id) || STATE_DEFAULTS.WA;
  return { ...m, ...(overrides[m.id] || {}) };
}
