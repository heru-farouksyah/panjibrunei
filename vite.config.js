import { defineConfig } from 'vite';

// Two entry points: the RTS (index.html) and the Merge Kampong mini-game +
// journey map (merge.html). `base: './'` keeps asset paths relative so the
// build can be opened straight from the filesystem.
export default defineConfig({
  base: './',
  server: {
    host: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        merge: 'merge.html',
      },
    },
  },
});
