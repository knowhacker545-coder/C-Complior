import cors from 'cors';
import express, { type Request, type Response, type NextFunction } from 'express';
import { compileC, getCompilerConfig, runC, validateInput, validateSource } from './compiler/compiler.js';

const RATE_WINDOW_MS = parsePositiveInt(process.env.RATE_LIMIT_WINDOW_SECONDS, 60) * 1_000;
const RATE_MAX = parsePositiveInt(process.env.RATE_LIMIT_MAX_REQUESTS, 30);
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
let healthCache: { at: number; compilerAvailable: boolean } | null = null;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function clientIp(req: Request): string {
  // Do not trust spoofable X-Forwarded-For unless Express trust-proxy is explicitly configured.
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function rateLimit(req: Request, res: Response, next: NextFunction) {
  const now = Date.now();
  if (rateBuckets.size > 10_000) {
    for (const [key, bucket] of rateBuckets) if (bucket.resetAt <= now) rateBuckets.delete(key);
  }

  const key = clientIp(req);
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    next();
    return;
  }

  if (bucket.count >= RATE_MAX) {
    res.status(429).json({
      success: false,
      stdout: '',
      stderr: 'Rate limit exceeded. Please try again later.',
      exitCode: null,
      executionTime: 0,
      errorType: 'validation',
    });
    return;
  }

  bucket.count += 1;
  next();
}

function requireJson(req: Request, res: Response, next: NextFunction) {
  if (!req.is('application/json')) {
    res.status(415).json({
      success: false,
      stdout: '',
      stderr: 'Content-Type must be application/json.',
      exitCode: null,
      executionTime: 0,
      errorType: 'validation',
    });
    return;
  }
  next();
}

function invalidRequest(res: Response, message: string) {
  res.status(400).json({ success: false, stdout: '', stderr: message, exitCode: null, executionTime: 0, errorType: 'validation' });
}

export function createApp() {
  const app = express();
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', true);

  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });
  app.use(cors({ origin: frontendUrl, methods: ['GET', 'POST'], allowedHeaders: ['Content-Type'] }));
  app.use(express.json({ limit: process.env.MAX_REQUEST_BODY_SIZE || '384kb', strict: true }));

  app.get('/api/health', async (_req, res) => {
    const now = Date.now();
    if (!healthCache || now - healthCache.at > 5_000) {
      const config = getCompilerConfig();
      try {
        const { execFile } = await import('node:child_process');
        const { promisify } = await import('node:util');
        await promisify(execFile)(config.dockerBinary, ['version', '--format', '{{.Server.Version}}'], { timeout: 2_000, windowsHide: true });
        healthCache = { at: now, compilerAvailable: true };
      } catch {
        healthCache = { at: now, compilerAvailable: false };
      }
    }
    res.status(healthCache.compilerAvailable ? 200 : 503).json({
      status: healthCache.compilerAvailable ? 'ok' : 'degraded',
      compilerAvailable: healthCache.compilerAvailable,
    });
  });

  const compileOrRunRateLimit = rateLimit;

  app.post('/api/compile', requireJson, compileOrRunRateLimit, async (req: Request, res: Response) => {
    try {
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        invalidRequest(res, 'Request body must be a JSON object.');
        return;
      }
      const sourceError = validateSource(req.body.code);
      if (sourceError) {
        invalidRequest(res, sourceError);
        return;
      }

      const controller = new AbortController();
      const onAborted = () => controller.abort();
      req.once('aborted', onAborted);
      try {
        const result = await compileC(req.body.code, controller.signal);
        if (!res.headersSent && !req.destroyed) {
          const status = result.errorType === 'sandbox-unavailable' ? 503 : result.errorType === 'resource-limit' ? 503 : 200;
          res.status(status).json(result);
        }
      } finally {
        req.off('aborted', onAborted);
      }
    } catch {
      res.status(500).json({ success: false, stdout: '', stderr: 'Unexpected server error.', exitCode: null, executionTime: 0, errorType: 'unexpected' });
    }
  });

  app.post('/api/run', requireJson, compileOrRunRateLimit, async (req: Request, res: Response) => {
    try {
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        invalidRequest(res, 'Request body must be a JSON object.');
        return;
      }
      const sourceError = validateSource(req.body.code);
      if (sourceError) {
        invalidRequest(res, sourceError);
        return;
      }

      const inputError = validateInput(req.body.input);
      if (inputError) {
        invalidRequest(res, inputError);
        return;
      }

      const controller = new AbortController();
      const onAborted = () => controller.abort();
      req.once('aborted', onAborted);
      try {
        const result = await runC(req.body.code, req.body.input ?? '', controller.signal);
        if (!res.headersSent && !req.destroyed) {
          const status = result.errorType === 'sandbox-unavailable' ? 503 : result.errorType === 'resource-limit' ? 503 : 200;
          res.status(status).json(result);
        }
      } finally {
        req.off('aborted', onAborted);
      }
    } catch {
      res.status(500).json({ success: false, stdout: '', stderr: 'Unexpected server error.', exitCode: null, executionTime: 0, errorType: 'unexpected' });
    }
  });

  app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
    if (error?.type === 'entity.too.large' || error?.status === 413) {
      res.status(413).json({ success: false, stdout: '', stderr: 'Request body is too large.', exitCode: null, executionTime: 0, errorType: 'validation' });
      return;
    }

    if (error instanceof SyntaxError && (error as SyntaxError & { status?: number }).status === 400) {
      res.status(400).json({ success: false, stdout: '', stderr: 'Invalid JSON request.', exitCode: null, executionTime: 0, errorType: 'validation' });
      return;
    }

    res.status(500).json({ success: false, stdout: '', stderr: 'Unexpected server error.', exitCode: null, executionTime: 0, errorType: 'unexpected' });
  });

  if (process.env.NODE_ENV !== 'test') {
    const config = getCompilerConfig();
    console.log(`CForge sandbox: ${config.sandboxImage}; memory: ${config.memoryLimit}; CPUs: ${config.cpuLimit}; PIDs: ${config.pidsLimit}; run timeout: ${config.timeoutMs} ms`);
  }

  return app;
}
