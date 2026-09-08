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
    define: {
      // Same mechanism as the real app's vite.config.ts: Render supplies this
      // at build time via an environment variable on the demo's own service,
      // never hard-coded here. A Google Maps JS API key is meant to be
      // client-visible (Google restricts it by HTTP referrer on their end,
      // not by keeping it secret) -- this demo's Render service needs its
      // own referrer allowlist entry for ownersdemo.onrender.com, separate
      // from the real app's.
      'process.env.GOOGLE_MAPS_PLATFORM_KEY': JSON.stringify(
        process.env.GOOGLE_MAPS_PLATFORM_KEY || ''
      ),
      'process.env.GOOGLE_MAPS_MAP_ID': JSON.stringify(process.env.GOOGLE_MAPS_MAP_ID || ''),
    },
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
