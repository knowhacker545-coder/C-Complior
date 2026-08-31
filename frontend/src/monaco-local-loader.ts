import * as monaco from 'monaco-editor';
import EditorWorker from './monaco-editor-worker?worker';

type LoaderConfig = {
  paths?: { vs?: string };
  'vs/nls'?: { availableLanguages?: Record<string, string> };
  monaco?: typeof monaco;
};

type MonacoEnvironment = {
  getWorker: (_moduleId: string, _label: string) => Worker;
};

const globalScope = globalThis as typeof globalThis & {
  MonacoEnvironment?: MonacoEnvironment;
};

let configuredMonaco: typeof monaco = monaco;

const localLoader = {
  config(options: LoaderConfig = {}) {
    if (options.monaco) {
      configuredMonaco = options.monaco;
    }
  },

  init() {
    return Promise.resolve(configuredMonaco);
  },

  __getMonacoInstance() {
    return configuredMonaco;
  },
};

globalScope.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

export { localLoader as loader };
export default localLoader;
