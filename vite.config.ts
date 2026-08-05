import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// The dev server / default build target is the in-browser simulator, so that
// `npm run dev` opens a working HUD you can watch "fly" the demo route without
// any glasses hardware. On real hardware the app is loaded by the Even iPhone
// app's WebView from `index.html` at the project root instead.
export default defineConfig({
  root: 'src/sim',
  publicDir: false,
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  server: {
    host: true,
    open: true,
  },
});
