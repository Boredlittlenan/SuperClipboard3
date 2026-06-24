import { useState, useEffect, useCallback, useRef } from 'react';
import type { ClipboardEntry, FilterTab, QueryFilter, Stats } from './types';
import {
  getEntries,
  deleteEntry,
  togglePin,
  getStats,
  clearUnpinned,
  copyToClipboard,
  updateEntry,
  onClipboardChanged,
} from './api/clipboard';
import { getShortcut, getSetting, checkUpdate } from './api/settings';
import { memoCount } from './api/memos';
import { I18nProvider, useI18n } from './i18n';
import CategoryTabs from './components/CategoryTabs';
import ClipboardList from './components/ClipboardList';
import SettingsButton from './components/SettingsButton';
import MemoList from './components/MemoList';
import type { ThemeMode } from './types';
import './App.css';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function AppContent() {
  const { t } = useI18n();
  const [entries, setEntries] = useState<ClipboardEntry[]>([]);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<number | null>(null);
  const [currentShortcut, setCurrentShortcut] = useState('Ctrl+Shift+V');
  const [memoEnabled, setMemoEnabled] = useState(false);
  const [memoCountState, setMemoCountState] = useState<number | null>(null);
  const [memoListCount, setMemoListCount] = useState<number>(0);
  const [memoColor, setMemoColor] = useState<string | null>(null);
  const [rawPreview, setRawPreview] = useState(false);
  const [themeAccent, setThemeAccent] = useState('default');
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  );
  const searchRef = useRef<HTMLInputElement>(null);

  // Fetch current shortcut on mount
  useEffect(() => {
    getShortcut().then(setCurrentShortcut).catch(console.error);
  }, []);

  // Load memo_enabled setting on mount
  useEffect(() => {
    getSetting('memo_enabled').then((v) => setMemoEnabled(v === 'true')).catch(console.error);
  }, []);

  // Load memo_color setting on mount
  useEffect(() => {
    getSetting('memo_color').then((v) => setMemoColor(v || null)).catch(console.error);
  }, []);

  // Load raw_preview setting on mount
  useEffect(() => {
    getSetting('raw_preview').then((v) => setRawPreview(v === 'true')).catch(console.error);
  }, []);

  // Load theme accent setting on mount
  useEffect(() => {
    getSetting('theme_accent')
      .then((v) => setThemeAccent(v === 'sakura' ? 'sakura' : 'default'))
      .catch(console.error);
  }, []);

  useEffect(() => {
    getSetting('theme_mode')
      .then((v) => {
        if (v === 'light' || v === 'dark' || v === 'system') {
          setThemeMode(v);
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const updateSystemTheme = (value: boolean) => {
      setSystemTheme(value ? 'dark' : 'light');
    };

    updateSystemTheme(media.matches);

    const listener = (event: MediaQueryListEvent) => updateSystemTheme(event.matches);
    if (media.addEventListener) {
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }

    media.addListener(listener);
    return () => media.removeListener(listener);
  }, []);

  const resolvedTheme = themeMode === 'system' ? systemTheme : themeMode;

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.dataset.accent = themeAccent;
  }, [resolvedTheme, themeAccent]);

  // Apply custom memo color via data attribute + CSS variables
  useEffect(() => {
    const root = document.documentElement;
    if (memoColor) {
      const r = parseInt(memoColor.slice(1, 3), 16);
      const g = parseInt(memoColor.slice(3, 5), 16);
      const b = parseInt(memoColor.slice(5, 7), 16);
      root.setAttribute('data-memo-color', memoColor);
      root.style.setProperty('--custom-memo-color', memoColor);
      root.style.setProperty('--custom-memo-color-bg', `rgba(${r}, ${g}, ${b}, 0.1)`);
    } else {
      root.removeAttribute('data-memo-color');
      root.style.removeProperty('--custom-memo-color');
      root.style.removeProperty('--custom-memo-color-bg');
    }
  }, [memoColor]);

  // Auto-check for updates on startup if enabled
  useEffect(() => {
    getSetting('auto_update').then((v) => {
      if (v === 'true') {
        checkUpdate().catch(() => {}); // silent check
      }
    }).catch(console.error);
  }, []);

  // Fetch entries based on current filter
  const fetchEntries = useCallback(async () => {
    const filter: QueryFilter = { limit: 100 };
    if (activeTab !== 'all' && activeTab !== 'memo') {
      filter.category = activeTab;
    }
    if (searchQuery.trim()) {
      filter.search = searchQuery.trim();
    }
    try {
      const data = await getEntries(filter);
      setEntries(data);
    } catch (err) {
      console.error('Failed to fetch entries:', err);
    }
  }, [activeTab, searchQuery]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const s = await getStats();
      setStats(s);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  }, []);

  // Fetch memo count
  const fetchMemoCount = useCallback(async () => {
    if (!memoEnabled) return;
    try {
      const count = await memoCount();
      setMemoCountState(count);
    } catch (err) {
      console.error('Failed to fetch memo count:', err);
    }
  }, [memoEnabled]);

  // Initial load
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        await Promise.all([fetchEntries(), fetchStats(), fetchMemoCount()]);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [fetchEntries, fetchStats, fetchMemoCount]);

  // Listen for real-time clipboard events
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    onClipboardChanged(() => {
      // Refresh from backend so order and dedup are correct
      fetchEntries();
      fetchStats();
      fetchMemoCount();
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [fetchEntries, fetchStats, fetchMemoCount]);

  // Keyboard shortcut: focus search with Ctrl+F
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Actions
  const handleCopy = useCallback(async (id: number) => {
    try {
      await copyToClipboard(id);
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, []);

  const handleDelete = useCallback(
    async (id: number) => {
      try {
        await deleteEntry(id);
        setEntries((prev) => prev.filter((e) => e.id !== id));
        fetchStats();
      } catch (err) {
        console.error('Failed to delete:', err);
      }
    },
    [fetchStats]
  );

  const handleTogglePin = useCallback(
    async (id: number) => {
      try {
        const newPinned = await togglePin(id);
        setEntries((prev) =>
          prev.map((e) => (e.id === id ? { ...e, pinned: newPinned } : e))
        );
      } catch (err) {
        console.error('Failed to toggle pin:', err);
      }
    },
    []
  );

  const handleEdit = useCallback(
    async (id: number, content: string) => {
      try {
        await updateEntry(id, content);
        fetchEntries();
        fetchStats();
      } catch (err) {
        console.error('Failed to update entry:', err);
      }
    },
    [fetchEntries, fetchStats]
  );

  const handleClear = useCallback(async () => {
    if (!confirm(t.clearConfirm)) return;
    try {
      await clearUnpinned();
      fetchEntries();
      fetchStats();
    } catch (err) {
      console.error('Failed to clear:', err);
    }
  }, [fetchEntries, fetchStats, t]);

  // Handle tab change
  const handleTabChange = useCallback((tab: FilterTab) => {
    setActiveTab(tab);
  }, []);

  const handleMemoCountChange = useCallback((count: number) => {
    setMemoListCount(count);
  }, []);

  // Debounced search
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput);
      setLoading(true);
      fetchEntries().finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput, fetchEntries]);

  return (
    <div className="app-root" data-theme={resolvedTheme} data-accent={themeAccent}>
      {/* Title bar (draggable, frameless window) */}
      <div data-tauri-drag-region className="title-bar">
        <div data-tauri-drag-region className="title-content">
          <span className="title-text">{t.appTitle}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="shortcut-hint">{currentShortcut}</span>
            <SettingsButton
              onShortcutChange={setCurrentShortcut}
              onMemoEnabledChange={setMemoEnabled}
              onMemoColorChange={setMemoColor}
              onRawPreviewChange={setRawPreview}
              onThemeModeChange={setThemeMode}
              onThemeAccentChange={setThemeAccent}
            />
          </div>
        </div>
      </div>

      {/* Search bar */}
      <div className="search-bar">
        <span className="search-icon">&#x1F50D;</span>
        <input
          ref={searchRef}
          type="text"
          placeholder={activeTab === 'memo' ? t.memoSearchPlaceholder : t.searchPlaceholder}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="search-input"
        />
        {searchInput && (
          <button
            className="clear-search-btn"
            onClick={() => setSearchInput('')}
            title={t.clearSearch}
          >
            &#x2715;
          </button>
        )}
      </div>

      {/* Category tabs */}
      <CategoryTabs
        activeTab={activeTab}
        onTabChange={handleTabChange}
        stats={stats}
        memoEnabled={memoEnabled}
        memoCount={memoCountState}
      />

      {/* Main content: memo list or clipboard list */}
      {activeTab === 'memo' ? (
        <MemoList searchQuery={searchQuery} onCountChange={handleMemoCountChange} />
      ) : (
        <ClipboardList
          entries={entries}
          onCopy={handleCopy}
          onDelete={handleDelete}
          onTogglePin={handleTogglePin}
          onEdit={handleEdit}
          rawPreview={rawPreview}
          loading={loading}
        />
      )}

      {/* Footer bar */}
      <div className="footer-bar">
        <span className="footer-text">
          {activeTab === 'memo'
            ? t.memoCount(memoListCount)
            : t.itemsCount(entries.length)}
          {stats?.dbSize != null && t.storageSize(formatBytes(stats.dbSize))}
        </span>
        {activeTab !== 'memo' && (
          <button
            className="clear-btn"
            onClick={handleClear}
            title={t.clearHistory}
          >
            {t.clearHistory}
          </button>
        )}
      </div>

      {/* Copied toast */}
      {copied !== null && (
        <div className="toast">{t.copied}</div>
      )}
    </div>
  );
}

function App() {
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  );
}

export default App;
