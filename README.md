# RentalRater

A static web app (GitHub Pages + Firebase) that rates Washington and Oregon
property listings as short-term rental investments and gives each one a
**Buy / Close / Don't buy** verdict, like:

> Buying this property for $400,000 with $100,000 down on a DSCR loan at 7.5%,
> plus about $97,700 in startup costs, covers the mortgage and expenses with
> about $816/mo left over and earns back your $197,700 in 12.5 years.

## What it does

- **Listings**: pulls active for-sale listings once a day (RentCast free plan),
  filters them by your areas, property types, price and bedrooms, and rates each.
- **Plans per property**: rent as-is, refurbish, add tiny homes, or build a cabin
  on land. It picks the best plan for each listing; you can switch.
- **Financing**: DSCR, conventional (investment / second home, 15 or 30 yr), land,
  construction-to-permanent, HELOC, seller financing, or cash. Rates and terms are
  editable in Settings.
- **Startup costs**: closing, repairs/renovation (by condition), furnishing,
  tiny homes, new build, site prep, well, septic, power, permits, STR license,
  setup, loan points and an operating reserve. Each is estimated from the
  property (size, bedrooms, year built/condition, lot) and the area's cost
  index, and every line can be overridden per property.
- **Management**: self-managed (3% platform fee) or Vacasa at 35% of revenue.
- **Goals**: "earn back my cash within N years" (optionally counting equity),
  or "just break even on the mortgage indefinitely" (own it and use it free).
  Personal-use nights are subtracted from bookable nights.
- **Area data**: nightly rate, occupancy, property tax rate and construction cost
  index for ~23 WA/OR STR markets, plus STR-rule and tiny-home flags. These are
  starting estimates. Override them in Settings with real comps.
- **Max price**: the highest offer price that still gets a Buy.

## Setup

### 1. GitHub Pages
Settings → Pages → Source: **GitHub Actions**. The `Refresh listings and deploy`
workflow publishes the site on every push to `main` and once a day.

### 2. Firebase (sign-in + saved data)
The config is in `js/firebase-config.js` (web keys are safe to commit).
In the Firebase console:
1. Build → Firestore Database → Create database (production mode).
2. Firestore → Rules: paste `firestore.rules` and publish.
3. Authentication → Sign-in method: enable **Google**.
4. Authentication → Settings → Authorized domains: add `mendus59.github.io`.

Data layout: `users/{uid}` holds your settings and a `tier` field (for paid tiers
later); `users/{uid}/properties/{id}` holds saved and hand-entered properties.
If `apiKey` is blank or Firebase can't load, the app runs in local mode and saves
to the browser.

### 3. Daily listings (RentCast)
1. Sign up for the free RentCast API plan at <https://app.rentcast.io/app/api>
   (50 requests/month) and create an API key.
2. Repo Settings → Secrets and variables → Actions → New secret
   `RENTCAST_API_KEY`.
3. Edit `config/searches.json` to choose areas. Each daily run spends one call
   on the next area in the list, so with 7 areas each is refreshed about weekly.
   Fewer areas means fresher data. Run the workflow manually from the Actions
   tab to fetch immediately.

Until a key is set, the app shows clearly-labelled sample listings. You can
always rate any property by hand on the **Evaluate** tab.

## Data sources and limits
- Zillow, Redfin and Realtor.com forbid scraping, so RentalRater doesn't.
  RentCast licenses MLS-sourced listing data and has a free tier.
- No free source publishes STR nightly rates or occupancy (AirDNA, PriceLabs and
  Mashvisor are paid), so area numbers are built-in estimates you can override.
- Zoning / STR / tiny-home flags are general heads-ups, not legal advice.

## Development
No build step. Serve the folder (`python3 -m http.server`) and open it.
Tests: `node --test tests/*.test.mjs`.

- `js/calc.js` evaluation engine (pure functions)
- `js/defaults.js` financing options, cost parameters, default settings
- `js/markets.js` WA/OR area data
- `js/store.js` Firebase / local storage
- `js/app.js` UI
- `scripts/fetch-listings.mjs` daily RentCast fetch
