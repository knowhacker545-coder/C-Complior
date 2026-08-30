import { File, OpenFile, WASI } from '@bjorn3/browser_wasi_shim';
import type { CompilerDiagnostic, CompilerResult } from './types';

const MAX_OUTPUT = 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface WorkerRequest {
  id: number;
  action: 'ready' | 'compile' | 'run';
  code?: string;
  stdin?: string;
}

interface WorkerResponse {
  id: number;
  type: 'ready' | 'result' | 'error';
  result?: CompilerResult;
  message?: string;
}

function post(message: WorkerResponse) {
  self.postMessage(message);
}

function log(...args: unknown[]) {
  // Structured, low-cardinality debug logging for diagnosing initialization
  // failures in the browser console. No user code, stdin, stdout, or file
  // contents are ever logged here — only compiler lifecycle stage names.
  console.debug('[WASM]', ...args);
}

/**
 * Thrown when a specific, identifiable stage of compiler bring-up fails, so
 * callers can distinguish "the package/its WASM assets never loaded" from an
 * ordinary compile or runtime error in the user's own C program.
 */
class CompilerInitError extends Error {
  readonly stage: 'import';
  constructor(stage: CompilerInitError['stage'], message: string, cause?: unknown) {
    super(message);
    this.name = 'CompilerInitError';
    this.stage = stage;
    if (cause !== undefined) this.cause = cause;
  }
}

// `@yowasp/clang`'s bundle performs eager, top-level `await`-ed fetches of
// several multi-megabyte LLVM core .wasm modules and a resources .tar as
// soon as the module is evaluated (see node_modules/@yowasp/clang/gen/bundle.js).
// A static top-level `import` here would run that entire chain before
// `self.onmessage` below is ever registered, so any transient failure in it
// (a slow/blocked asset fetch, a stale service-worker cache entry, etc.)
// would kill the worker before it could report a specific cause. Importing
// it lazily, on first use, keeps the worker responsive immediately and lets
// us attribute a failure here specifically to package/asset loading rather
// than to clang execution or WASM instantiation.
let clangModulePromise: Promise<typeof import('@yowasp/clang')> | null = null;
function loadClang(): Promise<typeof import('@yowasp/clang')> {
  if (!clangModulePromise) {
    log('loading compiler');
    clangModulePromise = import('@yowasp/clang')
      .then((mod) => {
        log('compiler loaded');
        return mod;
      })
      .catch((error: unknown) => {
        clangModulePromise = null; // allow a retry on the next request
        const message = error instanceof Error ? error.message : String(error);
        throw new CompilerInitError(
          'import',
          `Failed to load the WebAssembly compiler package or its WASM assets (llvm.core*.wasm / llvm-resources.tar): ${message}`,
          error,
        );
      });
  }
  return clangModulePromise;
}

function diagnosticsFromStderr(stderr: string): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = [];
  for (const line of stderr.split(/\r?\n/)) {
    const match = line.match(/(?:main\.c|[^:]+):(\d+):(\d+):\s*(?:fatal\s+)?(?:error|warning):\s*(.*)$/);
    if (match) {
      diagnostics.push({ line: Number(match[1]), column: Number(match[2]), message: match[3] });
    }
  }
  return diagnostics;
}

function decodeFile(file: OpenFile): string {
  return decoder.decode(file.file.data);
}

