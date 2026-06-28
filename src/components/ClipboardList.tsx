import type { ClipboardEntry } from '../types';
import ClipboardItem from './ClipboardItem';
import { useI18n } from '../i18n';

interface Props {
  entries: ClipboardEntry[];
  onCopy: (id: number) => void;
  onDelete: (id: number) => void;
  onTogglePin: (id: number) => void;
  onEdit: (id: number, content: string) => Promise<void>;
  rawPreview: boolean;
  loading: boolean;
  isArchive?: boolean;
  archiveEnabled?: boolean;
  onRestore?: (id: number) => void;
  onPermanentDelete?: (id: number) => void;
}

export default function ClipboardList({
  entries,
  onCopy,
  onDelete,
  onTogglePin,
  onEdit,
  rawPreview,
  loading,
  isArchive,
  archiveEnabled,
  onRestore,
  onPermanentDelete,
}: Props) {
  const { t } = useI18n();

  if (loading && entries.length === 0) {
    return (
      <div style={styles.empty}>
        <div style={styles.spinner} />
        <span style={styles.emptyText}>{t.loading}</span>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div style={styles.empty}>
        <div style={styles.emptyIcon}>{'\u{1F4CB}'}</div>
        <span style={styles.emptyText}>{t.noEntries}</span>
        <span style={styles.emptyHint}>{t.noEntriesHint}</span>
      </div>
    );
  }

  return (
    <div style={styles.list}>
      {entries.map((entry) => (
        <ClipboardItem
          key={entry.id}
          entry={entry}
          onCopy={onCopy}
          onDelete={onDelete}
          onTogglePin={onTogglePin}
          onEdit={onEdit}
          rawPreview={rawPreview}
          isArchive={isArchive}
          archiveEnabled={archiveEnabled}
          onRestore={onRestore}
          onPermanentDelete={onPermanentDelete}
        />
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  list: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
  },
  empty: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '40px 20px',
  },
  emptyIcon: {
    fontSize: '48px',
    opacity: 0.5,
  },
  emptyText: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
    fontWeight: 500,
  },
  emptyHint: {
    fontSize: '12px',
    color: 'var(--text-muted)',
  },
  spinner: {
    width: '24px',
    height: '24px',
    border: '2px solid var(--border)',
    borderTopColor: 'var(--accent)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
};
