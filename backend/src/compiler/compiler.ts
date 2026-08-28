import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface CompileRequest { code: string; }
export interface RunRequest extends CompileRequest { input?: string; }

export interface CompilerResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  executionTime: number;
  errorType?: 'validation' | 'timeout' | 'output-limit' | 'sandbox-unavailable' | 'compile-error' | 'runtime-error' | 'resource-limit' | 'cancelled' | 'unexpected';
  outputTruncated?: boolean;
}
export interface RunResult extends CompilerResult { timedOut?: boolean; }

const sandboxImage = process.env.SANDBOX_IMAGE || 'cforge-sandbox:part5';
const maxCodeSize = parsePositiveInt(process.env.MAX_CODE_SIZE, 262_144);
const maxInputSize = parsePositiveInt(process.env.MAX_INPUT_SIZE, 65_536);
const maxOutputSize = parsePositiveInt(process.env.MAX_OUTPUT_SIZE, 1_048_576);
const timeoutMs = parsePositiveInt(process.env.TIMEOUT_SECONDS, 10) * 1_000;
const compileTimeoutMs = parsePositiveInt(process.env.COMPILE_TIMEOUT_SECONDS, 10) * 1_000;
const memoryLimit = process.env.SANDBOX_MEMORY || '256m';
const cpuLimit = process.env.SANDBOX_CPUS || '1.0';
const pidsLimit = parsePositiveInt(process.env.SANDBOX_PIDS_LIMIT, 64);
const maxConcurrentJobs = parsePositiveInt(process.env.MAX_CONCURRENT_JOBS, 4);
const tmpfsSize = process.env.SANDBOX_TMPFS_SIZE || '32m';
const dockerBinary = process.env.DOCKER_BINARY || 'docker';

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function validateSource(code: unknown): string | null {
  if (typeof code !== 'string') return 'code must be a string.';
  if (code.length === 0) return 'code must not be empty.';
  if (Buffer.byteLength(code, 'utf8') > maxCodeSize) return `code exceeds the maximum size of ${maxCodeSize} bytes.`;
  return null;
}

export function validateInput(input: unknown): string | null {
  if (input === undefined) return null;
  if (typeof input !== 'string') return 'input must be a string.';
  if (Buffer.byteLength(input, 'utf8') > maxInputSize) return `input exceeds the maximum size of ${maxInputSize} bytes.`;
  return null;
}

