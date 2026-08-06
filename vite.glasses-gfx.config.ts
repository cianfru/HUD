import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Graphical glasses build (image containers). Point the official simulator at it:
// `npx @evenrealities/evenhub-simulator http://localhost:5178`.
export default defineConfig({
  root: 'src/glasses-gfx',
  publicDir: false,
  build: { outDir: resolve(__dirname, 'dist-glasses-gfx'), emptyOutDir: true },
  server: { host: true, port: 5178 },
});