async function compileSource(code: string): Promise<{ wasm: Uint8Array; stderr: string }> {
  const { commands } = await loadClang();
  let stderr = '';
  log('runClang started');
  // `commands.clang` is the typed, documented entry point for this installed
  // build of @yowasp/clang (see node_modules/@yowasp/clang/lib/api.d.ts) — it
  // prepends the `clang` argv0 itself, so it is not passed here. `main.c` is
  // supplied only through this in-memory `files` tree (@yowasp/clang's
  // virtual filesystem) — no real filesystem, Node's or the browser's, is
  // ever touched.
  //
  // NOTE: an ordinary compile error in the user's C code also surfaces as
  // this call rejecting (clang exits non-zero) — that is expected, and is
  // handled by the existing diagnostics-from-stderr path in compile()/run(),
  // unchanged below. Only the loadClang() import step above is treated as an
  // "initialization" failure; a rejection here is left to propagate as-is so
  // a plain syntax error is never misreported as "compiler could not load."
  const files = await commands.clang(
    ['-std=c11', '-Wl,--initial-memory=16777216', '-Wl,--max-memory=268435456', 'main.c', '-o', 'main.wasm'],
    { 'main.c': code },
    {
      stderr: (bytes: Uint8Array | null) => {
        if (bytes) stderr += decoder.decode(bytes, { stream: true });
      },
    },
  );
  log('clang finished');

  if (!files) {
    throw new Error('The WebAssembly compiler did not produce any output.');
  }

  const wasm = files['main.wasm'];
  if (!(wasm instanceof Uint8Array)) {
    throw new Error('The WebAssembly compiler did not produce an executable module.');
  }
  log('wasm received');
  return { wasm, stderr };
}

async function compile(code: string): Promise<CompilerResult> {
  const started = performance.now();
  try {
    const { stderr } = await compileSource(code);
    const diagnostics = diagnosticsFromStderr(stderr);
    return {
      success: diagnostics.length === 0,
      stdout: '',
      stderr,
      exitCode: diagnostics.length === 0 ? 0 : 1,
      executionTime: (performance.now() - started) / 1000,
      errorType: diagnostics.length === 0 ? undefined : 'compile-error',
      diagnostics,
    };
  } catch (error) {
    if (error instanceof CompilerInitError) {
      // Loading the compiler package itself failed — this is not a problem
      // with the user's C code, so it must not be reported as a compile
      // error (which would show inline squiggles in the editor for nothing).
      return {
        success: false,
        stdout: '',
        stderr: error.message,
        exitCode: 1,
        executionTime: (performance.now() - started) / 1000,
        errorType: 'initialization',
      };
    }
    const stderr = error instanceof Error ? error.message : String(error);
    const diagnostics = diagnosticsFromStderr(stderr);
    return {
      success: false,
      stdout: '',
      stderr,
      exitCode: 1,
      executionTime: (performance.now() - started) / 1000,
      errorType: 'compile-error',
      diagnostics,
    };
  }
}

