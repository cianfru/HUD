import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Dev-only harness to discover the G2 image-container byte format in the sim.
export default defineConfig({
  root: 'tools/imgprobe',
  publicDir: false,
  build: { outDir: resolve(__dirname, 'dist-imgprobe'), emptyOutDir: true },
  server: { host: true, port: 5177 },
});
