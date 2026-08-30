import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  worker: {
    // The compiler worker (frontend/src/compiler/wasm-worker.ts) is created
    // with `{ type: 'module' }` and dynamically `import()`s @yowasp/clang,
    // which itself uses top-level await and `new URL(x, import.meta.url)`
    // asset references to lazily fetch/compile its LLVM core .wasm files.
    // Vite's default production worker output format is 'iife', which does
    // not reliably support that combination (top-level await needs an ES
    // module, not a plain IIFE). Building the worker as a real ES module
    // matches how it already runs in `vite dev` and avoids a build/runtime
    // behavior mismatch for exactly this worker.
    format: 'es',
  },
  optimizeDeps: {
    // @yowasp/clang and @bjorn3/browser_wasi_shim are only ever imported
    // from inside the worker, not from the main-thread module graph. Vite's
    // esbuild-based dependency pre-bundling targets the main thread by
    // default and can mishandle a worker-only dependency that performs
    // eager top-level-await asset fetches (rewriting/misplacing the
    // `import.meta.url`-relative paths @yowasp/clang uses to locate its
    // .wasm/.tar assets). Excluding them keeps their code and asset
    // resolution exactly as shipped by the package.
    exclude: ['@yowasp/clang', '@bjorn3/browser_wasi_shim'],
  },
});