import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// The phone MVP: `npm run dev:mobile` serves it, `npm run build:mobile` emits a
// static bundle in dist-mobile/ you can host on any HTTPS origin and open on an
// iPhone. iOS needs HTTPS (or localhost) for GPS + motion sensors.
export default defineConfig({
  root: 'src/mobile',
  publicDir: false,
  build: {
    outDir: resolve(__dirname, 'dist-mobile'),
    emptyOutDir: true,
  },
  server: {
    host: true, // expose on the LAN so a tunnel / phone can reach it
    port: 5174,
  },
});
