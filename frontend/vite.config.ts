import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    // @yowasp/clang ships four LLVM core .wasm modules, referenced via
    // `new URL('./llvm.core*.wasm', import.meta.url)`. Three are well over
    // Vite's default 4KB assetsInlineLimit and are emitted as real files —
    // but llvm.core4.wasm is only 787 bytes, so by default Vite inlines
    // *that one* as a `data:application/wasm;base64,...` URI directly in
    // the built JS. The compiler then fetch()es that data: URL at runtime,
    // which Content-Security-Policy's connect-src (correctly) blocks unless
    // 'self' is widened to allow data:. Disabling inlining entirely keeps
    // every WASM asset (including this small one) as a real same-origin
    // file, so connect-src can stay 'self' with no data: exception needed.
    // (No other asset in this app is affected: the PWA icons live in
    // public/, which Vite always copies verbatim regardless of this
    // setting.)
    assetsInlineLimit: 0,
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