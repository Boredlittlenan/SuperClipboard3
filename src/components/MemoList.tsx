import { useState, useEffect, useCallback, useRef } from 'react';
import type React from 'react';
import type { Memo } from '../types';
import { getMemos, createMemo, updateMemo, deleteMemo, toggleMemoPin, reorderMemos, archiveMemo, memoArchiveCount } from '../api/memos';
import { useI18n } from '../i18n';
import { formatRelativeTime } from '../utils';
import { TrashIcon } from './icons/TrashIcon';
import MemoRichEditor from './MemoRichEditor';
import {
  hasMemoImage,
  parseMemoBody,
  renderMemoBody,
} from './MemoBody';

const MEMO_COLLAPSE_TEXT_LIMIT = 300;
const MEMO_COLLAPSE_LINE_LIMIT = 5;

function isMemoBodyCollapsible(body: string): boolean {
  if (!body) return false;
  const blocks = parseMemoBody(body);
  const textLength = blocks.reduce((sum, block) => sum + (block.type === 'text' ? block.text.length : 0), 0);
  const lineCount = blocks.reduce((sum, block) => sum + (block.type === 'text' ? block.text.split('\n').length : 0), 0);
  return textLength > MEMO_COLLAPSE_TEXT_LIMIT || lineCount > MEMO_COLLAPSE_LINE_LIMIT || hasMemoImage(body);
}

function getMemoEditorHeight(body: string): number {
  const blocks = parseMemoBody(body);
  const text = blocks.filter(block => block.type === 'text').map(block => block.text).join('');
  const lineCount = text.split('\n').length;
  const imageCount = blocks.filter(block => block.type === 'image').length;
  if (text.length > 1600 || lineCount > 28 || imageCount >= 3) return 400;
  if (text.length > 700 || lineCount > 12 || imageCount > 0) return 300;
  return 120;
}

function splitTags(tags: string): string[] {
  return tags
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean);
}

function mergeTags(manualTags: string, autoTags: string[]): string {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const tag of [...splitTags(manualTags), ...autoTags]) {
    const key = tag.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(tag);
  }
  return merged.join(',');
}

