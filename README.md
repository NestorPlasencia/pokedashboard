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
session. Opening Collections prompts the user to sign in through Supabase Auth;
Row Level Security then limits inventory queries to the signed-in owner. Use
only the browser-safe publishable key. Never put a service-role key, database
password, or connection string in this app.

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

## Data Sources

- **Card Data**: Poke DB API, requested by series
- **TCG Player Pricing**: `/api/prices` with 24-hour Vercel CDN and browser caches
- **Collection Data**: Supabase `card_copies`, `collectr_collections`, and `collectr_cards` behind Auth and RLS
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
