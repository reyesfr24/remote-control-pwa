import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo (npm run dev) Vite reenvía la API y el WebSocket al servidor real.
const target = 'https://localhost:8443';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    proxy: {
      '/ws': { target, ws: true, secure: false },
      '/api': { target, secure: false },
      '/icons': { target, secure: false },
    },
  },
});
