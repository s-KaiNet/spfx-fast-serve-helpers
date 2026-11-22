export type LintMode = 'skip-type-aware' | 'full';

export interface WorkerRoot {
  readonly root: string;
  readonly sourceDir: string;
  readonly eslintPath: string;
  readonly cacheLocation: string;
}

export interface LintMessage {
  readonly line: number;
  readonly column: number;
  readonly severity: 'error' | 'warning';
  readonly ruleId: string | undefined;
  readonly message: string;
}

export type FileLintResult =
  | { readonly file: string; readonly status: 'linted'; readonly messages: readonly LintMessage[] }
  | { readonly file: string; readonly status: 'ignored' | 'unparsable' };

export type WorkerRequest =
  | { readonly type: 'setup'; readonly mode: LintMode; readonly roots: readonly WorkerRoot[] }
  | { readonly type: 'warm' }
  | { readonly type: 'lint'; readonly id: number; readonly root: string; readonly files: readonly string[] };

export type WorkerResponse =
  | { readonly type: 'warmed'; readonly root: string; readonly durationMs: number }
  | { readonly type: 'linted'; readonly id: number; readonly results: readonly FileLintResult[]; readonly durationMs: number }
  | { readonly type: 'problem'; readonly root: string; readonly message: string; readonly fatal: boolean };
