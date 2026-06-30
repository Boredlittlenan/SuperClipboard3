import type { Category, FilterTab } from './types';
import type { Translations } from './i18n/translations';

/** Category badge color map */
const CATEGORY_COLORS: Record<Category, string> = {
  text: '#6b7280',
  link: '#3b82f6',
  image: '#8b5cf6',
  code: '#10b981',
  email: '#f59e0b',
  file_path: '#ef4444',
};

export function getCategoryColor(category: Category): string {
  return CATEGORY_COLORS[category] ?? '#6b7280';
}

/** Get category label from translations */
export function getCategoryLabel(category: Category, t: Translations): string {
  const map: Record<Category, string> = {
    text: t.tabText,
    link: t.tabLink,
    image: t.tabImage,
    code: t.tabCode,
    email: t.tabEmail,
    file_path: t.tabPath,
  };
  return map[category] ?? category;
}

/** Get tab label from translations */
export function getTabLabel(tab: FilterTab, t: Translations): string {
  if (tab === 'memo') return t.memoTab;
  if (tab === 'archive') return t.tabArchive;
  const map: Record<Exclude<FilterTab, 'memo' | 'archive'>, string> = {
    all: t.tabAll,
    text: t.tabText,
    link: t.tabLink,
    image: t.tabImage,
    code: t.tabCode,
    email: t.tabEmail,
    file_path: t.tabPath,
  };
  return map[tab as Exclude<FilterTab, 'memo' | 'archive'>] ?? tab;
}

/** Format relative time string using translations */
export function formatRelativeTime(isoString: string, t: Translations): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return t.justNow;
  if (diffSec < 3600) return t.minutesAgo(Math.floor(diffSec / 60));
  if (diffSec < 86400) return t.hoursAgo(Math.floor(diffSec / 3600));

  // Show concrete date/time for entries older than 24 hours
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${month}/${day} ${hours}:${minutes}`;
}

export function getArchiveDaysRemaining(archivedAt: string): number {
  const archivedDate = new Date(archivedAt);
  const expiryDate = new Date(archivedDate.getTime() + 30 * 24 * 60 * 60 * 1000);
  return Math.max(0, Math.ceil((expiryDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

export function getArchiveTone(daysRemaining: number): 'warning' | 'danger' {
  if (daysRemaining <= 10) return 'danger';
  return 'warning';
}
