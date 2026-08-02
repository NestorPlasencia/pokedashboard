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
- Local collector and condition data.

The consolidated TCGPlayer price catalog is downloaded once per browser every 24
hours and persisted using the browser Cache API, which is available on GitHub
Pages because it is served over HTTPS. Prices are indexed by `productID`.

Because TCGPlayer does not allow cross-origin browser requests, the scheduled
GitHub Pages workflow runs `npm run refresh-prices` once per day and writes a
single `dist/data/prices.json` into the deployment artifact. The repository does
not store price files. The first browser load after its cache expires downloads
the consolidated dataset.

Generated series are cached in memory for 15 minutes. No serverless endpoint is
required by the dashboard.

During local development, Vite serves `/data/prices.json` through a Node
middleware that downloads and caches the consolidated catalog in memory for 24
hours. It does not create price files in `public`.

Optional environment variables:

```powershell
$env:VITE_POKE_DB_API_BASE_URL = "https://example.com/api"
```

To generate the consolidated price artifact manually after a build:

```bash
npm run refresh-prices -- --output dist/data/prices.json
```

To build the complete production artifact and open its local preview with one
command:

```bash
npm run preview:prices
```

## Data Sources

- **Card Data**: Poke DB API, requested by series
- **TCG Player Pricing**: TCGPlayer endpoints with a 24-hour browser cache
- **Collection Data**: Dated collection snapshots in `public/data/collector/`
- **Fix Data**: Manual corrections and patches in `public/data/fix/`

## Data Flow

1. **Load Phase**: 
   - `useLoadCards` derives sets from the hierarchy API and fetches cards only for selected series
   - Personal collection data is loaded based on collection date

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

### Load Different Collection
1. Update collection path in `services/collector.ts`
2. Adjust date or collection name as needed
3. Regenerate processed data if needed

## Notes

- Card data and prices are generated at runtime per selected series
- Runtime responses retain the last cached result while their server instance remains warm
- Collection dates are stored in folder names (e.g., `11-13-25`)
- Some cards have special handling (e.g., `cel25c` set requires custom numbering)
