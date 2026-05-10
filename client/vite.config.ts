import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const isProd = process.env.NODE_ENV === 'production';
const appRelease = process.env.GIT_COMMIT_SHA || process.env.VITE_APP_RELEASE || 'dev';
const devPort = Number(process.env.VITE_DEV_PORT || 5174);
const serverPort = Number(process.env.VITE_SERVER_PORT || 3003);
const clientPackageJson = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8')
) as {
  version: string;
};

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(clientPackageJson.version),
    __APP_RELEASE__: JSON.stringify(appRelease),
  },
  plugins: [tailwindcss(), react()],
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
    chunkSizeWarningLimit: 1300,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }

          if (id.includes('/phaser/')) {
            return 'phaser';
          }

          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/scheduler/') ||
            id.includes('/zustand/') ||
            id.includes('/lucide-react/')
          ) {
            return 'react-vendor';
          }

          return 'vendor';
        },
      },
    },
  },
});