async function dockerAvailable(): Promise<boolean> {
  try {
    await execFileAsync(dockerBinary, ['version', '--format', '{{.Server.Version}}'], { timeout: 3_000, windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

function appendLimited(current: string, chunk: Buffer | string): { value: string; truncated: boolean } {
  const bytes = Buffer.from(chunk.toString(), 'utf8');
  const currentBytes = Buffer.byteLength(current, 'utf8');
  const remaining = maxOutputSize - currentBytes;
  if (remaining <= 0) return { value: current, truncated: true };
  if (bytes.length <= remaining) return { value: current + bytes.toString('utf8'), truncated: false };
  return { value: current + bytes.subarray(0, remaining).toString('utf8'), truncated: true };
}

interface TarEntry { name: string; data: Buffer; }

function createTar(entries: TarEntry[]): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const header = Buffer.alloc(512, 0);
    header.write(entry.name, 0, 100, 'utf8');
    header.write('0000644\0', 100, 8, 'ascii');
    header.write('0000000\0', 108, 8, 'ascii');
    header.write('0000000\0', 116, 8, 'ascii');
    header.write(entry.data.length.toString(8).padStart(11, '0') + '\0', 124, 12, 'ascii');
    header.write(Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0', 136, 12, 'ascii');
    header.fill(0x20, 148, 156);
    header.write('0', 156, 1, 'ascii');
    header.write('ustar\0', 257, 6, 'ascii');
    header.write('00', 263, 2, 'ascii');
    header.write('cforge', 265, 32, 'ascii');
    header.write('cforge', 297, 32, 'ascii');
    const checksum = [...header].reduce((sum, byte) => sum + byte, 0);
    header.write(checksum.toString(8).padStart(6, '0') + '\0', 148, 8, 'ascii');
    blocks.push(header, entry.data);
    const padding = (512 - (entry.data.length % 512)) % 512;
    if (padding) blocks.push(Buffer.alloc(padding));
  }
  blocks.push(Buffer.alloc(1024));
  return Buffer.concat(blocks);
}

function dockerArgs(name: string, command: string[]): string[] {
  return [
    'run', '--rm', '--init', '--name', name,
    '--network=none',
    '--ipc=private',
    '--read-only',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges:true',
    '--security-opt=seccomp=default',
    '--user', '10001:10001',
    '--pids-limit', String(pidsLimit),
    '--memory', memoryLimit,
    '--memory-swap', memoryLimit,
    '--cpus', cpuLimit,
    '--ulimit', 'nofile=64:64',
    '--ulimit', 'fsize=1048576:1048576',
    '--tmpfs', `/tmp:rw,nosuid,nodev,noexec,size=${tmpfsSize}`,
    '--tmpfs', `/workspace:rw,nosuid,nodev,size=${tmpfsSize}`,
    sandboxImage,
    ...command,
  ];
}

function killContainer(name: string): void {
  const killer = spawn(dockerBinary, ['kill', name], { windowsHide: true, stdio: 'ignore' });
  killer.on('error', () => undefined);
}

function removeContainer(name: string): void {
  const remover = spawn(dockerBinary, ['rm', '-f', name], { windowsHide: true, stdio: 'ignore' });
  remover.on('error', () => undefined);
}

interface DockerResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  executionTime: number;
  timedOut: boolean;
  outputTruncated: boolean;
  outputLimitExceeded: boolean;
  cancelled: boolean;
}

function runDocker(command: string[], archive: Buffer, timeout: number, signal?: AbortSignal): Promise<DockerResult> {
  return new Promise((resolve) => {
    const name = `cforge-${randomUUID()}`;
    const started = process.hrtime.bigint();
    const child = spawn(dockerBinary, dockerArgs(name, command), {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;
    let outputTruncated = false;
    let outputLimitExceeded = false;
    let cancelled = false;

    const finish = (result: DockerResult) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', cancel);
      resolve(result);
    };

    const cancel = () => {
      if (settled) return;
      cancelled = true;
      killContainer(name);
    };
    signal?.addEventListener('abort', cancel, { once: true });

    const timer = setTimeout(() => {
      timedOut = true;
      killContainer(name);
      const killTimer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch { /* already exited */ }
      }, 1_000);
      // Do not keep the Node.js process alive solely for emergency cleanup.
      if (typeof killTimer === 'object' && killTimer !== null && 'unref' in killTimer) {
        (killTimer as NodeJS.Timeout).unref();
      }
    }, timeout);

    child.stdout?.on('data', (chunk) => {
      const result = appendLimited(stdout, chunk);
      stdout = result.value;
      outputTruncated ||= result.truncated;
      if (result.truncated && !outputLimitExceeded) {
        outputLimitExceeded = true;
        killContainer(name);
      }
    });

    child.stderr?.on('data', (chunk) => {
      const result = appendLimited(stderr, chunk);
      stderr = result.value;
      outputTruncated ||= result.truncated;
      if (result.truncated && !outputLimitExceeded) {
        outputLimitExceeded = true;
        killContainer(name);
      }
    });

    child.on('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      const executionTime = Number(process.hrtime.bigint() - started) / 1e9;
      removeContainer(name);
      finish({ stdout, stderr: error.code === 'ENOENT' ? 'Docker is not available on the server.' : 'Sandbox process could not be started.', exitCode: null, executionTime, timedOut: false, outputTruncated, outputLimitExceeded, cancelled });
    });

    child.on('close', (exitCode) => {
      clearTimeout(timer);
      const executionTime = Number(process.hrtime.bigint() - started) / 1e9;
      removeContainer(name);
      finish({ stdout, stderr, exitCode, executionTime, timedOut, outputTruncated, outputLimitExceeded, cancelled });
    });

    child.stdin?.on('error', () => undefined);
    child.stdin?.end(archive);
  });
}

const compileScript = [
  'set -eu',
  'tar -xf - -C /workspace',
  'gcc /workspace/main.c -std=c11 -O0 -Wall -Wextra -o /workspace/main',
].join(' && ');

const runScript = [compileScript, 'exec /workspace/main < /workspace/input'].join(' && ');

let activeJobs = 0;

async function acquireJobSlot(): Promise<void> {
  if (activeJobs >= maxConcurrentJobs) {
    const error = new Error('Compiler is busy. Please try again shortly.');
    error.name = 'CapacityError';
    throw error;
  }
  activeJobs += 1;
}

function releaseJobSlot(): void {
  activeJobs = Math.max(0, activeJobs - 1);
}

async function ensureDocker(): Promise<void> {
  if (!(await dockerAvailable())) {
    const error = new Error('Docker sandbox is unavailable.');
    error.name = 'SandboxUnavailableError';
    throw error;
  }
}

