import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.ts because that one roots the dev server at
// src/sim (the simulator). Tests live at the project root.
export default defineConfig({
  root: '.',
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
