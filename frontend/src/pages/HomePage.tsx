import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import Editor, { type BeforeMount, type OnMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { Braces, Check, Code2, Download, FileCode2, Play, Save, Settings2, Square, Trash2, Upload, WandSparkles } from 'lucide-react';
import { createWasmCompiler } from '../compiler/service';
import type { CompilerDiagnostic, CompilerResult, CompilerService } from '../compiler/types';

const STARTER_CODE = `#include <stdio.h>\n\nint main() {\n    printf("Hello, CForge!\\n");\n    return 0;\n}`;
const DRAFT_KEY = 'cforge-code-draft';
const SETTINGS_KEY = 'cforge-editor-settings';
const RUN_TIMEOUT_MS = 10000;

type OutputState = 'ready' | 'compiling' | 'running' | 'success' | 'compile-error' | 'runtime-error' | 'timeout' | 'server-error';
interface EditorSettings { fontSize: number; tabSize: number; wordWrap: 'on' | 'off'; minimap: boolean; autoSave: boolean; }
const defaultSettings: EditorSettings = { fontSize: 14, tabSize: 4, wordWrap: 'on', minimap: false, autoSave: true };

function statusLabel(state: OutputState) {
  return { ready: 'Ready.', compiling: 'Compiling…', running: 'Running…', success: 'Success', 'compile-error': 'Compile Error', 'runtime-error': 'Runtime Error', timeout: 'Timeout', 'server-error': 'Compiler Error' }[state];
}

function diagnosticsToMarkers(monaco: typeof Monaco, diagnostics: CompilerDiagnostic[]): Monaco.editor.IMarkerData[] {
  return diagnostics.map((diagnostic) => ({
    severity: monaco.MarkerSeverity.Error,
    startLineNumber: diagnostic.line,
    endLineNumber: diagnostic.line,
    startColumn: diagnostic.column,
    endColumn: diagnostic.column + 1,
    message: diagnostic.message,
  }));
}

export default function HomePage() {
  const [code, setCode] = useState(() => localStorage.getItem(DRAFT_KEY) ?? STARTER_CODE);
  useEffect(() => {
    const resourceCode = localStorage.getItem('cforge-resource-code');
    if (resourceCode !== null) { setCode(resourceCode); localStorage.setItem(DRAFT_KEY, resourceCode); localStorage.removeItem('cforge-resource-code'); }
  }, []);
  const [settings, setSettings] = useState<EditorSettings>(() => { try { return { ...defaultSettings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch { return defaultSettings; } });
  const [outputState, setOutputState] = useState<OutputState>('ready');
  const [mobilePanel, setMobilePanel] = useState<'editor' | 'output'>('editor');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [stdout, setStdout] = useState('');
  const [stderr, setStderr] = useState('');
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [executionTime, setExecutionTime] = useState<number | null>(null);
  const [health, setHealth] = useState<'checking' | 'online' | 'offline'>('checking');
  const [busy, setBusy] = useState(false);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const compilerRef = useRef<CompilerService | null>(null);
  const timeoutRef = useRef<number | undefined>(undefined);
  const saveTimer = useRef<number | undefined>(undefined);

  if (!compilerRef.current) compilerRef.current = createWasmCompiler();
  const compiler = compilerRef.current;

  const clearMarkers = useCallback(() => {
    const monaco = monacoRef.current;
    const editor = editorRef.current;
    if (!monaco || !editor) return;
    const model = editor.getModel();
    if (!model) return;
    monaco.editor.setModelMarkers(model, 'cforge', []);
  }, []);

  const applyCompilerMarkers = useCallback((diagnostics: CompilerDiagnostic[]) => {
    const monaco = monacoRef.current;
    const editor = editorRef.current;
    if (!monaco || !editor) return;
    const model = editor.getModel();
    if (!model) return;
    monaco.editor.setModelMarkers(model, 'cforge', diagnosticsToMarkers(monaco, diagnostics));
  }, []);

  const resetResult = useCallback(() => { setStdout(''); setStderr(''); setExitCode(null); setExecutionTime(null); }, []);

  useEffect(() => localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)), [settings]);
  useEffect(() => {
    const sync = () => { try { setSettings({ ...defaultSettings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }); } catch { setSettings(defaultSettings); } };
    window.addEventListener('cforge-settings-changed', sync);
    return () => window.removeEventListener('cforge-settings-changed', sync);
  }, []);
  useEffect(() => {
    const onReset = () => setSettings(defaultSettings);
    const onClear = () => { resetResult(); clearMarkers(); setOutputState('ready'); };
    window.addEventListener('cforge-reset-settings', onReset);
    window.addEventListener('cforge-clear-output', onClear);
    return () => { window.removeEventListener('cforge-reset-settings', onReset); window.removeEventListener('cforge-clear-output', onClear); };
  }, [clearMarkers, resetResult]);
  useEffect(() => {
    if (!settings.autoSave) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => localStorage.setItem(DRAFT_KEY, code), 300);
    return () => window.clearTimeout(saveTimer.current);
  }, [code, settings.autoSave]);
  useEffect(() => {
    let active = true;
    setHealth('checking');
    compiler.ready().then(() => { if (active) setHealth('online'); }).catch(() => { if (active) setHealth('offline'); });
    return () => { active = false; compiler.dispose(); };
  }, [compiler]);

  const request = useCallback(async (mode: 'run' | 'compile') => {
    resetResult();
    clearMarkers();
    setOutputState('compiling');
    setBusy(true);
    setMobilePanel('output');
    window.clearTimeout(timeoutRef.current);
    let timedOut = false;
    timeoutRef.current = window.setTimeout(() => {
      timedOut = true;
      compiler.cancel();
      setBusy(false);
      setOutputState('timeout');
      setStderr('Execution timed out after 10 seconds.');
    }, RUN_TIMEOUT_MS);
    try {
      if (mode === 'run') setOutputState('running');
      const result: CompilerResult = mode === 'run' ? await compiler.run(code, input) : await compiler.compile(code);
      if (timedOut) return;
      setStdout(result.stdout || '');
      setStderr(result.stderr || '');
      setExitCode(result.exitCode ?? null);
      setExecutionTime(typeof result.executionTime === 'number' ? result.executionTime : null);
      if (result.diagnostics?.length) applyCompilerMarkers(result.diagnostics);
      if (result.errorType === 'timeout') setOutputState('timeout');
      else if (result.errorType === 'compile-error') setOutputState('compile-error');
      else if (result.errorType === 'output-limit') setOutputState('runtime-error');
      else if (result.errorType === 'initialization' || result.errorType === 'unsupported') setOutputState('server-error');
      else if (!result.success) setOutputState('runtime-error');
      else setOutputState('success');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        if (!timedOut) setOutputState('ready');
        return;
      }
      setOutputState('server-error');
      const message = error instanceof Error ? error.message : String(error);
      setStderr(`The local WebAssembly compiler could not be initialized: ${message}`);
    } finally {
      window.clearTimeout(timeoutRef.current);
      if (!timedOut) setBusy(false);
    }
  }, [applyCompilerMarkers, clearMarkers, code, compiler, input, resetResult]);

  const runCode = useCallback(() => request('run'), [request]);
  const compileCode = useCallback(() => request('compile'), [request]);
  const stopCode = useCallback(() => { window.clearTimeout(timeoutRef.current); compiler.cancel(); setBusy(false); setOutputState('ready'); }, [compiler]);

  const downloadCode = useCallback(() => { const blob = new Blob([code], { type: 'text/x-c' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'main.c'; anchor.click(); URL.revokeObjectURL(url); }, [code]);
  const clearCode = () => { setCode(''); clearMarkers(); resetResult(); setOutputState('ready'); };
  const formatCode = () => editorRef.current?.getAction('editor.action.formatDocument')?.run();
  const uploadCode = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file || !file.name.toLowerCase().endsWith('.c')) { event.target.value = ''; return; } const reader = new FileReader(); reader.onload = () => { setCode(String(reader.result ?? '')); clearMarkers(); }; reader.readAsText(file); event.target.value = ''; };

  const beforeMount: BeforeMount = (monaco) => {
    monaco.languages.register({ id: 'cforge-c' });
    monaco.languages.setMonarchTokensProvider('cforge-c', { keywords: ['auto','break','case','char','const','continue','default','do','double','else','enum','extern','float','for','goto','if','inline','int','long','register','restrict','return','short','signed','sizeof','static','struct','switch','typedef','union','unsigned','void','volatile','while'], tokenizer: { root: [[/#include|#define|#if|#ifdef|#ifndef|#else|#endif/, 'keyword.directive'], [/[a-zA-Z_][\w]*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }], [/\d+(\.\d+)?([eE][+-]?\d+)?[fFlL]?/, 'number'], [/("([^"\\]|\\.)*")/, 'string'], [/\/\/.*$/, 'comment'], [/\/\*/, 'comment', '@comment'], [/[{}()[\]]/, '@brackets'], [/[/;,.]/, 'delimiter'], [/[+\-*\/%=<>!|&^~?:]+/, 'operator']], comment: [[/[^/*]+/, 'comment'], [/\*\//, 'comment', '@pop'], [/./, 'comment']] } });
    monaco.languages.setLanguageConfiguration('cforge-c', { comments: { lineComment: '//', blockComment: ['/*', '*/'] }, brackets: [['{','}'],['[',']'],['(',')']], autoClosingPairs: [{open:'{',close:'}'},{open:'[',close:']'},{open:'(',close:')'},{open:'"',close:'"'}] });
  };

  const onMount: OnMount = (editor, monaco) => { editorRef.current = editor; monacoRef.current = monaco; editor.addAction({ id: 'cforge-run', label: 'Run CForge', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter], run: runCode }); editor.addAction({ id: 'cforge-download', label: 'Download C file', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS], run: downloadCode }); editor.addAction({ id: 'cforge-search', label: 'Search', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF], run: (ed) => ed.getAction('actions.find')?.run() }); editor.focus(); };

  return <section className="compiler-page">
    <header className="compiler-header">
      <div className="compiler-title"><div className="brand-mark"><Code2 size={18}/></div><div><strong>CForge</strong><span>C compiler workspace</span></div></div>
      <div className="editor-actions" role="toolbar" aria-label="Compiler actions">
        <button className="tool-button primary" onClick={runCode} disabled={busy} title="Run (Ctrl+Enter)"><Play size={15}/> <span>Run</span></button>
        <button className="tool-button" onClick={compileCode} disabled={busy}><Braces size={15}/> <span>Compile</span></button>
        <button className="tool-button danger" onClick={stopCode} disabled={!busy}><Square size={13}/> <span>Stop</span></button>
        <span className="toolbar-divider"/><button className="tool-button" onClick={formatCode}><WandSparkles size={15}/> <span>Format</span></button><button className="tool-button" onClick={downloadCode}><Download size={15}/> <span>Download</span></button><button className="tool-button" onClick={() => fileInputRef.current?.click()}><Upload size={15}/> <span>Upload</span></button><button className="tool-button" onClick={clearCode}><Trash2 size={15}/> <span>Clear</span></button>
        <input ref={fileInputRef} type="file" accept=".c,text/x-c" hidden onChange={uploadCode}/><button className="tool-icon" onClick={() => setSettingsOpen(true)} aria-label="Editor settings"><Settings2 size={17}/></button>
      </div>
    </header>
    <div className="mobile-editor-tabs"><button className={mobilePanel==='editor'?'active':''} onClick={()=>setMobilePanel('editor')}><FileCode2 size={15}/> Code</button><button className={mobilePanel==='output'?'active':''} onClick={()=>setMobilePanel('output')}><span>▣</span> Output</button></div>
    <div className="compiler-workspace">
      <section className={`editor-panel ${mobilePanel==='editor'?'mobile-active':''}`} aria-label="C code editor"><div className="panel-topbar"><span><span className="dot"/> main.c</span><span className={`health-pill ${health}`}>{health==='online'?<Check size={12}/>:null}{health==='checking'?'Compiler loading…':health==='online'?'Compiler ready':'Compiler unavailable'}</span></div><div className="monaco-wrap"><Editor height="100%" language="cforge-c" theme={document.documentElement.dataset.theme==='light'?'vs':'vs-dark'} value={code} onChange={(value)=>setCode(value??'')} beforeMount={beforeMount} onMount={onMount} options={{ fontSize:settings.fontSize, tabSize:settings.tabSize, insertSpaces:true, wordWrap:settings.wordWrap, minimap:{enabled:settings.minimap}, automaticLayout:true, folding:true, bracketPairColorization:{enabled:true}, renderLineHighlight:'all', scrollBeyondLastLine:false, smoothScrolling:false, padding:{top:12,bottom:20}, contextmenu:true, formatOnType:true, formatOnPaste:true, cursorBlinking:'smooth' }}/></div><div className="editor-status"><span>Ln 1, Col 1</span><span>Spaces: {settings.tabSize}</span><span>UTF-8</span><span>C11 / WASM</span><span className="save-state"><Save size={12}/> {settings.autoSave?'Auto-save on':'Auto-save off'}</span></div></section>
      <section className={`output-panel ${mobilePanel==='output'?'mobile-active':''}`} aria-label="Program output"><div className="output-header"><div><strong>Output</strong><span>Terminal</span></div><button className="tool-icon small" aria-label="Clear output" onClick={()=>{resetResult();setOutputState('ready');clearMarkers();}}><Trash2 size={15}/></button></div><div className="terminal"><div className={`terminal-state ${outputState}`}><span className="terminal-dot"/> {statusLabel(outputState)}</div>{stdout && <pre className="terminal-output">{stdout}</pre>}{stderr && <pre className="terminal-error">{stderr}</pre>}{executionTime !== null && <div className="terminal-meta">Exit code: {exitCode ?? '—'} · {executionTime.toFixed(3)}s</div>}{!stdout && !stderr && outputState==='ready' && <div className="terminal-empty">Run or compile your C program to see results here.</div>}</div><div className="input-panel"><div className="input-title"><span>Program Input</span><small>stdin</small></div><textarea value={input} onChange={(e)=>setInput(e.target.value)} placeholder="Enter input for your program…" spellCheck={false}/></div></section>
    </div>
    {settingsOpen && <EditorSettings settings={settings} setSettings={setSettings} onClose={()=>setSettingsOpen(false)} onClearOutput={()=>{resetResult(); clearMarkers(); setOutputState('ready');}}/>}
  </section>;
}

function EditorSettings({ settings, setSettings, onClose, onClearOutput }: { settings: EditorSettings; setSettings: (s: EditorSettings)=>void; onClose:()=>void; onClearOutput:()=>void }) { return <div className="settings-backdrop" role="presentation" onMouseDown={(e)=>e.target===e.currentTarget&&onClose()}><aside className="settings-panel" role="dialog" aria-modal="true"><div className="settings-header"><div><span className="eyebrow">Preferences</span><h2>Editor Settings</h2></div><button className="icon-button" onClick={onClose}>×</button></div><div className="settings-list"><label className="setting-row"><span><strong>Font size</strong><small>Editor text size.</small></span><select value={settings.fontSize} onChange={e=>setSettings({...settings,fontSize:Number(e.target.value)})}>{[12,13,14,15,16,18].map(v=><option key={v}>{v}</option>)}</select></label><label className="setting-row"><span><strong>Tab size</strong><small>Spaces inserted by the editor.</small></span><select value={settings.tabSize} onChange={e=>setSettings({...settings,tabSize:Number(e.target.value)})}>{[2,4,8].map(v=><option key={v}>{v}</option>)}</select></label><Toggle label="Word wrap" checked={settings.wordWrap==='on'} onChange={v=>setSettings({...settings,wordWrap:v?'on':'off'})}/><Toggle label="Minimap" checked={settings.minimap} onChange={v=>setSettings({...settings,minimap:v})}/><Toggle label="Auto-save" checked={settings.autoSave} onChange={v=>setSettings({...settings,autoSave:v})}/><div className="settings-actions"><button type="button" className="settings-secondary" onClick={onClearOutput}>Clear output</button><button type="button" className="settings-danger" onClick={()=>{setSettings(defaultSettings);localStorage.removeItem(SETTINGS_KEY)}}>Reset editor</button></div></div></aside></div>; }
function Toggle({label,checked,onChange}:{label:string;checked:boolean;onChange:(v:boolean)=>void}) { return <label className="setting-row"><span><strong>{label}</strong><small>{label==='Auto-save'?'Restore the local draft after refresh.':'Apply this editor preference.'}</small></span><button className={`toggle${checked?' on':''}`} type="button" aria-pressed={checked} onClick={()=>onChange(!checked)}><span/></button></label>; }