export async function compileC(code: string, signal?: AbortSignal): Promise<CompilerResult> {
  try {
    await acquireJobSlot();
    try {
      await ensureDocker();
      const archive = createTar([{ name: 'main.c', data: Buffer.from(code, 'utf8') }]);
      const result = await runDocker(['sh', '-c', compileScript], archive, compileTimeoutMs, signal);
      if (result.cancelled) return { success: false, stdout: result.stdout, stderr: 'Compilation cancelled.', exitCode: result.exitCode, executionTime: result.executionTime, errorType: 'cancelled', outputTruncated: result.outputTruncated };
      if (result.timedOut) return { success: false, stdout: result.stdout, stderr: result.stderr || 'Compilation timed out.', exitCode: result.exitCode, executionTime: result.executionTime, errorType: 'timeout', outputTruncated: result.outputTruncated };
      if (result.outputLimitExceeded) return { success: false, stdout: result.stdout, stderr: result.stderr || 'Compiler output limit exceeded.', exitCode: result.exitCode, executionTime: result.executionTime, errorType: 'output-limit', outputTruncated: true };
      return { success: result.exitCode === 0, stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode, executionTime: result.executionTime, errorType: result.exitCode === 0 ? undefined : 'compile-error', outputTruncated: result.outputTruncated };
    } finally {
      releaseJobSlot();
    }
  } catch (error: any) {
    return { success: false, stdout: '', stderr: error?.name === 'SandboxUnavailableError' ? 'Docker sandbox is unavailable on the server.' : error?.name === 'CapacityError' ? 'Compiler is busy. Please try again shortly.' : 'An unexpected sandbox error occurred.', exitCode: null, executionTime: 0, errorType: error?.name === 'SandboxUnavailableError' ? 'sandbox-unavailable' : error?.name === 'CapacityError' ? 'resource-limit' : 'unexpected' };
  }
}

export async function runC(code: string, input = '', signal?: AbortSignal): Promise<RunResult> {
  try {
    await acquireJobSlot();
    try {
      await ensureDocker();
      const archive = createTar([
        { name: 'main.c', data: Buffer.from(code, 'utf8') },
        { name: 'input', data: Buffer.from(input, 'utf8') },
      ]);
      const result = await runDocker(['sh', '-c', runScript], archive, timeoutMs, signal);
      if (result.cancelled) return { success: false, stdout: result.stdout, stderr: 'Program execution cancelled.', exitCode: result.exitCode, executionTime: result.executionTime, errorType: 'cancelled', timedOut: false, outputTruncated: result.outputTruncated };
      if (result.timedOut) {
        if (result.outputLimitExceeded) return { success: false, stdout: result.stdout, stderr: result.stderr || 'Output limit exceeded.', exitCode: result.exitCode, executionTime: result.executionTime, errorType: 'output-limit', timedOut: false, outputTruncated: true };
        return { success: false, stdout: result.stdout, stderr: result.stderr || 'Program execution timed out.', exitCode: result.exitCode, executionTime: result.executionTime, errorType: 'timeout', timedOut: true, outputTruncated: result.outputTruncated };
      }
      if (result.outputLimitExceeded) return { success: false, stdout: result.stdout, stderr: result.stderr || 'Output limit exceeded.', exitCode: result.exitCode, executionTime: result.executionTime, errorType: 'output-limit', outputTruncated: true };
      return { success: result.exitCode === 0, stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode, executionTime: result.executionTime, errorType: result.exitCode === 0 ? undefined : 'runtime-error', outputTruncated: result.outputTruncated };
    } finally {
      releaseJobSlot();
    }
  } catch (error: any) {
    return { success: false, stdout: '', stderr: error?.name === 'SandboxUnavailableError' ? 'Docker sandbox is unavailable on the server.' : error?.name === 'CapacityError' ? 'Compiler is busy. Please try again shortly.' : 'An unexpected sandbox error occurred.', exitCode: null, executionTime: 0, errorType: error?.name === 'SandboxUnavailableError' ? 'sandbox-unavailable' : error?.name === 'CapacityError' ? 'resource-limit' : 'unexpected' };
  }
}

export function getCompilerConfig() {
  return { sandboxImage, maxCodeSize, maxInputSize, maxOutputSize, timeoutMs, compileTimeoutMs, memoryLimit, cpuLimit, pidsLimit, maxConcurrentJobs, tmpfsSize, dockerBinary };
}
