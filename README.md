# React Dashboard - Pokemon Card Collection Manager

## Overview
A React-based web application for managing and visualizing a Pokemon Trading Card Game (TCG) collection. The dashboard allows users to browse, filter, sort, and organize cards from their personal collection with pricing information and collection details.

## Features

### 🎴 Card Management
- **Browse Cards**: View all available Pokemon TCG cards with details
- **Filter Cards**: Filter by set, rarity, type, energy, and more
- **Sort Cards**: Organize cards by various properties (name, rarity, price, etc.)
- **Search**: Find cards by name or specific properties
- **Card Variants**: View different versions (standard, reverse holo, etc.)
- **Pricing Data**: Real-time pricing information from TCG Player

### 📊 Collection Tracking
- **Collection Status**: Mark cards as owned, not owned, or shadow (partially owned)
- **Multiple Collections**: Support for multiple collection types with pricing options
- **Collection Filtering**: View only cards you own or don't own
- **Summary View**: Quick overview of collection statistics

### 🛠️ User Interface
- **Sidebar Navigation**: Easy access to filters, orders, and collections
- **Card List View**: Grid display of cards with images and details
- **Card Table View**: Tabular view for detailed analysis
- **Responsive Design**: Works on different screen sizes

## Project Structure

```
src/
├── components/           # React components
│   ├── inputs/          # Filter, search, and input components
│   ├── views/           # Card list and table views
│   └── ui/              # Sidebar and summary components
├── context/             # React context for state management
│   ├── CardContext.tsx  # Card state management
│   └── OptionsContext.tsx # UI options state
├── hooks/               # Custom React hooks
│   └── useLoadCards.ts  # Load and process card data
├── services/            # External data services
│   ├── collector.ts     # Load personal collection data
│   └── tcg-data.ts      # Load TCG card and set data
├── types/               # TypeScript interfaces
├── utils/               # Utility functions
├── constants/           # Application constants
└── scripts/             # Data processing scripts
```

## Key Technologies

- **React 18**: UI framework
- **TypeScript**: Type-safe development
- **Vite**: Fast build tool and dev server
- **ESLint**: Code quality
- **CSS**: Styling

## Getting Started

### Installation
```bash
npm install
```

### Development
```bash
npm run dev
```
Starts the Vite dev server at `http://localhost:5173`

### Build
```bash
npm run build
```
Compiles TypeScript and creates optimized production build

### Linting
```bash
npm lint
```
Checks code quality with ESLint

### Runtime Card Data

Cards are generated in the browser after selecting a series. The runtime flow combines:

- Poke DB cards filtered by `seriesId`.
- All active TCGPlayer prices indexed by `productID` and shared by every series.
- Authenticated Collectr inventory from Supabase.

The browser requests the relevant TCGPlayer catalog from
`/api/prices?seriesId=<id>` and
persists it in the Cache API for at most 24 hours. Prices are indexed directly by
`productID`, so loading a series does not require mapping Poke DB sets to
TCGPlayer sets. Each product entry also retains TCGPlayer's exact `productName`,
collector `number`, and price-guide `setAbbrv`. Mass Entry uses TCGPlayer's
canonical format `1 Hisuian Zoroark VSTAR [SWSH11] 147/196` for every series.

In production, `/api/prices` is a Vercel Function. It makes the cross-origin
TCGPlayer requests server-side, keeps only products used by the requested series,
and caches each series response in Vercel's CDN for 24 hours. The filtering keeps
responses below Vercel's Function payload limit. The first request after
expiration refreshes the catalog; no generated price file or scheduled
deployment is required.

Poke DB browser requests use the same-origin `/api/poke-db/*` reverse proxy.
Vercel forwards that route to the Poke DB deployment, avoiding browser CORS
restrictions. Vite exposes the same route during local development.

Generated series are cached in browser memory for 15 minutes. During local
development, Vite serves the same `/api/prices` route with an in-memory 24-hour
cache.

Optional environment variables:

```powershell
$env:VITE_POKE_DB_API_BASE_URL = "https://example.com/api"
```

Supabase configuration (required only for the private Collections feature):

```powershell
$env:VITE_SUPABASE_URL = "https://your-project-ref.supabase.co"
$env:VITE_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_your_key"
```

The public catalog, prices, search, and non-collection filters work without a
session. Opening Collections prompts the user to sign in with Google through the
Supabase-hosted OAuth flow; Row Level Security then limits inventory queries to the
signed-in owner. Use only the browser-safe publishable key. Never put a service-role
key, database password, or connection string in this app.

