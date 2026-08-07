import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// The sim-reference build: a swipeable deck of glance-cards distilled from an
// airline sim-evaluation sheet, rendered on the glasses via the Even Hub SDK.
// `npm run dev:simref` serves it for the official simulator.
export default defineConfig({
  root: 'src/simref',
  publicDir: false,
  build: {
    outDir: resolve(__dirname, 'dist-simref'),
    emptyOutDir: true,
  },
  server: {
    host: true,
    port: 5176,
  },
});
