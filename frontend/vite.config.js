import path from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isCapBuild = process.env.CAPACITOR_BUILD === '1'
const isCommunity = process.env.VITE_DGCPOS_EDITION === 'community'

/** Strip crossorigin + PWA tags — WKWebView rejects module CORS on capacitor://localhost */
function capacitorHtmlFix() {
  return {
    name: 'capacitor-html-fix',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        if (!isCapBuild) return html
        let out = html
          .replace(/\s+crossorigin(="[^"]*")?/g, '')
          .replace(/<link rel="manifest"[^>]*>\s*/g, '')
          .replace(/<script[^>]*registerSW[^>]*><\/script>\s*/g, '')
          .replace(/<link rel="preconnect"[^>]*>\s*/g, '')
          .replace(/<link[^>]*fonts\.googleapis\.com[^>]*>\s*/g, '')
          .replace(/<link rel="modulepreload"[^>]*>\s*/g, '')
          .replace(/(href|src)="\/(assets\/[^"]+)"/g, '$1="./$2"')
          .replace(/(href|src)="\/(dgc-[^"]+|icons\/[^"]+|favicon\.ico|apple-touch-icon\.png)"/g, '$1="./$2"')
          .replace(/content="#071B52"/g, 'content="#F6F9FC"')

        /* Move module entry to end of body — paint boot fallback before JS */
        const moduleMatch = out.match(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/)
        if (moduleMatch) {
          const tag = moduleMatch[0].replace(/\s+crossorigin(="[^"]*")?/g, '')
          out = out.replace(moduleMatch[0], '')
          out = out.replace('</body>', `  ${tag}\n</body>`)
        }
        return out
      },
    },
  }
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@ee/routes': isCommunity
        ? path.resolve(__dirname, 'src/edition/enterpriseRoutes.stub.jsx')
        : path.resolve(__dirname, 'ee-frontend/routes.jsx'),
    },
  },
  base: isCapBuild ? './' : '/',
  plugins: [
    react(),
    ...(isCapBuild ? [] : [
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: false,
        manifest: {
          name: 'DGC RetailOS',
          short_name: 'DGC POS',
          description: 'DGC POS — Smart POS. Better Business.',
          theme_color: '#071B52',
          background_color: '#F8FAFC',
          display: 'standalone',
          orientation: 'any',
          start_url: '/',
          scope: '/',
          categories: ['business', 'productivity'],
          icons: [
            { src: '/icons/icon-180.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          ],
          screenshots: [],
          prefer_related_applications: false,
        },
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icons/*.png'],
        workbox: {
          skipWaiting: true,
          clientsClaim: true,
          cleanupOutdatedCaches: true,
          cacheId: 'dgc-pos-v5',
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/api\//, /^\/assets\//, /^\/workbox-/, /^\/sw\.js$/],
          runtimeCaching: [
            {
              urlPattern: /\/api\/(settings|products|customers|promotions|gift-cards)/,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'dgc-api-reference-v5',
                networkTimeoutSeconds: 4,
                expiration: { maxEntries: 50, maxAgeSeconds: 86400 },
                cacheableResponse: { statuses: [0, 200] }
              }
            },
            {
              urlPattern: /\/api\/(dashboard|reports)/,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'dgc-api-dashboard-v5',
                expiration: { maxEntries: 20, maxAgeSeconds: 3600 }
              }
            }
          ]
        }
      }),
    ]),
    capacitorHtmlFix(),
  ],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-motion': ['framer-motion'],
          'vendor-charts': ['chart.js', 'react-chartjs-2'],
          'vendor-icons': ['lucide-react'],
          'vendor-utils': ['axios', 'date-fns', 'react-hot-toast', 'jsbarcode', 'clsx'],
          'vendor-query': ['@tanstack/react-query'],
        }
      }
    }
  },
  server: {
    proxy: {
      '/api': { target: 'http://localhost:5000', changeOrigin: true }
    }
  }
})