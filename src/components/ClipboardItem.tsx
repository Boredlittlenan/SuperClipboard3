import { useState } from 'react';
import type { ClipboardEntry } from '../types';
import { getCategoryColor, getCategoryLabel, formatRelativeTime } from '../utils';
import { useI18n } from '../i18n';

interface Props {
  entry: ClipboardEntry;
  onCopy: (id: number) => void;
  onDelete: (id: number) => void;
  onTogglePin: (id: number) => void;
}

export default function ClipboardItem({ entry, onCopy, onDelete, onTogglePin }: Props) {
  const [hovered, setHovered] = useState(false);
  const { t } = useI18n();

  const categoryColor = getCategoryColor(entry.category);
  const isImage = entry.category === 'image';

  return (
    <div
      style={{
        ...styles.container,
        ...(hovered ? styles.containerHover : {}),
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onCopy(entry.id)}
      title={t.clickToCopy}
    >
      {/* Category indicator */}
      <div style={{ ...styles.categoryBar, background: categoryColor }} />

      <div style={styles.body}>
        {/* Header row */}
        <div style={styles.header}>
          <span
            style={{
              ...styles.categoryBadge,
              background: `${categoryColor}20`,
              color: categoryColor,
            }}
          >
            {getCategoryLabel(entry.category, t)}
          </span>
          <div style={styles.headerRight}>
            <span style={styles.time}>{formatRelativeTime(entry.created_at, t)}</span>
            {entry.pinned && <span style={styles.pinBadge}>&#x1F4CC;</span>}
          </div>
        </div>

        {/* Content preview */}
        <div style={styles.preview}>
          {isImage ? (
            <img
              src={`data:image/png;base64,${entry.content}`}
              alt="Clipboard image"
              style={styles.imagePreview}
            />
          ) : entry.category === 'code' ? (
            <pre style={styles.codePreview}>{entry.preview}</pre>
          ) : (
            <p style={styles.textPreview}>{entry.preview}</p>
          )}
        </div>

        {/* Action buttons (visible on hover) */}
        {hovered && (
          <div style={styles.actions}>
            <button
              style={styles.actionBtn}
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin(entry.id);
              }}
              title={entry.pinned ? t.unpin : t.pin}
            >
              {entry.pinned ? '\u2716' : '\u2605'}
            </button>
            <button
              style={{ ...styles.actionBtn, ...styles.deleteBtn }}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(entry.id);
              }}
              title={t.delete}
            >
              &#x2715;
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    borderBottom: '1px solid var(--border)',
    cursor: 'pointer',
    transition: 'background 0.12s ease',
    position: 'relative',
  },
  containerHover: {
    background: 'var(--hover-bg)',
  },
  categoryBar: {
    width: '3px',
    flexShrink: 0,
    borderRadius: '0 2px 2px 0',
  },
  body: {
    flex: 1,
    padding: '10px 12px',
    minWidth: 0,
    position: 'relative',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '6px',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  categoryBadge: {
    fontSize: '10px',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  time: {
    fontSize: '11px',
    color: 'var(--text-muted)',
  },
  pinBadge: {
    fontSize: '12px',
  },
  preview: {
    overflow: 'hidden',
  },
  textPreview: {
    margin: 0,
    fontSize: '13px',
    lineHeight: 1.4,
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    wordBreak: 'break-all',
  },
  codePreview: {
    margin: 0,
    fontSize: '12px',
    lineHeight: 1.4,
    color: 'var(--text-primary)',
    fontFamily: '"Cascadia Code", "Fira Code", "Consolas", monospace',
    background: 'var(--code-bg)',
    padding: '6px 8px',
    borderRadius: '4px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    whiteSpace: 'pre-wrap',
  },
  imagePreview: {
    maxWidth: '100%',
    maxHeight: '120px',
    borderRadius: '4px',
    objectFit: 'contain',
  },
  actions: {
    position: 'absolute',
    top: '8px',
    right: '8px',
    display: 'flex',
    gap: '4px',
  },
  actionBtn: {
    width: '26px',
    height: '26px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    borderRadius: '4px',
    background: 'var(--surface)',
    color: 'var(--text-secondary)',
    fontSize: '12px',
    cursor: 'pointer',
    transition: 'background 0.12s',
  },
  deleteBtn: {
    color: '#ef4444',
  },
};
