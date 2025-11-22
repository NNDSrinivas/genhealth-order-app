import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // When running `npm run build`, output the compiled assets into the
  // FastAPI static directory so the API and UI can be served from one URL.
  build: {
    outDir: '../app/static',
    emptyOutDir: true,
  },
  // During development, proxy API requests to the FastAPI backend to avoid
  // CORS issues and to make fetch calls relative.
  server: {
    proxy: {
      '/orders': 'http://127.0.0.1:8001',
      '/extract': 'http://127.0.0.1:8001',
      '/activity-logs': 'http://127.0.0.1:8001',
      '/deleted-orders': 'http://127.0.0.1:8001',
    },
  },
});