import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// The on-glasses / official-simulator build. Renders through the Even Hub SDK
// (text containers), not a canvas. `npm run dev:glasses` serves it for the
// official simulator: `npx @evenrealities/evenhub-simulator http://localhost:5175`.
export default defineConfig({
  root: 'src/glasses',
  publicDir: false,
  // Relative asset paths so the built bundle works inside an .ehpk package
  // (mounted at an arbitrary path in the Even WebView), not just at a URL root.
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist-glasses'),
    emptyOutDir: true,
  },
  server: {
    host: true,
    port: 5175,
  },
});
