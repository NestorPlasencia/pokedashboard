import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fetchAllPrices, type PriceBundle } from './src/scripts/priceSource'

const priceTtlMs = 24 * 60 * 60 * 1000
let priceBundleCache: { expiresAt: number; value: PriceBundle } | null = null
let pendingPriceBundle: Promise<PriceBundle> | null = null

const loadPriceBundle = (): Promise<PriceBundle> => {
  if (priceBundleCache && priceBundleCache.expiresAt > Date.now()) {
    return Promise.resolve(priceBundleCache.value)
  }
  if (pendingPriceBundle) return pendingPriceBundle

  pendingPriceBundle = fetchAllPrices()
    .then((value) => {
      priceBundleCache = { expiresAt: Date.now() + priceTtlMs, value }
      return value
    })
    .finally(() => {
      pendingPriceBundle = null
    })
  return pendingPriceBundle
}

const localPricesApi = (): Plugin => ({
  name: 'local-prices-api',
  configureServer(server) {
    server.middlewares.use('/data/prices.json', async (_request, response) => {
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.setHeader('Cache-Control', 'no-store')
      try {
        response.statusCode = 200
        response.end(JSON.stringify(await loadPriceBundle()))
      } catch (error) {
        server.config.logger.error(String(error))
        response.statusCode = 502
        response.end(JSON.stringify({ error: 'Unable to load TCGPlayer prices' }))
      }
    })
  },
})

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), localPricesApi()],
  server: {
    proxy: {
      '/poke-db-api': {
        target: 'https://poke-db-git-master-nestorplasencias-projects.vercel.app',
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/poke-db-api/, '/api'),
      },
    },
  },
})