async function run(code: string, stdin: string): Promise<CompilerResult> {
  const started = performance.now();
  let stdout = '';
  let stderr = '';
  let outputTooLarge = false;

  try {
    const { wasm, stderr: compilerStderr } = await compileSource(code);
    if (compilerStderr.trim()) {
      return {
        success: false,
        stdout: '',
        stderr: compilerStderr,
        exitCode: 1,
        executionTime: (performance.now() - started) / 1000,
        errorType: 'compile-error',
        diagnostics: diagnosticsFromStderr(compilerStderr),
      };
    }

    const stdinFile = new OpenFile(new File(encoder.encode(stdin)));
    const stdoutFile = new OpenFile(new File([]));
    const stderrFile = new OpenFile(new File([]));
    const wasi = new WASI(['main.wasm'], [], [stdinFile, stdoutFile, stderrFile]);
    log('wasi initialized');
    // `wasm` is a Uint8Array<ArrayBufferLike>, whose backing buffer could in
    // principle be a SharedArrayBuffer; WebAssembly.compile's BufferSource
    // requires an ArrayBuffer-backed view specifically. `new Uint8Array(wasm)`
    // copies the bytes into a fresh, genuinely ArrayBuffer-backed typed array
    // (see the Uint8ArrayConstructor overload for ArrayLike<number>).
    const wasmBuffer = new Uint8Array(wasm);
    const module = await WebAssembly.compile(wasmBuffer);
    let instance: WebAssembly.Instance | null = null;
    const imports = { ...wasi.wasiImport };
    const originalFdWrite = imports.fd_write;
    let outputBytes = 0;
    imports.fd_write = (fd: number, iovs: number, iovsLen: number, nwritten: number) => {
      if (!instance) return originalFdWrite(fd, iovs, iovsLen, nwritten);
      const memoryExport = instance.exports.memory;
      if (!(memoryExport instanceof WebAssembly.Memory)) return originalFdWrite(fd, iovs, iovsLen, nwritten);
      const memory = memoryExport;
      if (!memory) return originalFdWrite(fd, iovs, iovsLen, nwritten);
      const view = new DataView(memory.buffer);
      let requested = 0;
      for (let i = 0; i < iovsLen; i += 1) requested += view.getUint32(iovs + i * 8 + 4, true);
      outputBytes += requested;
      if (outputBytes > MAX_OUTPUT) throw new Error('Output limit exceeded (1 MB).');
      return originalFdWrite(fd, iovs, iovsLen, nwritten);
    };
    instance = await WebAssembly.instantiate(module, {
      wasi_snapshot_preview1: imports,
    });
    log('module instantiated');

    // browser_wasi_shim's WASI.start requires an object typed as
    // `{ exports: { memory: WebAssembly.Memory; _start: () => unknown } }`,
    // which a plain WebAssembly.Instance (typed as `{ exports: Exports }`,
    // an index signature) does not structurally satisfy. Narrow each export
    // at runtime instead of casting the instance.
    const startMemory = instance.exports.memory;
    if (!(startMemory instanceof WebAssembly.Memory)) {
      throw new Error('The compiled module did not export a WebAssembly memory.');
    }
    const startFn = instance.exports._start;
    if (typeof startFn !== 'function') {
      throw new Error('The compiled module did not export a _start function.');
    }
    log('program started');
    const wasiExit = wasi.start({
      exports: {
        memory: startMemory,
        // `startFn` is typed as the ambient `Function` interface, which has
        // no call signature by design; `.call()` is the type-safe way to
        // invoke it without an `as` cast.
        _start: () => startFn.call(undefined),
      },
    });
    const numericExit = typeof wasiExit === 'number' ? wasiExit : 0;

    stdout = decodeFile(stdoutFile);
    stderr = decodeFile(stderrFile);
    if (stdout.length + stderr.length > MAX_OUTPUT) {
      outputTooLarge = true;
      stdout = stdout.slice(0, MAX_OUTPUT);
      stderr = stderr.slice(0, Math.max(0, MAX_OUTPUT - stdout.length));
    }

    return {
      success: !outputTooLarge,
      stdout,
      stderr: outputTooLarge ? `${stderr}\n\nOutput limit exceeded (1 MB).` : stderr,
      exitCode: numericExit,
      executionTime: (performance.now() - started) / 1000,
      errorType: outputTooLarge ? 'output-limit' : undefined,
      outputTruncated: outputTooLarge,
    };
  } catch (error) {
    if (error instanceof CompilerInitError) {
      return {
        success: false,
        stdout,
        stderr: error.message,
        exitCode: 1,
        executionTime: (performance.now() - started) / 1000,
        errorType: 'initialization',
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    const isOutputLimit = message.includes('Output limit exceeded');
    const exitCode = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'number' ? error.code : 1;
    return {
      success: false,
      stdout,
      stderr: isOutputLimit ? 'Output limit exceeded (1 MB).' : (stderr || message),
      exitCode,
      executionTime: (performance.now() - started) / 1000,
      errorType: isOutputLimit ? 'output-limit' : 'runtime-error',
    };
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    if (request.action === 'ready') {
      const { commands } = await loadClang();
      await commands.clang(['--version']);
      post({ id: request.id, type: 'ready' });
      return;
    }
    if (request.action === 'compile') {
      post({ id: request.id, type: 'result', result: await compile(request.code ?? '') });
      return;
    }
    post({ id: request.id, type: 'result', result: await run(request.code ?? '', request.stdin ?? '') });
  } catch (error) {
    post({ id: request.id, type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};