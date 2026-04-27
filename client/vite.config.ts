import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const isProd = process.env.NODE_ENV === 'production';
const appRelease = process.env.GIT_COMMIT_SHA || process.env.VITE_APP_RELEASE || 'dev';
const devPort = Number(process.env.VITE_DEV_PORT || 5173);
const serverPort = Number(process.env.VITE_SERVER_PORT || 3002);
const clientPackageJson = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8')
) as {
  version: string;
};

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(clientPackageJson.version),
    __APP_RELEASE__: JSON.stringify(appRelease),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['assets/favicon.png', 'assets/icon-192.png', 'assets/icon-512.png'],
      manifest: {
        name: 'Legends of Gelehk',
        short_name: 'Gelehk',
        id: '/',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#111111',
        theme_color: '#111111',
        icons: [
          {
            src: '/assets/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/assets/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2,json}'],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: {
                maxEntries: 256,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: ({ request }) => request.destination === 'audio',
            handler: 'CacheFirst',
            options: {
              cacheName: 'audio-cache',
              expiration: {
                maxEntries: 64,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
    port: devPort,
    strictPort: true,
    allowedHosts: ['wilho.com.br'],
    hmr: isProd
      ? {
          protocol: 'wss',
          host: 'wilho.com.br',
        }
      : true,
    proxy: {
      '/api': {
        target: `http://localhost:${serverPort}`,
      },
      '/ws': {
        target: `ws://localhost:${serverPort}`,
        ws: true,
      },
    },
    watch: {
      ignored: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.png',
        '**/*.jpg',
        '**/*.jpeg',
        '**/*.gif',
      ],
    },
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }

          if (id.includes('/phaser/')) {
            return 'phaser';
          }

          if (id.includes('/react/') || id.includes('/react-dom/')) {
            return 'react-vendor';
          }

          if (id.includes('/zustand/') || id.includes('/lucide-react/')) {
            return 'ui-vendor';
          }

          return 'vendor';
        },
      },
    },
  },
});
