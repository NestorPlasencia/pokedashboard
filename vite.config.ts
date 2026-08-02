import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import {
  fetchPricesForSeries,
  type RuntimePriceBundle,
} from './src/scripts/priceSource'

const priceTtlMs = 24 * 60 * 60 * 1000
const priceBundleCache = new Map<number, { expiresAt: number; value: RuntimePriceBundle }>()
const pendingPriceBundles = new Map<number, Promise<RuntimePriceBundle>>()

const loadPriceBundle = (seriesId: number): Promise<RuntimePriceBundle> => {
  const cached = priceBundleCache.get(seriesId)
  if (cached && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.value)
  }
  const pending = pendingPriceBundles.get(seriesId)
  if (pending) return pending

  const request = fetchPricesForSeries(seriesId)
    .then((value) => {
      priceBundleCache.set(seriesId, {
        expiresAt: Date.now() + priceTtlMs,
        value,
      })
      return value
    })
    .finally(() => {
      pendingPriceBundles.delete(seriesId)
    })
  pendingPriceBundles.set(seriesId, request)
  return request
}

const localPricesApi = (): Plugin => ({
  name: 'local-prices-api',
  configureServer(server) {
    server.middlewares.use('/api/prices', async (request, response) => {
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.setHeader('Cache-Control', 'no-store')
      try {
        const requestUrl = new URL(request.url || '/', 'http://localhost')
        const seriesId = Number(requestUrl.searchParams.get('seriesId'))
        if (!Number.isInteger(seriesId) || seriesId <= 0) {
          response.statusCode = 400
          response.end(JSON.stringify({ error: 'seriesId must be a positive integer' }))
          return
        }
        response.statusCode = 200
        response.end(JSON.stringify(await loadPriceBundle(seriesId)))
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
  base: '/',
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
