import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const isProd = process.env.NODE_ENV === 'production';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: ['wilho.com.br'],
    hmr: isProd
      ? {
          protocol: 'wss',
          host: 'wilho.com.br',
        }
      : true,
    proxy: {
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
    watch: {
      ignored: ['**/node_modules/**', '**/dist/**', '**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.gif'],
    },
  },
});