### Continuous card scanner

Open **Menú → Escanear cartas** (`/scanner`). Before starting, choose the eras,
sets, rarities, top-level and specific variants, optional collector-number range,
printing, condition (Near Mint by default), and optional destination collection.
Import filters from a catalog link or use the **Base + Gym** preset: the seven
original sets, Common/Uncommon/Rare, and Standard. Start the video and hold each
card inside the guide until it says **Enviada a revisión**, then pass the next one.

Tesseract.js runs in a browser worker with local English/Spanish language models.
Only the name and collector-number regions are read. The selected printing is a
hard catalog filter, not a prediction. Two stable reads create a draft; no
collection mutation runs during capture. A clear name+number match preselects
the suggested card, while ambiguous readings require choosing among candidates.
OCR does not translate names, so localized names that differ from the catalog
may need a narrower scope or a manual correction in review.

Drafts are backed up in localStorage separately per account and for guests. Pause
the video to correct the card/printing, condition and destination, select reviewed
entries, and explicitly confirm their addition to the collection. Restoring the
page clears review selections, preserving the drafts. Guest drafts can be imported
explicitly after signing in. A malformed backup is reported without overwriting it.

On phones and tablets up to 900px wide, the scanner has separate **Configurar**,
**Escanear**, and **Revisar** panes. Starting a scan brings the camera and its
controls into view; opening another pane pauses the video. The preview scales
with the available screen height, including a compact horizontal layout and
safe-area spacing for installed PWAs. Review cards show a compact summary with
expandable editing and a save bar above the app navigation. Touch controls are
at least 44px high and form text stays at 16px to avoid mobile input zoom.

A held card is latched even if a subsequent frame is blurry. A different card
releases that latch; for identical consecutive copies, use **Otra copia igual**.
Pausing and resuming keeps the latch. Each draft has a stable copy UUID so
retrying a confirmed save after a lost response cannot insert the copy twice.
Successful saves leave the review queue; failed ones stay available for retry.
Collection writes use the existing authenticated Supabase client and require a connection. No card photos
leave the device. Leaving the app pauses the video and releases its camera tracks.

`predev` and `prebuild` run `scripts/prepare-ocr.mjs` to copy the pinned worker,
WASM cores and language data from npm into generated `public/ocr/v7/` assets.
They are served by the app's own origin and downloaded only when scanning starts.
The production service worker caches the requested OCR assets; this does not
make collection writes work offline. No schema migration or recognition server
is required.

For a browser smoke test without a camera or live database writes, run `npm run dev`
and open `/tests/scanner-browser.html`. It checks real browser OCR against a
synthetic card and runs the stable-read/duplicate gate into a review queue with zero collection writes.
Physical-card recognition accuracy and latency still need validation on target phones.
`/tests/scanner-video.html` runs the actual scanner UI with a synthetic video feed,
isolated temporary storage and no signed-in session. Its button swaps Pikachu for
Charmander to verify continuous capture, the held-card latch and review-only staging.
`/tests/scanner-responsive.html` wraps that isolated test in phone, landscape,
tablet and desktop viewports. **Medir diseño** reports horizontal overflow and
undersized touch targets without using the physical camera or a signed-in account.

### Installing it as an app

`public/manifest.webmanifest` plus the service worker make the dashboard installable, so
it can live on a home screen and open without browser chrome. Installation needs HTTPS
(or localhost) and the production build - the worker only caches the app shell when
registered with `shell=1`, which `npm run dev` does not do.

An installed app always launches at the manifest's `start_url`, which would drop the query
string the whole dashboard state lives in. `src/services/launchUrl.ts` remembers the last
URL and restores it on an installed launch, so closing and reopening returns you to the
same filters, sort and view. A launch that carries its own parameters - a shared link -
always wins, and a plain browser tab is left alone so typing the bare address still gives
a clean slate.

Icons are generated, not hand-drawn: `node scripts/generate-icons.mjs` rewrites
`public/icons/`. The output is committed, so it only needs running if the mark changes.

The dashboard now consumes the shared Collectr Supabase schema directly. Inventory reads
active `card_copies`, catalog data from `collectr_cards`, current collections from
`collectr_collections`, and collection-level printing labels from `collection_printings`.
The dashboard never calls the extension's private sync RPCs.

The shared schema and all of its RLS policies live in the collectr-extension repository
(`extension/supabase/schema.sql`, documented by its `collectr-supabase` skill); this app
adds no policies or schema migrations of its own.

