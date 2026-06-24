import { useState, useEffect, useCallback, useRef } from 'react';
import type { Memo } from '../types';
import { getMemos, createMemo, updateMemo, deleteMemo, toggleMemoPin } from '../api/memos';
import { useI18n } from '../i18n';
import { TrashIcon } from './icons/TrashIcon';

interface Props {
  searchQuery: string;
  onCountChange?: (count: number) => void;
}

export default function MemoList({ searchQuery, onCountChange }: Props) {
  const { t } = useI18n();
  const [memos, setMemos] = useState<Memo[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editTags, setEditTags] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const editorRef = useRef<HTMLDivElement>(null);
  const editingIdRef = useRef<number | null>(null);
  editingIdRef.current = editingId;
  // Prevents stale async fetches from overwriting a newer editor selection
  const clickSeqRef = useRef(0);

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

  // Read values directly from DOM — always fresh
  const readEditorValues = () => {
    if (!editorRef.current) return { title: editTitle, body: editBody, tags: editTags };
    const inputs = editorRef.current.querySelectorAll('input');
    const textarea = editorRef.current.querySelector('textarea');
    return {
      title: inputs[0]?.value ?? '',
      body: textarea?.value ?? '',
      tags: inputs[1]?.value ?? '',
    };
  };

  // Instant save — fires on every keystroke
  const saveNow = useCallback(async () => {
    const id = editingIdRef.current;
    if (id === null) return;
    const { title, body, tags } = readEditorValues();
    try {
      await updateMemo(id, title, body, tags);
    } catch (err) {
      console.error('Failed to save memo:', err);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch editor to a memo, ALWAYS loading fresh data from DB
  const handleMemoClick = async (memo: Memo) => {
    if (editingIdRef.current === memo.id) return;

    // 1. Save current memo's latest DOM values
    if (editingIdRef.current !== null) {
      const id = editingIdRef.current;
      const vals = readEditorValues();
      await updateMemo(id, vals.title, vals.body, vals.tags).catch(console.error);
    }

    // 2. Fetch fresh list from DB — preserving current visual order
    const seq = ++clickSeqRef.current;
    try {
      const filter = searchQuery.trim()
        ? { search: searchQuery.trim(), limit: 100 }
        : { limit: 100 };
      const freshList = await getMemos(filter);

      if (clickSeqRef.current === seq) {
        // Preserve current visual order: use current order as reference,
        // only insert genuinely new memos at the top
        const currentIds = new Set(memos.map(m => m.id));
        const freshMap = new Map(freshList.map(m => [m.id, m]));
        const newMemos = freshList.filter(m => !currentIds.has(m.id));
        const preserved = memos
          .filter(m => freshMap.has(m.id))
          .map(m => freshMap.get(m.id)!);
        setMemos([...newMemos, ...preserved]);

        const fresh = freshMap.get(memo.id);
        if (fresh) {
          setIsCreating(false);
          setEditingId(fresh.id);
          setEditTitle(fresh.title);
          setEditBody(fresh.body);
          setEditTags(fresh.tags);
        }
      }
    } catch (err) {
      console.error('Failed to fetch memos:', err);
    }
  };

  const handleCreate = () => {
    // Save current editing memo first
    if (editingIdRef.current !== null) {
      const id = editingIdRef.current;
      const vals = readEditorValues();
      updateMemo(id, vals.title, vals.body, vals.tags).catch(console.error);
    }
    ++clickSeqRef.current; // invalidate any pending fetch
    setIsCreating(true);
    setEditingId(null);
    setEditTitle('');
    setEditBody('');
    setEditTags('');
  };

  const handleSaveNew = async () => {
    const { title, body, tags } = readEditorValues();
    if (!title.trim() && !body.trim()) {
      setIsCreating(false);
      return;
    }
    try {
      await createMemo(title.trim(), body.trim(), tags.trim());
      setIsCreating(false);
      setEditTitle('');
      setEditBody('');
      setEditTags('');
      fetchMemos();
    } catch (err) {
      console.error('Failed to create memo:', err);
    }
  };

  const handleCreateFieldBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!isCreating) return;

    const nextFocused = e.relatedTarget;
    if (nextFocused instanceof Node && editorRef.current?.contains(nextFocused)) {
      return;
    }

    handleSaveNew();
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteMemo(id);
      if (editingIdRef.current === id) {
        setEditingId(null);
        setIsCreating(false);
      }
      fetchMemos();
    } catch (err) {
      console.error('Failed to delete memo:', err);
    }
  };

  const handleTogglePin = async (id: number) => {
    try {
      await toggleMemoPin(id);
      fetchMemos();
    } catch (err) {
      console.error('Failed to toggle memo pin:', err);
    }
  };

  // onChange: update React state for controlled inputs + save to DB immediately
  const onFieldChange = (setter: (v: string) => void) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setter(e.target.value);
      saveNow();
    };

  const editor = (isCreating || editingId !== null) ? (
    <div ref={editorRef} style={styles.editor}>
      <input
        style={styles.editorTitle}
        placeholder={t.memoTitlePlaceholder}
        value={editTitle}
        onChange={onFieldChange(setEditTitle)}
        onBlur={handleCreateFieldBlur}
        autoFocus
      />
      <textarea
        style={styles.editorBody}
        placeholder={t.memoBodyPlaceholder}
        value={editBody}
        onChange={onFieldChange(setEditBody)}
        onBlur={handleCreateFieldBlur}
        rows={4}
      />
      <input
        style={styles.editorTags}
        placeholder={t.memoTagsPlaceholder}
        value={editTags}
        onChange={onFieldChange(setEditTags)}
        onBlur={handleCreateFieldBlur}
      />
    </div>
  ) : null;

  if (memos.length === 0 && !isCreating) {
    return (
      <div style={styles.container}>
        <div style={{ padding: '8px 12px' }}>
          <button style={styles.newBtn} onClick={handleCreate}>+ {t.memoNew}</button>
        </div>
        {editor}
        <div style={styles.empty}>
          <span style={styles.emptyIcon}>{'\uD83D\uDCDD'}</span>
          <span style={styles.emptyText}>{t.memoEmpty}</span>
          <span style={styles.emptyHint}>{t.memoEmptyHint}</span>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={{ padding: '8px 12px', flexShrink: 0 }}>
        <button style={styles.newBtn} onClick={handleCreate}>+ {t.memoNew}</button>
      </div>
      {editor}
      <div style={styles.list}>
        {memos.map((memo) => (
          <div
            key={memo.id}
            style={{
              ...styles.memoItem,
              ...(editingId === memo.id ? styles.memoItemActive : {}),
              borderLeft: memo.pinned ? '3px solid var(--accent)' : '3px solid transparent',
            }}
            onClick={() => handleMemoClick(memo)}
          >
            <div style={styles.memoContent}>
              <div style={styles.memoHeader}>
                <span style={styles.memoTitle}>{memo.title || '(untitled)'}</span>
                <div style={styles.memoActions}>
                  <button
                    style={{
                      ...styles.actionBtn,
                      ...(memo.pinned ? styles.actionBtnActive : {}),
                    }}
                    onClick={(e) => { e.stopPropagation(); handleTogglePin(memo.id); }}
                    title="Pin"
                  >
                    {'\uD83D\uDCCC'}
                  </button>
                  <button
                    style={styles.actionBtn}
                    onClick={(e) => { e.stopPropagation(); handleDelete(memo.id); }}
                    title={t.delete}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
              <p style={styles.memoPreview}>
                {memo.body.length > 100 ? memo.body.slice(0, 100) + '...' : memo.body || '\u00A0'}
              </p>
              {memo.tags && (
                <div style={styles.tags}>
                  {memo.tags.split(',').filter(Boolean).map((tag, i) => (
                    <span key={i} style={styles.tag}>{tag.trim()}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
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
  editor: {
    padding: '8px 12px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--surface)',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    flexShrink: 0,
  },
  editorTitle: {
    border: 'none',
    outline: 'none',
    background: 'transparent',
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    padding: '4px 0',
  },
  editorBody: {
    border: 'none',
    outline: 'none',
    background: 'transparent',
    fontSize: '12px',
    color: 'var(--text-primary)',
    resize: 'none' as const,
    fontFamily: 'inherit',
    padding: '4px 0',
    lineHeight: 1.5,
  },
  editorTags: {
    border: 'none',
    outline: 'none',
    background: 'transparent',
    fontSize: '11px',
    color: '#8b5cf6',
    padding: '4px 0',
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
  memoItem: {
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
    cursor: 'pointer',
    transition: 'background 0.1s',
  },
  memoItemActive: {
    background: 'var(--hover-bg)',
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
    gap: '4px',
    flexShrink: 0,
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
    color: 'var(--accent)',
  },
  memoPreview: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    margin: 0,
    lineHeight: 1.4,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
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
    background: 'var(--hover-bg)',
    color: 'var(--accent)',
    fontSize: '10px',
    fontWeight: 500,
  },
};
