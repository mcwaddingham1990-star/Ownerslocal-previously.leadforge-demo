import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

// Standalone demo build: the real app's vite.config.ts wires up dev-only
// middleware for /api/ai, /api/plaid, /api/notifications routes backed by
// server/*.ts. This demo has no backend at all (see src/firebase.ts and
// src/hooks/useFirestoreCollection.ts for the mock data layer it uses
// instead), so that middleware and its server/ imports are dropped here
// rather than carried over unused.
export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: parseInt(process.env.PORT || '3000'),
      allowedHosts: true as const,
    },
  };
});
