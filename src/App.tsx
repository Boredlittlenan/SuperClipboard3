import { useState, useEffect, useCallback, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { ClipboardEntry, FilterTab, QueryFilter, Stats, Memo } from './types';
import {
  getEntries,
  deleteEntry,
  togglePin,
  getStats,
  clearUnpinned,
  copyToClipboard,
  updateEntry,
  onClipboardChanged,
  getArchivedEntries,
  archiveCount,
  unarchiveEntry,
  permanentDelete,
  purgeOldArchives,
} from './api/clipboard';
import { getShortcut, getSetting, checkUpdate, pasteToActiveWindow } from './api/settings';
import { memoCount, getArchivedMemos, memoArchiveCount, unarchiveMemo, permanentDeleteMemo, purgeOldMemoArchives } from './api/memos';
import { formatRelativeTime, formatShortcutLabel, getArchiveDaysRemaining, getArchiveTone } from './utils';
import { I18nProvider, useI18n } from './i18n';
import CategoryTabs from './components/CategoryTabs';
import ClipboardList from './components/ClipboardList';
import SettingsButton from './components/SettingsButton';
import MemoList from './components/MemoList';
import { renderMemoBody } from './components/MemoBody';
import { TrashIcon } from './components/icons/TrashIcon';
import type { ThemeMode } from './types';
import './App.css';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function ArchivedMemoItem({ memo, onRestore, onPermanentDelete }: { memo: Memo; onRestore: () => void; onPermanentDelete: () => void }) {
  const { t } = useI18n();
  const archiveDaysRemaining = memo.archived_at ? getArchiveDaysRemaining(memo.archived_at) : null;
  const archiveTone = getArchiveTone(archiveDaysRemaining ?? 0);
  const archiveTimerStyle = {
    warning: { color: '#f59e0b', background: 'rgba(245,158,11,0.1)' },
    danger: { color: '#ef4444', background: 'rgba(239,68,68,0.1)' },
  }[archiveTone];

  return (
    <div className="memo-entry" style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: 'var(--memo-contrast-bg)', padding: '4px 6px', borderRadius: '4px', margin: '-2px -4px 2px -4px' }}>
          <span className="memo-selectable" style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {memo.title || '(untitled)'}
          </span>
          <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
            <button style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 4, background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer' }} onClick={onRestore} title={t.restore}>
              {'\u21A9'}
            </button>
            <button style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 4, background: 'var(--surface)', color: '#ef4444', fontSize: 11, cursor: 'pointer' }} onClick={onPermanentDelete} title={t.permanentDelete}>
              <TrashIcon />
            </button>
          </div>
        </div>
        <div className="memo-selectable memo-preview" style={{ fontSize: '13px', color: '#525252', margin: 0, lineHeight: 1.4, maxHeight: 64, overflow: 'hidden' }}>
          {renderMemoBody(memo.body, 100, 96)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
          <span className="memo-time" style={{ fontSize: '11px', color: '#999999' }}>{formatRelativeTime(memo.created_at, t)}</span>
          {archiveDaysRemaining !== null && (
            <span style={{ fontSize: '10px', ...archiveTimerStyle, padding: '1px 6px', borderRadius: '8px', fontWeight: 500 }}>
              {t.daysRemaining(archiveDaysRemaining)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

interface ConfirmDialogState {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: 'danger' | 'normal';
  resolve: (confirmed: boolean) => void;
}

function AppContent() {
  const { t } = useI18n();
  const [entries, setEntries] = useState<ClipboardEntry[]>([]);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<number | null>(null);
  const [currentShortcut, setCurrentShortcut] = useState('Alt+X');
  const [memoEnabled, setMemoEnabled] = useState(false);
  const [memoCountState, setMemoCountState] = useState<number | null>(null);
  const [memoListCount, setMemoListCount] = useState<number>(0);
  const [memoColor, setMemoColor] = useState<string | null>(null);
  const [archiveEnabled, setArchiveEnabled] = useState(false);
  const [archiveCountState, setArchiveCountState] = useState<number | null>(null);
  const [rawPreview, setRawPreview] = useState(false);
  const [themeAccent, setThemeAccent] = useState('default');
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  );
  const searchRef = useRef<HTMLInputElement>(null);
  const [archiveSubTab, setArchiveSubTab] = useState<'clipboard' | 'memos'>('clipboard');
  const [archivedMemos, setArchivedMemos] = useState<Memo[]>([]);
  const [memoArchiveCountState, setMemoArchiveCountState] = useState<number>(0);
  const [openedViaShortcut, setOpenedViaShortcut] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);

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

  // Load archive_enabled setting on mount
  useEffect(() => {
    getSetting('archive_enabled').then((v) => setArchiveEnabled(v === 'true')).catch(console.error);
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
      if (v === null || v === 'true') {
        checkUpdate().catch(() => {}); // silent check
      }
    }).catch(console.error);
  }, []);

  // Listen for window-shown events to track how the window was opened
  useEffect(() => {
    const unlisten = listen<string>('window-shown', (event) => {
      const source = event.payload;
      setOpenedViaShortcut(source === 'shortcut');
      // Follow mode positioning is handled in Rust before window.show()
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  // Fetch entries based on current filter
  const fetchEntries = useCallback(async () => {
    const filter: QueryFilter = { limit: 100 };
    if (activeTab !== 'all' && activeTab !== 'memo' && activeTab !== 'archive') {
      filter.category = activeTab;
    }
    if (searchQuery.trim()) {
      filter.search = searchQuery.trim();
    }
    try {
      if (activeTab === 'archive') {
        const data = await getArchivedEntries(filter);
        setEntries(data);
      } else {
        const data = await getEntries(filter);
        setEntries(data);
      }
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

  // Fetch archive count
  const fetchArchiveCount = useCallback(async () => {
    if (!archiveEnabled) return;
    try {
      const count = await archiveCount();
      setArchiveCountState(count);
    } catch (err) {
      console.error('Failed to fetch archive count:', err);
    }
  }, [archiveEnabled]);

  // Fetch memo archive count
  const fetchMemoArchiveCount = useCallback(async () => {
    if (!archiveEnabled) return;
    try {
      const count = await memoArchiveCount();
      setMemoArchiveCountState(count);
    } catch (err) {
      console.error('Failed to fetch memo archive count:', err);
    }
  }, [archiveEnabled]);

  // Fetch archived memos
  const fetchArchivedMemos = useCallback(async () => {
    if (!archiveEnabled) return;
    try {
      const data = await getArchivedMemos({ limit: 100 });
      setArchivedMemos(data);
    } catch (err) {
      console.error('Failed to fetch archived memos:', err);
    }
  }, [archiveEnabled]);

  // Initial load
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        await Promise.all([fetchEntries(), fetchStats(), fetchMemoCount(), fetchArchiveCount(), fetchMemoArchiveCount()]);
        // Purge archives older than 30 days on startup
        if (archiveEnabled) {
          purgeOldArchives(30).catch(() => {});
          purgeOldMemoArchives(30).catch(() => {});
        }
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
  }, [fetchEntries, fetchStats, fetchMemoCount, fetchArchiveCount, fetchMemoArchiveCount, archiveEnabled]);

  // Listen for real-time clipboard events
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    onClipboardChanged(() => {
      // Refresh from backend so order and dedup are correct
      fetchEntries();
      fetchStats();
      fetchMemoCount();
      fetchArchiveCount();
      fetchMemoArchiveCount();
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [fetchEntries, fetchStats, fetchMemoCount, fetchArchiveCount, fetchMemoArchiveCount]);

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

  useEffect(() => {
    if (!confirmDialog) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        confirmDialog.resolve(false);
        setConfirmDialog(null);
      }
      if (e.key === 'Enter') {
        confirmDialog.resolve(true);
        setConfirmDialog(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [confirmDialog]);

  const requestConfirm = useCallback((dialog: Omit<ConfirmDialogState, 'resolve'>) => {
    return new Promise<boolean>((resolve) => {
      setConfirmDialog({ ...dialog, resolve });
    });
  }, []);

  // Actions
  const handleCopy = useCallback(async (id: number) => {
    try {
      if (openedViaShortcut) {
        // Paste directly to the active window (hides window + simulates Ctrl+V)
        await pasteToActiveWindow(id);
        setOpenedViaShortcut(false);
      } else {
        await copyToClipboard(id);
      }
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [openedViaShortcut]);

  const handleDelete = useCallback(
    async (id: number) => {
      try {
        await deleteEntry(id, archiveEnabled || undefined);
        setEntries((prev) => prev.filter((e) => e.id !== id));
        fetchStats();
        fetchArchiveCount();
      } catch (err) {
        console.error('Failed to delete:', err);
      }
    },
    [fetchStats, fetchArchiveCount, archiveEnabled]
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

  const handleRestore = useCallback(
    async (id: number) => {
      try {
        await unarchiveEntry(id);
        setEntries((prev) => prev.filter((e) => e.id !== id));
        fetchStats();
        fetchArchiveCount();
      } catch (err) {
        console.error('Failed to restore:', err);
      }
    },
    [fetchStats, fetchArchiveCount]
  );

  const handlePermanentDelete = useCallback(
    async (id: number) => {
      const confirmed = await requestConfirm({
        title: t.permanentDelete,
        message: t.permanentDeleteConfirm,
        confirmLabel: t.permanentDelete,
        tone: 'danger',
      });
      if (!confirmed) return;
      try {
        await permanentDelete(id);
        setEntries((prev) => prev.filter((e) => e.id !== id));
        fetchStats();
        fetchArchiveCount();
      } catch (err) {
        console.error('Failed to permanently delete:', err);
      }
    },
    [fetchStats, fetchArchiveCount, requestConfirm, t]
  );

  const handleMemoRestore = useCallback(
    async (id: number) => {
      try {
        await unarchiveMemo(id);
        setArchivedMemos((prev) => prev.filter((m) => m.id !== id));
        fetchMemoCount();
        fetchMemoArchiveCount();
      } catch (err) {
        console.error('Failed to restore memo:', err);
      }
    },
    [fetchMemoCount, fetchMemoArchiveCount]
  );

  const handleMemoPermanentDelete = useCallback(
    async (id: number) => {
      const confirmed = await requestConfirm({
        title: t.permanentDelete,
        message: t.permanentDeleteConfirm,
        confirmLabel: t.permanentDelete,
        tone: 'danger',
      });
      if (!confirmed) return;
      try {
        await permanentDeleteMemo(id);
        setArchivedMemos((prev) => prev.filter((m) => m.id !== id));
        fetchMemoArchiveCount();
      } catch (err) {
        console.error('Failed to permanently delete memo:', err);
      }
    },
    [fetchMemoArchiveCount, requestConfirm, t]
  );

  const handleClear = useCallback(async () => {
    const confirmed = await requestConfirm({
      title: t.clearHistory,
      message: t.clearConfirm,
      confirmLabel: t.clearHistory,
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await clearUnpinned(archiveEnabled || undefined);
      fetchEntries();
      fetchStats();
      fetchArchiveCount();
    } catch (err) {
      console.error('Failed to clear:', err);
    }
  }, [fetchEntries, fetchStats, fetchArchiveCount, archiveEnabled, requestConfirm, t]);

  // Fetch archived memos when archive tab is active
  useEffect(() => {
    if (activeTab === 'archive' && archiveEnabled) {
      fetchArchivedMemos();
    }
  }, [activeTab, archiveEnabled, fetchArchivedMemos]);

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
    <div className="app-root" data-theme={resolvedTheme} data-accent={themeAccent} data-memo-color={memoColor || undefined}>
      {/* Title bar (draggable, frameless window) */}
      <div data-tauri-drag-region className="title-bar">
        <div data-tauri-drag-region className="title-content">
          <span className="title-text">{t.appTitle}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="shortcut-hint">{formatShortcutLabel(currentShortcut)}</span>
            <SettingsButton
              onShortcutChange={setCurrentShortcut}
              onMemoEnabledChange={setMemoEnabled}
              onMemoColorChange={setMemoColor}
              onRawPreviewChange={setRawPreview}
              onThemeModeChange={setThemeMode}
              onThemeAccentChange={setThemeAccent}
              onArchiveEnabledChange={setArchiveEnabled}
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
        archiveEnabled={archiveEnabled}
        archiveCount={archiveCountState}
      />

      {/* Main content: memo list or clipboard list */}
      {activeTab === 'memo' ? (
        <MemoList searchQuery={searchQuery} archiveEnabled={archiveEnabled} onCountChange={handleMemoCountChange} onArchiveCountChange={setMemoArchiveCountState} />
      ) : activeTab === 'archive' ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Archive sub-tabs */}
          <div style={{ display: 'flex', gap: '0', padding: '0 12px', borderBottom: '1px solid var(--border)' }}>
            <button
              style={{
                flex: 1, padding: '8px 0', border: 'none', borderBottom: archiveSubTab === 'clipboard' ? '2px solid var(--accent)' : '2px solid transparent',
                background: 'transparent', color: archiveSubTab === 'clipboard' ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: '12px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
              }}
              onClick={() => setArchiveSubTab('clipboard')}
            >
              {t.archiveSubTab} ({archiveCountState ?? 0})
            </button>
            <button
              style={{
                flex: 1, padding: '8px 0', border: 'none', borderBottom: archiveSubTab === 'memos' ? '2px solid var(--accent)' : '2px solid transparent',
                background: 'transparent', color: archiveSubTab === 'memos' ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: '12px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
              }}
              onClick={() => { setArchiveSubTab('memos'); fetchArchivedMemos(); }}
            >
              {t.memoSubTab} ({memoArchiveCountState})
            </button>
          </div>
          {/* Sub-tab content */}
          {archiveSubTab === 'clipboard' ? (
            entries.length === 0 && !loading ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '40px 20px' }}>
                <span style={{ fontSize: '36px', opacity: 0.5 }}>{'\uD83D\uDDD1\uFE0F'}</span>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>{t.archiveEmpty}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t.archiveEmptyHint}</span>
              </div>
            ) : (
              <ClipboardList
                entries={entries}
                onCopy={handleCopy}
                onDelete={handlePermanentDelete}
                onTogglePin={handleTogglePin}
                onEdit={handleEdit}
                rawPreview={rawPreview}
                loading={loading}
                isArchive={true}
                archiveEnabled={archiveEnabled}
                onRestore={handleRestore}
                onPermanentDelete={handlePermanentDelete}
              />
            )
          ) : (
            archivedMemos.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '40px 20px' }}>
                <span style={{ fontSize: '36px', opacity: 0.5 }}>{'\uD83D\uDCDD'}</span>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>{t.archiveEmpty}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t.archiveEmptyHint}</span>
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {archivedMemos.map(memo => (
                  <ArchivedMemoItem
                    key={memo.id}
                    memo={memo}
                    onRestore={() => handleMemoRestore(memo.id)}
                    onPermanentDelete={() => handleMemoPermanentDelete(memo.id)}
                  />
                ))}
              </div>
            )
          )}
        </div>
      ) : (
        <ClipboardList
          entries={entries}
          onCopy={handleCopy}
          onDelete={handleDelete}
          onTogglePin={handleTogglePin}
          onEdit={handleEdit}
          rawPreview={rawPreview}
          loading={loading}
          archiveEnabled={archiveEnabled}
          onRestore={handleRestore}
          onPermanentDelete={handlePermanentDelete}
        />
      )}

      {/* Footer bar */}
      <div className="footer-bar">
        <span className="footer-text">
          {activeTab === 'memo'
            ? t.itemsCount(memoListCount)
            : activeTab === 'archive' && archiveSubTab === 'memos'
            ? t.itemsCount(archivedMemos.length)
            : t.itemsCount(entries.length)}
          {activeTab === 'memo'
            ? stats?.memoSize != null && ` · ${t.memoStorage(formatBytes(stats.memoSize))}`
            : activeTab === 'archive' && archiveSubTab === 'memos'
            ? stats?.memoSize != null && ` · ${t.memoStorage(formatBytes(stats.memoSize))}`
            : stats?.clipboardSize != null && ` · ${t.clipboardStorage(formatBytes(stats.clipboardSize))}`}
        </span>
        {activeTab !== 'memo' && activeTab !== 'archive' && (
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

      {confirmDialog && (
        <div
          className="dialog-backdrop"
          onMouseDown={() => {
            confirmDialog.resolve(false);
            setConfirmDialog(null);
          }}
        >
          <div className="confirm-dialog" onMouseDown={(e) => e.stopPropagation()}>
            <div className="confirm-dialog-title">{confirmDialog.title}</div>
            <div className="confirm-dialog-message">{confirmDialog.message}</div>
            <div className="confirm-dialog-actions">
              <button
                className="dialog-btn"
                onClick={() => {
                  confirmDialog.resolve(false);
                  setConfirmDialog(null);
                }}
              >
                {t.cancel}
              </button>
              <button
                className={`dialog-btn dialog-btn-primary ${confirmDialog.tone === 'danger' ? 'dialog-btn-danger' : ''}`}
                onClick={() => {
                  confirmDialog.resolve(true);
                  setConfirmDialog(null);
                }}
              >
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
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