Run the production build locally:

```bash
npm run build
```

Run the development server (including the local prices endpoint):

```bash
npm run dev
```

## Deploy to Vercel

Import this repository in Vercel. The committed `vercel.json` selects Vite,
builds with `npm run build`, publishes `dist`, configures SPA fallback routing,
and gives the prices function enough time for a cold-cache refresh. Configure
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in every Vercel
environment where Collections should be available. The public application can
still run without them; the Poke DB URL remains optional.

Vite inlines `import.meta.env` at build time, so **changing an environment
variable only takes effect after a redeploy** - the published bundle otherwise
keeps the value it was built with. A wrong `VITE_SUPABASE_URL` shows up as
`ERR_NAME_NOT_RESOLVED` on every auth request, including email and password,
since the browser never resolves the host.

Signing in also needs the deployed origin on Supabase's side, under
Authentication - URL Configuration: both sign-in and the password-reset link
send `window.location.origin` as their `redirectTo`, and Supabase refuses any
origin it has not been given. Add the preview wildcard too if sign-in should
work on preview deployments.

The SPA fallback is what serves `/c/<id>`, the read-only page for a collection
shared with `is_public`. It is the one route that renders without a session.

## Data Sources

- **Card Data**: Poke DB API, requested by series
- **TCG Player Pricing**: `/api/prices` with 24-hour Vercel CDN and browser caches
- **Collection Data**: Supabase `card_copies`, `cards`, `collections`, `collection_tags`, and `collection_printings` behind Supabase Auth and RLS
- **Fix Data**: Manual corrections and patches in `public/data/fix/`

## Data Flow

1. **Load Phase**: 
   - `useLoadCards` derives sets from the hierarchy API and fetches cards only for selected series
   - Active physical copies and active collection names are loaded from Supabase

2. **Processing Phase**:
   - Cards are expanded to show variants (standard, reverse, etc.)
   - Collection data is merged with card information
   - Validation checks are performed

3. **Display Phase**:
   - Cards stored in `CardContext` for global state
   - User filters/sorts are applied
   - Filtered results rendered in list or table view

## Card Schema

Each card includes:
- **Basic Info**: ID, name, type, supertype, subtypes, artist
- **Set Info**: Set ID, set name, series, rarity
- **Images**: Standard and reverse holo artwork
- **Pricing**: Condition-based prices (Near Mint, Lightly Played, etc.)
- **Collection**: Ownership status and quantity across collections
- **Variants**: Available card versions with different images and prices

## State Management

### CardContext
Manages all card-related data through multiple states:
- `allCards`: Complete card dataset
- `filteredCards`: After filter application
- `sortedCards`: After sorting
- `collectionCards`: After collection filtering
- `visibleCards`: Search results
- `variantsFilter` / `conditionsFilter`: Active filter selections

### OptionsContext
Manages UI options and settings like table/list view toggle and collection selections

## Common Tasks

### Add a New Filter
1. Add filter logic in `utils/filters.ts`
2. Create input component in `components/inputs/`
3. Wire into `Filters` component

### Display New Card Property
1. Update `Card` type in `types/dashboard.ts`
2. Add to card processing in data generation
3. Update display components (list/table views)

### Refresh Collection Data
1. Synchronize Collectr through Collectr Toolkit.
2. Reload the dashboard after the mirror sync completes.
3. The dashboard reads active copies only and never invokes private sync RPCs.

## Notes

- Card data and prices are generated at runtime per selected series
- Runtime responses retain the last cached result while their server instance remains warm
- Collection dates are stored in folder names (e.g., `11-13-25`)
- Some cards have special handling (e.g., `cel25c` set requires custom numbering)

## Local wishlists

Create a collection and subcollection in the local collections panel. The bulk
add button saves all actual cards in the rendered result, including shadowed
cards and results beyond the scroll viewport, after search and all filters.
Individual add/remove buttons appear with a selected subcollection in every view.
Placeholders are excluded and duplicate additions are ignored.

When signed in, wishlists and their subcollections are persisted as `collections` with a
`wish` tag, and their wanted cards are represented by active `card_copies` keyed by
`product_id`. Signed-out lists still use the browser backup under
`pokedashboard.local-collections.v1`; that backup is retained when it lacks the product
identity required by the new schema. Opening a saved list loads its members independently
of catalog filters. Select all subcollections or one, search within it, and use any
existing print format.
