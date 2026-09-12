/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_POKE_DB_API_BASE_URL?: string;
  // Both fall back to a working default, so neither has to be set to deploy.
  readonly VITE_TREND_POINTS_URL?: string;
  readonly VITE_PRICE_EXPLORER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
