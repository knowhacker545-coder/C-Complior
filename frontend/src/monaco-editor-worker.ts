// Local Vite worker entry. The relative path deliberately bypasses package
// subpath/export resolution while pointing at the verified Monaco 0.56.0
// worker implementation shipped in this project's node_modules.
import '../node_modules/monaco-editor/esm/vs/editor/editor.worker.js';