function inferMemoTags(title: string, body: string, labels: { image: string; email: string; path: string; link: string; code: string }): string[] {
  const content = `${title}\n${body}`;
  const tags: string[] = [];
  if (hasMemoImage(body)) tags.push(labels.image);
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(content)) tags.push(labels.email);
  if (/(?:[A-Za-z]:\\|\\\\[\w.-]+\\|\/(?:Users|home|var|etc|tmp|mnt|Volumes)\/|\.\/|\.\.\/)[^\s]+/.test(content)) tags.push(labels.path);
  if (/https?:\/\/[^\s]+|www\.[^\s]+/i.test(content)) tags.push(labels.link);
  if (/(?:function\s+\w+|const\s+\w+\s*=|let\s+\w+\s*=|class\s+\w+|import\s+.+from|```|<\/?[a-z][\s\S]*>)/i.test(content)) tags.push(labels.code);
  return tags;
}

interface Props {
  searchQuery: string;
  archiveEnabled?: boolean;
  onCountChange?: (count: number) => void;
  onArchiveCountChange?: (count: number) => void;
}

export default function MemoList({ searchQuery, archiveEnabled, onCountChange, onArchiveCountChange }: Props) {
  const { t } = useI18n();
  const [memos, setMemos] = useState<Memo[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<{ title: string; body: string; tags: string } | null>(null);
  const [savingMemo, setSavingMemo] = useState(false);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const [expandedMemoIds, setExpandedMemoIds] = useState<Set<number>>(() => new Set());

  const editingItemRef = useRef<HTMLDivElement>(null);
  const editingIdRef = useRef<number | null>(null);
  const newMemoIdRef = useRef<number | null>(null);

  // Keep editingIdRef in sync with editingId state
  useEffect(() => {
    editingIdRef.current = editingId;
  }, [editingId]);

  // ─── Fetch memos ──────────────────────────────────────────
  const fetchMemos = useCallback(async () => {
    try {
      const filter = searchQuery.trim() ? { search: searchQuery.trim(), limit: 100 } : { limit: 100 };
      const data = await getMemos(filter);
      setMemos(data);
      onCountChange?.(data.length);
    } catch (err) {
      console.error('Failed to fetch memos:', err);
    }
  }, [searchQuery, onCountChange]);

  useEffect(() => {
    fetchMemos();
  }, [fetchMemos]);

  // ─── Auto-scroll editing item into view ───────────────────
  useEffect(() => {
    if (editingId !== null && editingItemRef.current) {
      // Delay to let the editor expand first
      setTimeout(() => {
        editingItemRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 80);
    }
  }, [editingId]);

  // ─── Editing handlers ─────────────────────────────────────
  const startEditing = useCallback((memo: Memo) => {
    editingIdRef.current = memo.id;
    setEditingId(memo.id);
    setEditDraft({ title: memo.title, body: memo.body, tags: memo.tags });
  }, []);

  const stopEditing = useCallback(() => {
    editingIdRef.current = null;
    newMemoIdRef.current = null;
    setEditingId(null);
    setEditDraft(null);
    setSavingMemo(false);
  }, []);

  const handleDraftChange = (field: 'title' | 'body' | 'tags', value: string) => {
    setEditDraft(prev => prev ? { ...prev, [field]: value } : null);
  };

  const handleSaveEditing = useCallback(async () => {
    const id = editingIdRef.current;
    if (id === null || editDraft === null || savingMemo) return;

    setSavingMemo(true);
    try {
      const finalTags = mergeTags(
        editDraft.tags,
        inferMemoTags(editDraft.title, editDraft.body, {
          image: t.tabImage,
          email: t.tabEmail,
          path: t.tabPath,
          link: t.tabLink,
          code: t.tabCode,
        })
      );
      const hasContent = editDraft.title.trim() || editDraft.body.trim() || editDraft.tags.trim();
      if (!hasContent && newMemoIdRef.current === id) {
        await deleteMemo(id);
        setMemos(prev => prev.filter(m => m.id !== id));
        onCountChange?.(Math.max(0, memos.length - 1));
      } else {
        await updateMemo(id, editDraft.title, editDraft.body, finalTags);
        setMemos(prev => prev.map(m =>
          m.id === id ? { ...m, title: editDraft.title, body: editDraft.body, tags: finalTags } : m
        ));
      }
      stopEditing();
    } catch (err) {
      console.error('Failed to save memo:', err);
      setSavingMemo(false);
    }
  }, [editDraft, memos.length, onCountChange, savingMemo, stopEditing, t]);

  const handleCancelEditing = useCallback(async () => {
    const id = editingIdRef.current;
    if (id === null) {
      stopEditing();
      return;
    }

    try {
      if (newMemoIdRef.current === id) {
        await deleteMemo(id);
        setMemos(prev => prev.filter(m => m.id !== id));
        onCountChange?.(Math.max(0, memos.length - 1));
      }
    } catch (err) {
      console.error('Failed to cancel memo editing:', err);
    } finally {
      stopEditing();
    }
  }, [memos.length, onCountChange, stopEditing]);

  const expandMemo = useCallback((id: number) => {
    setExpandedMemoIds(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const collapseMemo = useCallback((id: number) => {
    setExpandedMemoIds(prev => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  // ─── Create new memo (toggle editor) ───────────────────────
  const handleCreate = async () => {
    try {
      // Use ref for synchronous check — state is stale during rapid clicks
      if (editingIdRef.current !== null) {
        await handleSaveEditing();
        return;
      }

      // Not editing — create new memo and start editing
      const newMemo = await createMemo('', '', '');
      setMemos(prev => [newMemo, ...prev]);
      newMemoIdRef.current = newMemo.id;
      editingIdRef.current = newMemo.id;
      startEditing(newMemo);
    } catch (err) {
      console.error('Failed to create memo:', err);
    }
  };

  // ─── Delete / Archive ──────────────────────────────────────
  const handleDelete = async (id: number) => {
    try {
      if (archiveEnabled) {
        await archiveMemo(id);
        setMemos(prev => prev.filter(m => m.id !== id));
        // Refresh archive count
        const count = await memoArchiveCount();
        onArchiveCountChange?.(count);
      } else {
        await deleteMemo(id);
      }
      if (editingId === id) {
        setEditingId(null);
        setEditDraft(null);
      }
      fetchMemos();
    } catch (err) {
      console.error('Failed to delete/archive memo:', err);
    }
  };

  // ─── Toggle pin ───────────────────────────────────────────
  const handleTogglePin = async (id: number) => {
    try {
      await toggleMemoPin(id);
      fetchMemos();
    } catch (err) {
      console.error('Failed to toggle pin:', err);
    }
  };

  // ─── Pointer-based Drag-and-drop ────────────────────────────
  const canDrag = editingId === null && searchQuery.trim() === '';
  const [dragGhostPos, setDragGhostPos] = useState<{ x: number; y: number } | null>(null);
  const [dragGhostContent, setDragGhostContent] = useState<string>('');
  const dragActiveRef = useRef(false);

  const handlePointerDown = useCallback((e: React.PointerEvent, id: number) => {
    if (!canDrag) return;
    e.preventDefault();
    e.stopPropagation();
    const memo = memos.find(m => m.id === id);
    if (!memo) return;
    dragActiveRef.current = true;
    setDraggedId(id);
    setDragGhostPos({ x: e.clientX, y: e.clientY });
    setDragGhostContent(
      memo.title || (hasMemoImage(memo.body) ? '[image]' : memo.body.slice(0, 40)) || '(untitled)'
    );
  }, [canDrag, memos]);

  useEffect(() => {
    if (draggedId === null) return;

    const onMove = (e: PointerEvent) => {
      if (!dragActiveRef.current) return;
      e.preventDefault();
      setDragGhostPos({ x: e.clientX, y: e.clientY });

      // Temporarily hide ghost to get element underneath
      const ghost = document.querySelector('.memo-drag-ghost');
      if (ghost) (ghost as HTMLElement).style.display = 'none';
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (ghost) (ghost as HTMLElement).style.display = '';

      if (el) {
        const entry = el.closest('.memo-entry[data-memo-id]');
        if (entry) {
          const targetId = Number(entry.getAttribute('data-memo-id'));
          if (targetId && targetId !== draggedId && !memos.find(m => m.id === targetId)?.pinned) {
            setDragOverId(targetId);
          } else {
            setDragOverId(null);
          }
        } else {
          setDragOverId(null);
        }
      }
    };

    const onUp = () => {
      dragActiveRef.current = false;

      setDraggedId(prevDragged => {
        setDragOverId(prevOver => {
          if (prevDragged !== null && prevOver !== null && prevDragged !== prevOver) {
            const unpinned = memos.filter(m => !m.pinned);
            const dragIdx = unpinned.findIndex(m => m.id === prevDragged);
            const dropIdx = unpinned.findIndex(m => m.id === prevOver);
            if (dragIdx !== -1 && dropIdx !== -1) {
              const reordered = [...unpinned];
              const [moved] = reordered.splice(dragIdx, 1);
              reordered.splice(dropIdx, 0, moved);

              const maxOrder = Math.max(...unpinned.map(m => m.sort_order), 0);
              const orders = reordered.map((m, i) => ({
                id: m.id,
                sort_order: maxOrder - i,
              }));

              setMemos(prev => {
                const updated = prev.map(m => {
                  const found = orders.find(o => o.id === m.id);
                  return found ? { ...m, sort_order: found.sort_order } : m;
                });
                return updated.sort((a, b) => {
                  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
                  return b.sort_order - a.sort_order;
                });
              });

              reorderMemos(orders).catch(err => {
                console.error('Reorder failed, refreshing:', err);
                fetchMemos();
              });
            }
          }
          return null; // reset dragOverId
        });
        return null; // reset draggedId
      });

      setDragGhostPos(null);
      setDragGhostContent('');
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
  }, [draggedId, memos, fetchMemos]);

  // ─── Render helpers ───────────────────────────────────────
  const pinnedMemos = memos.filter(m => m.pinned);
  const unpinnedMemos = memos.filter(m => !m.pinned);

  const renderMemoItem = (memo: Memo, draggable: boolean) => {
    const isEditing = editingId === memo.id;
    const isDragging = draggedId === memo.id;
    const isDragOver = dragOverId === memo.id;
    const isExpanded = expandedMemoIds.has(memo.id);
    const hasImages = hasMemoImage(memo.body);
    const canExpand = !isEditing && isMemoBodyCollapsible(memo.body);

    return (
      <div
        key={memo.id}
        className="memo-entry"
        data-memo-id={memo.id}
        ref={isEditing ? editingItemRef : undefined}
        style={{
          ...styles.memoItem,
          ...(isEditing ? styles.memoItemActive : {}),
          ...(isDragging ? styles.memoItemDragging : {}),
          ...(isDragOver ? { borderTop: '2px solid var(--memo-contrast)' } : {}),
          borderLeft: memo.pinned ? '3px solid var(--memo-contrast)' : '3px solid transparent',
        }}
        onClick={() => {
          if (!isEditing && canExpand && !isExpanded) expandMemo(memo.id);
        }}
      >
        <div style={styles.memoContent}>
          {/* Header row */}
          <div style={styles.memoHeader}>
            {isEditing && editDraft ? (
              <input
                style={styles.editTitle}
                value={editDraft.title}
                onChange={(e) => handleDraftChange('title', e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') void handleCancelEditing();
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void handleSaveEditing();
                }}
                placeholder={t.memoTitlePlaceholder}
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="memo-selectable" style={styles.memoTitle}>{memo.title || '(untitled)'}</span>
            )}
            <div className="memo-actions" style={styles.memoActions}>
              {/* Drag handle — always visible for unpinned items */}
              {draggable && (
                <span
                  style={{
                    ...styles.dragHandle,
                    ...(canDrag ? {} : styles.dragHandleDisabled),
                  }}
                  onPointerDown={(e) => handlePointerDown(e, memo.id)}
                >
                  {'\u2261'}
                </span>
              )}
              {/* Action buttons — CSS handles visibility on hover */}
              {!isEditing && (
                <div style={styles.hoverActions}>
                  <button
                    style={styles.actionBtn}
                    onClick={(e) => { e.stopPropagation(); startEditing(memo); }}
                    title={t.edit}
                  >
                    {'\u270E'}
                  </button>
                  <button
                    style={{
                      ...styles.actionBtn,
                      ...(memo.pinned ? styles.actionBtnActive : {}),
                    }}
                    onClick={(e) => { e.stopPropagation(); handleTogglePin(memo.id); }}
                    title={memo.pinned ? t.unpin : t.pin}
                  >
                    {'\uD83D\uDCCC'}
                  </button>
                  <button
                    style={{ ...styles.actionBtn, ...styles.deleteBtn }}
                    onClick={(e) => { e.stopPropagation(); handleDelete(memo.id); }}
                    title={archiveEnabled ? t.archiveSetting : t.delete}
                  >
                    {archiveEnabled ? '\uD83D\uDDD1\uFE0F' : <TrashIcon />}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Content area */}
          {isEditing && editDraft ? (
            <div style={styles.inlineEditor} onClick={(e) => e.stopPropagation()}>
              <MemoRichEditor
                body={editDraft.body}
                placeholder={t.memoBodyPlaceholder}
                dragLabel={t.dragToReorder}
                deleteLabel={t.delete}
                initialHeight={getMemoEditorHeight(editDraft.body)}
                onChange={(body) => handleDraftChange('body', body)}
                onEscape={() => { void handleCancelEditing(); }}
                onSave={() => { void handleSaveEditing(); }}
              />
              <input
                style={styles.editTags}
                value={editDraft.tags}
                onChange={(e) => handleDraftChange('tags', e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') void handleCancelEditing();
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void handleSaveEditing();
                }}
                placeholder={t.memoTagsPlaceholder}
              />
              <div style={styles.editActions}>
                <span style={styles.editHint}>Ctrl+Enter {t.save} / Esc {t.cancel}</span>
                <button
                  style={styles.cancelBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleCancelEditing();
                  }}
                  disabled={savingMemo}
                >
                  {t.cancel}
                </button>
                <button
                  style={{
                    ...styles.saveBtn,
                    ...(savingMemo ? styles.saveBtnDisabled : {}),
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleSaveEditing();
                  }}
                  disabled={savingMemo}
                >
                  {savingMemo ? '...' : t.save}
                </button>
              </div>
            </div>
          ) : (
            <>
              {!hasImages ? (
                <pre
                  className="memo-selectable"
                  style={{
                    ...styles.rawPreview,
                    ...(isExpanded ? styles.rawPreviewExpanded : {}),
                  }}
                  onClick={(e) => {
                    if (isExpanded) e.stopPropagation();
                  }}
                >
                  {memo.body || '\u00A0'}
                </pre>
              ) : (
                <div
                  className="memo-selectable memo-preview"
                  style={{
                    ...styles.memoPreview,
                    ...(!isExpanded ? styles.memoPreviewWithImage : {}),
                    ...(isExpanded ? styles.memoPreviewExpanded : {}),
                  }}
                  onClick={(e) => {
                    if (isExpanded) e.stopPropagation();
                  }}
                >
                  {renderMemoBody(memo.body, isExpanded ? 10000 : MEMO_COLLAPSE_TEXT_LIMIT, isExpanded ? 220 : 72)}
                </div>
              )}
              {memo.tags && (
                <div style={styles.tags}>
                  {memo.tags.split(',').filter(Boolean).map((tag, i) => (
                    <span key={i} style={styles.tag}>{tag.trim()}</span>
                  ))}
                </div>
              )}
              {/* Timestamps */}
              <div style={styles.timestampRow}>
                <span className="memo-time" style={styles.timestamp}>{formatRelativeTime(memo.created_at, t)}</span>
                {memo.updated_at && memo.updated_at !== memo.created_at && (
                  <span style={styles.editedBadge}>
                    {t.editedAt(formatRelativeTime(memo.updated_at, t))}
                  </span>
                )}
                {memo.pinned && <span style={styles.pinBadge}>{'\uD83D\uDCCC'}</span>}
                {canExpand && (
                  <button
                    style={styles.expandBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isExpanded) {
                        collapseMemo(memo.id);
                      } else {
                        expandMemo(memo.id);
                      }
                    }}
                  >
                    {isExpanded ? t.memoShowLess : t.memoShowMore}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  // ─── Empty state ──────────────────────────────────────────
  if (memos.length === 0) {
    return (
      <div style={styles.container}>
        <div style={{ padding: '8px 12px' }}>
          <button style={styles.newBtn} onClick={handleCreate}>+ {t.memoNew}</button>
        </div>
        <div style={styles.empty}>
          <span style={styles.emptyIcon}>{'\uD83D\uDCDD'}</span>
          <span style={styles.emptyText}>{t.memoEmpty}</span>
          <span style={styles.emptyHint}>{t.memoEmptyHint}</span>
        </div>
      </div>
    );
  }

  // ─── Main render ──────────────────────────────────────────
  return (
    <div style={styles.container}>
      <div style={{ padding: '8px 12px', flexShrink: 0 }}>
        <button style={styles.newBtn} onClick={handleCreate}>+ {t.memoNew}</button>
      </div>
      <div style={styles.list}>
        {pinnedMemos.map(m => renderMemoItem(m, false))}
        {unpinnedMemos.map(m => renderMemoItem(m, true))}
      </div>
      {/* Floating ghost clone that follows cursor during drag */}
      {dragGhostPos && draggedId !== null && (
        <div className="memo-drag-ghost" style={{
          position: 'fixed',
          left: dragGhostPos.x + 12,
          top: dragGhostPos.y - 12,
          pointerEvents: 'none',
          zIndex: 9999,
          background: 'var(--memo-contrast-bg, #f5f5f5)',
          border: '1px solid var(--memo-contrast)',
          borderRadius: '6px',
          padding: '6px 12px',
          fontSize: '12px',
          fontWeight: 500,
          color: 'var(--text-primary)',
          maxWidth: '200px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          opacity: 0.9,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        }}>
          {dragGhostContent}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  newBtn: {
    width: '100%',
    padding: '8px 0',
    border: '1px dashed var(--memo-contrast)',
    borderRadius: '6px',
    background: 'transparent',
    color: 'var(--memo-contrast)',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
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
    fontSize: '36px',
    opacity: 0.5,
  },
  emptyText: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    fontWeight: 500,
  },
  emptyHint: {
    fontSize: '11px',
    color: 'var(--text-muted)',
  },

  // ─── Memo item ────────────────────────────────────────────
  memoItem: {
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
    transition: 'background 0.15s ease, border-top 0.15s ease',
    userSelect: 'none' as const,
    cursor: 'default',
  },
  memoItemActive: {
    background: 'var(--memo-item-hover-bg)',
  },
  memoItemDragging: {
    opacity: 0.4,
    background: 'var(--memo-item-hover-bg)',
  },
  memoContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  memoHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    background: 'var(--memo-contrast-bg)',
    padding: '4px 6px',
    borderRadius: '4px',
    margin: '-2px -4px 2px -4px',
  },
  memoTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  memoActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flexShrink: 0,
  },

  // ─── Drag handle ──────────────────────────────────────────
  dragHandle: {
    fontSize: '14px',
    color: 'var(--text-muted)',
    opacity: 0.4,
    cursor: 'grab',
    lineHeight: 1,
    padding: '0 2px',
    userSelect: 'none' as const,
  },
  dragHandleDisabled: {
    cursor: 'default',
    opacity: 0.2,
  },

  // ─── Hover action buttons ─────────────────────────────────
  hoverActions: {
    display: 'flex',
    gap: '4px',
  },
  actionBtn: {
    border: 'none',
    background: 'transparent',
    color: 'var(--text-muted)',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '0 4px',
    lineHeight: 1,
    opacity: 0.5,
    transition: 'opacity 0.15s',
  },
  actionBtnActive: {
    opacity: 1,
    color: 'var(--memo-contrast)',
  },
  deleteBtn: {
    color: '#ef4444',
  },

  // ─── Preview (non-editing) ────────────────────────────────
  memoPreview: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    margin: 0,
    lineHeight: 1.4,
    maxHeight: '60px',
    overflow: 'hidden',
    wordBreak: 'break-word',
  },
  memoPreviewWithImage: {
    maxHeight: '96px',
  },
  memoPreviewExpanded: {
    maxHeight: 'none',
    overflow: 'visible',
  },
  rawPreview: {
    margin: 0,
    fontSize: '12px',
    lineHeight: 1.4,
    color: 'var(--text-primary)',
    fontFamily: '"Cascadia Code", "Fira Code", "Consolas", monospace',
    padding: '6px 8px',
    borderRadius: '4px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    maxHeight: '88px',
    overflowY: 'hidden',
  },
  rawPreviewExpanded: {
    maxHeight: 'none',
    overflowY: 'visible',
  },
  expandBtn: {
    border: 'none',
    background: 'transparent',
    color: 'var(--text-muted)',
    padding: 0,
    fontSize: '11px',
    fontWeight: 500,
    cursor: 'pointer',
    lineHeight: 1.2,
    marginLeft: 'auto',
  },
  tags: {
    display: 'flex',
    gap: '4px',
    flexWrap: 'wrap',
    marginTop: '2px',
  },
  tag: {
    display: 'inline-block',
    padding: '1px 6px',
    borderRadius: '8px',
    background: 'var(--memo-contrast-bg)',
    color: 'var(--memo-contrast)',
    fontSize: '10px',
    fontWeight: 500,
  },
  timestampRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: '2px',
    flexWrap: 'wrap',
  },
  timestamp: {
    fontSize: '11px',
    color: 'var(--text-muted)',
  },
  editedBadge: {
    fontSize: '10px',
    color: 'var(--memo-contrast)',
    background: 'var(--memo-contrast-bg, rgba(236,95,158,0.08))',
    padding: '1px 6px',
    borderRadius: '8px',
    fontWeight: 500,
  },
  pinBadge: {
    fontSize: '12px',
  },

  // ─── Inline editor ────────────────────────────────────────
  inlineEditor: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  editTitle: {
    border: 'none',
    outline: 'none',
    background: 'transparent',
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    padding: '4px 0',
    flex: 1,
    minWidth: 0,
  },
  editTags: {
    border: 'none',
    outline: 'none',
    background: 'transparent',
    fontSize: '11px',
    color: 'var(--memo-contrast)',
    padding: '4px 0',
  },
  editActions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '8px',
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
    background: 'var(--memo-contrast)',
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
};
