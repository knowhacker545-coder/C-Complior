import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { getCompilerConfig, runC, validateInput, validateSource } from './compiler.js';

const execFileAsync = promisify(execFile);

async function hasDocker(): Promise<boolean> {
  try {
    await execFileAsync(process.env.DOCKER_BINARY || 'docker', ['version', '--format', '{{.Server.Version}}'], { timeout: 2_000 });
    return true;
  } catch {
    return false;
  }
}

const dockerReady = await hasDocker();
const sandboxTest = dockerReady ? test : test.skip;

sandboxTest('Hello World runs in Docker sandbox', async () => {
  const result = await runC('#include <stdio.h>\nint main(void) { printf("Hello, CForge!\\n"); return 0; }');
  assert.equal(result.success, true);
  assert.equal(result.stdout, 'Hello, CForge!\n');
  assert.equal(result.exitCode, 0);
});

sandboxTest('stdin and stdout run in Docker sandbox', async () => {
  const code = '#include <stdio.h>\nint main(void) { int a, b; scanf("%d %d", &a, &b); printf("%d\\n", a + b); return 0; }';
  const result = await runC(code, '10 20\n');
  assert.equal(result.success, true);
  assert.equal(result.stdout, '30\n');
});

sandboxTest('infinite loop is terminated by timeout', async () => {
  const result = await runC('int main(void) { while (1) {} }');
  assert.equal(result.errorType, 'timeout');
  assert.equal(result.timedOut, true);
});

sandboxTest('large output is bounded', async () => {
  const result = await runC('#include <stdio.h>\nint main(void) { for (;;) puts("012345678901234567890123456789"); }');
  assert.equal(result.outputTruncated, true);
  assert.ok(Buffer.byteLength(result.stdout, 'utf8') <= getCompilerConfig().maxOutputSize);
});

sandboxTest('memory abuse is constrained by the container', async () => {
  const result = await runC('#include <stdlib.h>\n#include <string.h>\nint main(void) { size_t n = 1024UL * 1024UL * 1024UL; void *p = malloc(n); if (!p) return 2; memset(p, 1, n); return 0; }');
  assert.notEqual(result.success, true);
});

sandboxTest('process abuse is constrained by the container', async () => {
  const result = await runC('#include <unistd.h>\nint main(void) { for (;;) { pid_t p = fork(); if (p < 0) return 3; if (p == 0) continue; } }');
  assert.notEqual(result.success, true);
});

sandboxTest('filesystem access is limited to the ephemeral workspace', async () => {
  const result = await runC('#include <stdio.h>\nint main(void) { FILE *f = fopen("/mnt/data/host-secret.txt", "r"); if (f) { fclose(f); return 1; } return 0; }');
  assert.equal(result.success, true);
});

sandboxTest('network access is disabled', async () => {
  const result = await runC('#include <sys/socket.h>\n#include <netinet/in.h>\n#include <arpa/inet.h>\n#include <unistd.h>\nint main(void) { int s = socket(AF_INET, SOCK_STREAM, 0); if (s < 0) return 0; struct sockaddr_in a = {0}; a.sin_family = AF_INET; a.sin_port = htons(80); inet_pton(AF_INET, "1.1.1.1", &a.sin_addr); int r = connect(s, (struct sockaddr*)&a, sizeof(a)); close(s); return r == 0 ? 1 : 0; }');
  assert.equal(result.success, true);
});


test('sandbox policy contains required isolation controls', () => {
  const config = getCompilerConfig();
  assert.ok(config.memoryLimit);
  assert.ok(config.cpuLimit);
  assert.ok(config.pidsLimit > 0);
  assert.ok(config.maxConcurrentJobs > 0);
  assert.ok(config.maxOutputSize > 0);
});

test('request validation helpers', () => {
  assert.match(validateSource('') ?? '', /must not be empty/i);
  assert.match(validateSource(123) ?? '', /must be a string/i);
  assert.equal(validateInput(undefined), null);
  assert.match(validateInput(123) ?? '', /must be a string/i);
  assert.equal(getCompilerConfig().memoryLimit, process.env.SANDBOX_MEMORY || '256m');
  assert.equal(getCompilerConfig().cpuLimit, process.env.SANDBOX_CPUS || '1.0');
  assert.equal(getCompilerConfig().pidsLimit, Number(process.env.SANDBOX_PIDS_LIMIT || 64));
});
