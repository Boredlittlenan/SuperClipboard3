import { useState, useEffect, useCallback, useRef } from 'react';
import type { ClipboardEntry, FilterTab, QueryFilter, Stats } from './types';
import {
  getEntries,
  deleteEntry,
  togglePin,
  getStats,
  clearUnpinned,
  copyToClipboard,
  onClipboardChanged,
} from './api/clipboard';
import CategoryTabs from './components/CategoryTabs';
import ClipboardList from './components/ClipboardList';
import './App.css';

function App() {
  const [entries, setEntries] = useState<ClipboardEntry[]>([]);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Fetch entries based on current filter
  const fetchEntries = useCallback(async () => {
    const filter: QueryFilter = { limit: 100 };
    if (activeTab !== 'all') {
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

  // Initial load
  useEffect(() => {
    Promise.all([fetchEntries(), fetchStats()]).finally(() => setLoading(false));
  }, [fetchEntries, fetchStats]);

  // Listen for real-time clipboard events
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    onClipboardChanged((_entry: ClipboardEntry) => {
      // Refresh from backend so order and dedup are correct
      fetchEntries();
      fetchStats();
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [fetchEntries, fetchStats]);

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

  const handleClear = useCallback(async () => {
    if (!confirm('Clear all non-pinned entries?')) return;
    try {
      await clearUnpinned();
      fetchEntries();
      fetchStats();
    } catch (err) {
      console.error('Failed to clear:', err);
    }
  }, [fetchEntries, fetchStats]);

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
    <div className="app-root">
      {/* Title bar (draggable, frameless window) */}
      <div data-tauri-drag-region className="title-bar">
        <div data-tauri-drag-region className="title-content">
          <span className="title-text">SuperClipboard3</span>
          <span className="shortcut-hint">Ctrl+Shift+V</span>
        </div>
      </div>

      {/* Search bar */}
      <div className="search-bar">
        <span className="search-icon">&#x1F50D;</span>
        <input
          ref={searchRef}
          type="text"
          placeholder="Search clipboard..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="search-input"
        />
        {searchInput && (
          <button
            className="clear-search-btn"
            onClick={() => setSearchInput('')}
            title="Clear search"
          >
            &#x2715;
          </button>
        )}
      </div>

      {/* Category tabs */}
      <CategoryTabs activeTab={activeTab} onTabChange={setActiveTab} stats={stats} />

      {/* Clipboard entries list */}
      <ClipboardList
        entries={entries}
        onCopy={handleCopy}
        onDelete={handleDelete}
        onTogglePin={handleTogglePin}
        loading={loading}
      />

      {/* Footer bar */}
      <div className="footer-bar">
        <span className="footer-text">
          {entries.length} item{entries.length !== 1 ? 's' : ''}
        </span>
        <button
          className="clear-btn"
          onClick={handleClear}
          title="Clear non-pinned entries"
        >
          Clear History
        </button>
      </div>

      {/* Copied toast */}
      {copied !== null && (
        <div className="toast">Copied!</div>
      )}
    </div>
  );
}

export default App;
