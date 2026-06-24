import { useCallback, useRef } from 'react';
import type { FilterTab, Stats } from '../types';
import { getTabLabel } from '../utils';
import { useI18n } from '../i18n';

interface Props {
  activeTab: FilterTab;
  onTabChange: (tab: FilterTab) => void;
  stats: Stats | null;
  memoEnabled?: boolean;
  memoCount?: number | null;
}

export default function CategoryTabs({ activeTab, onTabChange, stats, memoEnabled, memoCount }: Props) {
  const { t } = useI18n();

  const tabs: FilterTab[] = memoEnabled ? ['memo', 'all', 'text', 'link', 'image', 'code', 'email', 'file_path'] : ['all', 'text', 'link', 'image', 'code', 'email', 'file_path'];

  const getCount = useCallback(
    (tab: FilterTab): number | null => {
      if (tab === 'memo') return memoCount ?? null;
      if (!stats) return null;
      if (tab === 'all') return stats.total;
      return (stats as unknown as Record<string, number>)[tab] ?? null;
    },
    [stats, memoCount]
  );

  const scrollRef = useRef<HTMLDivElement>(null);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft += e.deltaY || e.deltaX;
    }
  }, []);

  return (
    <div style={styles.container}>
      <div ref={scrollRef} style={styles.scrollArea} onWheel={handleWheel}>
        {tabs.map((tab) => {
          const isActive = tab === activeTab;
          const count = getCount(tab);
          return (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              style={{
                ...styles.tab,
                ...(isActive
                  ? (tab === 'memo' ? styles.tabActiveMemo : styles.tabActive)
                  : {}),
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'var(--hover-bg)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              <span style={styles.tabLabel}>{tab === 'memo' ? t.memoTab : getTabLabel(tab, t)}</span>
              {count !== null && count > 0 && (
                <span
                  style={{
                    ...styles.badge,
                    ...(isActive ? styles.badgeActive : {}),
                  }}
                >
                  {count > 999 ? '999+' : count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    borderBottom: '1px solid var(--border)',
    background: 'var(--surface)',
    overflow: 'hidden',
  },
  scrollArea: {
    display: 'flex',
    gap: '2px',
    padding: '4px 8px',
    overflowX: 'auto',
    scrollbarWidth: 'none',
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 12px',
    border: 'none',
    borderRadius: '6px',
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'all 0.15s ease',
  },
  tabActive: {
    background: 'var(--accent)',
    color: '#ffffff',
  },
  tabActiveMemo: {
    background: 'var(--memo-contrast)',
    color: '#ffffff',
  },
  tabLabel: {
    lineHeight: 1,
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '18px',
    height: '18px',
    padding: '0 5px',
    borderRadius: '9px',
    background: 'var(--border)',
    color: 'var(--text-secondary)',
    fontSize: '10px',
    fontWeight: 600,
    lineHeight: 1,
  },
  badgeActive: {
    background: 'rgba(255,255,255,0.25)',
    color: '#ffffff',
  },
};
