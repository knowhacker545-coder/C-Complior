import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

type MonacoEnvironment = {
  getWorker: (_moduleId: string, _label: string) => Worker;
};

const globalScope = globalThis as typeof globalThis & {
  MonacoEnvironment?: MonacoEnvironment;
};

globalScope.MonacoEnvironment ??= {
  getWorker: () => new EditorWorker(),
};

/**
 * Local replacement for @monaco-editor/loader's CDN-based runtime loader.
 * Monaco is imported from the installed ESM package and is bundled by Vite.
 */
export const loader = {
  config: () => undefined,
  init: () => Promise.resolve(monaco),
};
