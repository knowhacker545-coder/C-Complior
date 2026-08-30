import { runClang } from '@yowasp/clang/gen/bundle.js';
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
  let stderr = '';
  const files = await runClang(
    ['clang', '-std=c11', '-Wl,--initial-memory=16777216', '-Wl,--max-memory=268435456', 'main.c', '-o', 'main.wasm'],
    { 'main.c': code },
    {
      stderr: (bytes: Uint8Array | null) => {
        if (bytes) stderr += decoder.decode(bytes, { stream: true });
      },
    },
  );

  const wasm = files['main.wasm'];
  if (!(wasm instanceof Uint8Array)) {
    throw new Error('The WebAssembly compiler did not produce an executable module.');
  }
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
    const wasmBuffer = new ArrayBuffer(wasm.byteLength);
    new Uint8Array(wasmBuffer).set(wasm);
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

    const memory = instance.exports.memory;
    const start = instance.exports._start;
    if (!(memory instanceof WebAssembly.Memory) || typeof start !== 'function') {
      throw new Error('The compiled WebAssembly module does not expose the WASI start interface.');
    }
    const wasiExit = wasi.start({ exports: { memory, _start: start } });
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
      await runClang(['clang', '--version']);
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
