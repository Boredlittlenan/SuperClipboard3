import { useState, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { ClipboardEntry } from '../types';
import { getArchiveDaysRemaining, getArchiveTone, getCategoryColor, getCategoryLabel, formatRelativeTime } from '../utils';
import { useI18n } from '../i18n';
import { TrashIcon } from './icons/TrashIcon';

interface Props {
  entry: ClipboardEntry;
  onCopy: (id: number) => void;
  onDelete: (id: number) => void;
  onTogglePin: (id: number) => void;
  onEdit: (id: number, content: string) => Promise<void>;
  rawPreview?: boolean;
  isArchive?: boolean;
  archiveEnabled?: boolean;
  onRestore?: (id: number) => void;
  onPermanentDelete?: (id: number) => void;
}

export default function ClipboardItem({ entry, onCopy, onDelete, onTogglePin, onEdit, rawPreview, isArchive, archiveEnabled, onRestore, onPermanentDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(entry.content);
  const [showOriginal, setShowOriginal] = useState(false);
  const [saving, setSaving] = useState(false);
  const { t } = useI18n();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const categoryColor = getCategoryColor(entry.category);
  const isImage = entry.category === 'image';
  const isLink = entry.category === 'link';
  const hasOriginal = entry.original_content != null;
  const archiveDaysRemaining = isArchive && entry.archived_at ? getArchiveDaysRemaining(entry.archived_at) : null;

  const handleOpenInBrowser = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    let url = entry.content.trim();
    // Prepend https:// if no scheme present
    if (!/^https?:\/\//i.test(url) && !/^ftp:\/\//i.test(url)) {
      url = 'https://' + url;
    }
    invoke('open_url', { url }).catch(console.error);
  }, [entry.content]);

  const handleEditClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setEditContent(entry.content);
    setEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [entry.content]);

  const handleSave = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (saving) return;
    setSaving(true);
    try {
      await onEdit(entry.id, editContent);
      setEditing(false);
    } catch (err) {
      console.error('Failed to save edit:', err);
    } finally {
      setSaving(false);
    }
  }, [entry.id, editContent, onEdit, saving]);

  const handleCancel = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(false);
    setEditContent(entry.content);
  }, [entry.content]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancel(e as unknown as React.MouseEvent);
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSave(e as unknown as React.MouseEvent);
    }
  }, [handleCancel, handleSave]);

  const handleToggleOriginal = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowOriginal(prev => !prev);
  }, []);

  return (
    <div
      className="clipboard-entry"
      style={styles.container}
      onClick={() => !editing && onCopy(entry.id)}
      title={editing ? undefined : t.clickToCopy}
    >
      {/* Category indicator */}
      <div style={{ ...styles.categoryBar, background: categoryColor }} />

      <div style={styles.body}>
        {/* Header row */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <span
              className="entry-category-badge"
              style={{
                ...styles.categoryBadge,
                background: `${categoryColor}20`,
                color: categoryColor,
              }}
            >
              {getCategoryLabel(entry.category, t)}
            </span>
            {!editing && (
              <div className="entry-actions" style={styles.inlineActions}>
                {isArchive ? (
                  <>
                    <button
                      style={styles.actionBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRestore?.(entry.id);
                      }}
                      title={t.restore}
                    >
                      {'\u21A9'}
                    </button>
                    <button
                      style={{ ...styles.actionBtn, ...styles.deleteBtn }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onPermanentDelete?.(entry.id);
                      }}
                      title={t.permanentDelete}
                    >
                      <TrashIcon />
                    </button>
                  </>
                ) : (
                  <>
                    {isLink && (
                      <button
                        style={styles.actionBtn}
                        onClick={handleOpenInBrowser}
                        title={t.openInBrowser || 'Open in browser'}
                      >
                        {'\uD83C\uDF10'}
                      </button>
                    )}
                    {!isImage && (
                      <button
                        style={styles.actionBtn}
                        onClick={handleEditClick}
                        title={t.edit}
                      >
                        {'\u270E'}
                      </button>
                    )}
                    <button
                      style={{
                        ...styles.actionBtn,
                        ...(entry.pinned ? styles.actionBtnActive : {}),
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onTogglePin(entry.id);
                      }}
                      title={entry.pinned ? t.unpin : t.pin}
                    >
                      {'\uD83D\uDCCC'}
                    </button>
                    <button
                      style={{ ...styles.actionBtn, ...(archiveEnabled ? styles.archiveBtn : styles.deleteBtn) }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(entry.id);
                      }}
                      title={archiveEnabled ? t.archiveSetting : t.delete}
                    >
                      {archiveEnabled ? '\uD83D\uDDD1\uFE0F' : <TrashIcon />}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          <div style={styles.headerRight}>
            {entry.updated_at && (
              <span style={styles.editedBadge}>
                {t.editedAt(formatRelativeTime(entry.updated_at, t))}
              </span>
            )}
            <span className="entry-time" style={styles.time}>{formatRelativeTime(entry.created_at, t)}</span>
            {entry.pinned && !isArchive && <span style={styles.pinBadge}>{'\u{1F4CC}'}</span>}
            {isArchive && entry.archived_at && (
              <span style={{ ...styles.archiveTimer, ...styles[`archiveTimer${getArchiveTone(archiveDaysRemaining ?? 0)}`] }}>
                {t.daysRemaining(archiveDaysRemaining ?? 0)}
              </span>
            )}
          </div>
        </div>

        {/* Content area */}
        {editing ? (
          <div style={styles.editContainer} onClick={(e) => e.stopPropagation()}>
            <textarea
              ref={textareaRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={handleKeyDown}
              style={styles.textarea}
              rows={Math.min(Math.max(editContent.split('\n').length, 3), 15)}
            />
            <div style={styles.editActions}>
              <span style={styles.editHint}>Ctrl+Enter {t.save} / Esc {t.cancel}</span>
              <button style={styles.cancelBtn} onClick={handleCancel} disabled={saving}>
                {t.cancel}
              </button>
              <button
                style={{ ...styles.saveBtn, ...(saving ? styles.saveBtnDisabled : {}) }}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? '...' : t.save}
              </button>
            </div>
          </div>
        ) : (
          <div className="entry-preview" style={styles.preview}>
            {isImage ? (
              <img
                src={`data:image/png;base64,${entry.content}`}
                alt="Clipboard image"
                style={styles.imagePreview}
              />
            ) : rawPreview ? (
              <pre style={styles.rawPreview}>{entry.content}</pre>
            ) : entry.category === 'code' ? (
              <pre style={styles.codePreview}>{entry.preview}</pre>
            ) : (
              <p style={styles.textPreview}>{entry.preview}</p>
            )}
          </div>
        )}

        {/* Original content collapsible */}
        {hasOriginal && !editing && !isArchive && (
          <div style={styles.originalSection} onClick={(e) => e.stopPropagation()}>
            <button style={styles.originalToggle} onClick={handleToggleOriginal}>
              <span style={{
                ...styles.toggleArrow,
                transform: showOriginal ? 'rotate(90deg)' : 'rotate(0deg)',
              }}>
                {'\u25B6'}
              </span>
              {showOriginal ? t.hideOriginal : t.showOriginal}
            </button>
            {showOriginal && (
              <div style={styles.originalContent}>
                <pre style={styles.originalPre}>{entry.original_content}</pre>
              </div>
            )}
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
    position: 'relative',
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
    gap: '8px',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    minWidth: 0,
    flexShrink: 1,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexShrink: 0,
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
  editedBadge: {
    fontSize: '10px',
    color: 'var(--accent)',
    background: 'var(--accent-bg, rgba(59,130,246,0.1))',
    padding: '1px 6px',
    borderRadius: '8px',
    fontWeight: 500,
  },
  pinBadge: {
    fontSize: '12px',
  },
  archiveTimer: {
    fontSize: '10px',
    padding: '1px 6px',
    borderRadius: '8px',
    fontWeight: 500,
  },
  archiveTimerwarning: {
    color: '#f59e0b',
    background: 'rgba(245,158,11,0.1)',
  },
  archiveTimerdanger: {
    color: '#ef4444',
    background: 'rgba(239,68,68,0.1)',
  },
  archiveBtn: {
    color: '#f59e0b',
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
  rawPreview: {
    margin: 0,
    fontSize: '12px',
    lineHeight: 1.4,
    color: 'var(--text-primary)',
    fontFamily: '"Cascadia Code", "Fira Code", "Consolas", monospace',
    background: 'var(--code-bg)',
    padding: '6px 8px',
    borderRadius: '4px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    maxHeight: '300px',
    overflowY: 'auto',
  },
  imagePreview: {
    maxWidth: '100%',
    maxHeight: '120px',
    borderRadius: '4px',
    objectFit: 'contain',
  },
  // Edit mode styles
  editContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  textarea: {
    width: '100%',
    boxSizing: 'border-box',
    fontSize: '13px',
    lineHeight: 1.5,
    fontFamily: '"Cascadia Code", "Fira Code", "Consolas", monospace',
    color: 'var(--text-primary)',
    background: 'var(--code-bg, #f5f5f5)',
    border: '1px solid var(--accent, #3b82f6)',
    borderRadius: '4px',
    padding: '8px',
    resize: 'vertical' as const,
    outline: 'none',
  },
  editActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    justifyContent: 'flex-end',
  },
  editHint: {
    fontSize: '10px',
    color: 'var(--text-muted)',
    marginRight: 'auto',
  },
  saveBtn: {
    fontSize: '12px',
    padding: '4px 12px',
    borderRadius: '4px',
    border: 'none',
    background: 'var(--accent, #3b82f6)',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 500,
  },
  saveBtnDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  cancelBtn: {
    fontSize: '12px',
    padding: '4px 12px',
    borderRadius: '4px',
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  // Original content collapsible styles
  originalSection: {
    marginTop: '6px',
  },
  originalToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    fontSize: '11px',
    cursor: 'pointer',
    padding: '2px 0',
  },
  toggleArrow: {
    fontSize: '8px',
    display: 'inline-block',
    transition: 'transform 0.2s ease',
  },
  originalContent: {
    marginTop: '4px',
    background: 'var(--code-bg, #f5f5f5)',
    borderRadius: '4px',
    padding: '6px 8px',
    borderLeft: '3px solid var(--text-muted)',
  },
  originalPre: {
    margin: 0,
    fontSize: '11px',
    lineHeight: 1.4,
    color: 'var(--text-secondary)',
    fontFamily: '"Cascadia Code", "Fira Code", "Consolas", monospace',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    maxHeight: '200px',
    overflowY: 'auto',
  },
  // Action buttons
  inlineActions: {
    display: 'flex',
    gap: '4px',
    flexShrink: 0,
  },
  actionBtn: {
    width: '22px',
    height: '22px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    borderRadius: '4px',
    background: 'var(--surface)',
    color: 'var(--text-secondary)',
    fontSize: '11px',
    cursor: 'pointer',
    transition: 'background 0.12s',
  },
  deleteBtn: {
    color: '#ef4444',
  },
  actionBtnActive: {
    color: 'var(--accent)',
  },
};
