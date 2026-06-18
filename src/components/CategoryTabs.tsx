import { useCallback } from 'react';
import type { FilterTab, Stats } from '../types';
import { getTabLabel } from '../utils';
import { useI18n } from '../i18n';

const TABS: FilterTab[] = ['all', 'text', 'link', 'image', 'code', 'email', 'file_path'];

interface Props {
  activeTab: FilterTab;
  onTabChange: (tab: FilterTab) => void;
  stats: Stats | null;
}

export default function CategoryTabs({ activeTab, onTabChange, stats }: Props) {
  const { t } = useI18n();

  const getCount = useCallback(
    (tab: FilterTab): number | null => {
      if (!stats) return null;
      if (tab === 'all') return stats.total;
      return (stats as unknown as Record<string, number>)[tab] ?? null;
    },
    [stats]
  );

  return (
    <div style={styles.container}>
      <div style={styles.scrollArea}>
        {TABS.map((tab) => {
          const isActive = tab === activeTab;
          const count = getCount(tab);
          return (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              style={{
                ...styles.tab,
                ...(isActive ? styles.tabActive : {}),
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
              <span style={styles.tabLabel}>{getTabLabel(tab, t)}</span>
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
