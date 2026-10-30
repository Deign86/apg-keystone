import tailwind from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Tauri serves the built files; in development it points at this dev server.
export default defineConfig({
  plugins: [react(), tailwind()],
  clearScreen: false,
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
  build: { target: 'es2022', reportCompressedSize: false, chunkSizeWarningLimit: 1500 },
  test: {
    environment: 'jsdom',
    globals: true,
    env: { TZ: 'Asia/Manila' },
    setupFiles: './src/test/setup.ts',
  },
});
