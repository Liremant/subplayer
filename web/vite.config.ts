import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The Rust server owns /api and /media; proxying keeps dev same-origin so Range
// requests never hit a CORS preflight.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/media': 'http://127.0.0.1:3000',
    },
  },
});
