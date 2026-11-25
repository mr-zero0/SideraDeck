/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
  // `npm run dev:api` serves functions/ on 8788 via wrangler; Vite forwards /api to it.
  // 127.0.0.1, not localhost: wrangler binds IPv4 only, and Node may resolve localhost to ::1.
  server: { proxy: { '/api': 'http://127.0.0.1:8788' } },
  build: {
    rollupOptions: {
      output: {
        // Keep the heavy 3D stack in its own long-cached chunk.
        manualChunks: (id) => (/node_modules[\\/](three|@react-three)/.test(id) ? 'three' : undefined),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'functions/**/*.test.ts'],
  },
})
