import type { CompilerResult, CompilerService } from './types';

interface WorkerResponse {
  id: number;
  type: 'ready' | 'result' | 'error';
  result?: CompilerResult;
  message?: string;
}

type Pending = { resolve: (value: CompilerResult) => void; reject: (reason?: unknown) => void };

export function createWasmCompiler(): CompilerService {
  let worker: Worker | null = null;
  let nextId = 1;
  let readyPromise: Promise<void> | null = null;
  const pending = new Map<number, Pending>();

  const startWorker = () => {
    if (worker) return worker;
    worker = new Worker(new URL('./wasm-worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.type === 'ready') {
        const pendingReady = pending.get(message.id);
        if (pendingReady) {
          pendingReady.resolve({ success: true, stdout: '', stderr: '', exitCode: 0, executionTime: 0 });
          pending.delete(message.id);
        }
        return;
      }
      const item = pending.get(message.id);
      if (!item) return;
      pending.delete(message.id);
      if (message.type === 'error') item.reject(new Error(message.message || 'Compiler initialization failed.'));
      else if (message.result) item.resolve(message.result);
      else item.reject(new Error('Compiler worker returned an invalid result.'));
    };
    worker.onerror = (event) => {
      const error = new Error(event.message || 'Compiler worker failed.');
      for (const item of pending.values()) item.reject(error);
      pending.clear();
      worker?.terminate();
      worker = null;
      readyPromise = null;
    };
    return worker;
  };

  const request = (action: 'ready' | 'compile' | 'run', code = '', stdin = '') => {
    const current = startWorker();
    const id = nextId++;
    return new Promise<CompilerResult>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      current.postMessage({ id, action, code, stdin });
    });
  };

  return {
    ready: async () => {
      if (!readyPromise) {
        readyPromise = request('ready').then(() => undefined).catch((error) => {
          readyPromise = null;
          throw error;
        });
      }
      await readyPromise;
    },
    compile: async (code) => request('compile', code),
    run: async (code, stdin) => request('run', code, stdin),
    cancel: () => {
      for (const item of pending.values()) item.reject(new DOMException('Cancelled', 'AbortError'));
      pending.clear();
      worker?.terminate();
      worker = null;
      readyPromise = null;
    },
    dispose: () => {
      for (const item of pending.values()) item.reject(new DOMException('Disposed', 'AbortError'));
      pending.clear();
      worker?.terminate();
      worker = null;
      readyPromise = null;
    },
  };
}
