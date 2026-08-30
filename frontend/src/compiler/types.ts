export type CompilerStatus = 'loading' | 'ready' | 'unavailable';

export interface CompilerDiagnostic {
  line: number;
  column: number;
  message: string;
}

export interface CompilerResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  executionTime: number;
  errorType?: 'compile-error' | 'runtime-error' | 'timeout' | 'output-limit' | 'initialization' | 'unsupported' | 'cancelled';
  diagnostics?: CompilerDiagnostic[];
  outputTruncated?: boolean;
}

export interface CompilerService {
  ready(): Promise<void>;
  compile(code: string): Promise<CompilerResult>;
  run(code: string, stdin: string): Promise<CompilerResult>;
  cancel(): void;
  dispose(): void;
}
