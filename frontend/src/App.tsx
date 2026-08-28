import { useEffect, useMemo, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar';
import HomePage from './pages/HomePage';
import NotFoundPage from './pages/NotFoundPage';
import DocsPage from './pages/DocsPage';
import AboutPage from './pages/AboutPage';
import ResourcesPage from './pages/ResourcesPage';

type Theme = 'dark' | 'light' | 'system';

function resolveTheme(theme: Theme): 'dark' | 'light' {
  if (theme !== 'system') return theme;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('cforge-theme') as Theme) || 'dark');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const resolvedTheme = useMemo(() => resolveTheme(theme), [theme]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    localStorage.setItem('cforge-theme', theme);
  }, [theme, resolvedTheme]);

  useEffect(() => {
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => { document.documentElement.dataset.theme = resolveTheme('system'); };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  return (
    <div className="app-shell">
      <Navbar onSettings={() => setSettingsOpen(true)} />
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/resources" element={<ResourcesPage />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <footer className="site-footer">
        <div className="container footer-inner">
          <span>© 2026 CForge</span>
          <Link to="/">Write. Compile. Learn. Build.</Link>
        </div>
      </footer>
      {settingsOpen && (
        <SettingsPanel theme={theme} setTheme={setTheme} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}

function SettingsPanel({ theme, setTheme, onClose }: { theme: Theme; setTheme: (theme: Theme) => void; onClose: () => void }) {
  const SETTINGS_KEY = 'cforge-editor-settings';
  const defaults = { fontSize: 14, tabSize: 4, wordWrap: 'on', minimap: false, autoSave: true };
  const [editorSettings, setEditorSettings] = useState(() => {
    try { return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch { return defaults; }
  });

  const update = (next: typeof editorSettings) => {
    setEditorSettings(next);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('cforge-settings-changed'));
  };

  const resetSettings = () => {
    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem('cforge-theme');
    window.dispatchEvent(new CustomEvent('cforge-reset-settings'));
    setTheme('dark');
    onClose();
  };

  return (
    <div className="settings-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="settings-header">
          <div><span className="eyebrow">Preferences</span><h2 id="settings-title">Settings</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close settings">×</button>
        </div>
        <div className="settings-list">
          <label className="setting-row"><span><strong>Theme</strong><small>Choose the interface appearance.</small></span><select value={theme} onChange={(event) => setTheme(event.target.value as Theme)}><option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option></select></label>
          <label className="setting-row"><span><strong>Font size</strong><small>Editor text size.</small></span><select value={editorSettings.fontSize} onChange={(event) => update({ ...editorSettings, fontSize: Number(event.target.value) })}>{[12, 13, 14, 15, 16, 18].map((size) => <option key={size} value={size}>{size}px</option>)}</select></label>
          <label className="setting-row"><span><strong>Tab size</strong><small>Spaces inserted by the editor.</small></span><select value={editorSettings.tabSize} onChange={(event) => update({ ...editorSettings, tabSize: Number(event.target.value) })}>{[2, 4, 8].map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
          <Toggle label="Word wrap" description="Wrap long lines in the editor." checked={editorSettings.wordWrap === 'on'} onChange={(value) => update({ ...editorSettings, wordWrap: value ? 'on' : 'off' })} />
          <Toggle label="Minimap" description="Show a compact code overview." checked={editorSettings.minimap} onChange={(value) => update({ ...editorSettings, minimap: value })} />
          <Toggle label="Auto-save" description="Restore the local draft after refresh." checked={editorSettings.autoSave} onChange={(value) => update({ ...editorSettings, autoSave: value })} />
          <div className="settings-actions"><button type="button" className="settings-secondary" onClick={() => window.dispatchEvent(new CustomEvent('cforge-clear-output'))}>Clear output</button><button type="button" className="settings-danger" onClick={resetSettings}>Reset settings</button></div>
        </div>
      </aside>
    </div>
  );
}

function Toggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="setting-row">
      <span><strong>{label}</strong><small>{description}</small></span>
      <button className={`toggle${checked ? ' on' : ''}`} type="button" aria-pressed={checked} onClick={() => onChange(!checked)}>
        <span />
      </button>
    </label>
  );
}
