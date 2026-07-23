import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
  },
  build: {
    // Required for top-level await (renderer.init()) and modern WebGPU code paths.
    target: 'esnext',
  },
});
