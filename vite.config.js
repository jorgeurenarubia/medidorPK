import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// - GitHub Pages: la app vive en https://jorgeurenarubia.github.io/medidorPK/
// - Android (Capacitor): rutas relativas y sin service worker  →  npm run build:android
export default defineConfig(({ command, mode }) => {
  const android = mode === 'android';
  const base = command === 'serve' ? '/' : android ? './' : '/medidorPK/';
  return {
    base,
    build: { outDir: 'dist', target: 'es2020' },
    server: { host: true },
    plugins: [
      VitePWA({
        disable: android,
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
        manifest: {
          id: '/medidorPK/',
          name: 'medidorPK',
          short_name: 'medidorPK',
          description: 'Mide tramos de carretera con el GPS del móvil',
          lang: 'es',
          start_url: '.',
          scope: '.',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#111418',
          theme_color: '#111418',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png}'],
          navigateFallback: 'index.html',
          runtimeCaching: [
            {
              // Teselas del mapa: se guardan para ver tramos ya consultados sin cobertura.
              urlPattern: /^https:\/\/tile\.openstreetmap\.org\//,
              handler: 'CacheFirst',
              options: {
                cacheName: 'mapa',
                expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }),
    ],
    test: { include: ['tests/**/*.test.js'] },
  };
});
