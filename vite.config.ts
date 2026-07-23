import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    // three-mesh-bvh (and three/addons) import bare 'three'; point that at
    // the webgpu build so the bundle carries a single copy of three and all
    // class identities match.
    alias: [{ find: /^three$/, replacement: 'three/webgpu' }],
  },
  server: {
    port: 5173,
  },
  build: {
    // Required for top-level await (renderer.init()) and modern WebGPU code paths.
    target: 'esnext',
  },
});
