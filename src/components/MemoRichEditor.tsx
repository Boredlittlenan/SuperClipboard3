import { useCallback, useEffect, useRef } from 'react';
import type React from 'react';
import { parseMemoBody, type MemoBodyBlock } from './MemoBody';

type MemoImageElement = HTMLElement & {
  memoDataUrl?: string;
};

type DocumentWithCaretPoint = Document & {
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
};

interface Props {
  body: string;
  placeholder: string;
  dragLabel: string;
  deleteLabel: string;
  initialHeight: number;
  onChange: (body: string) => void;
  onEscape: () => void;
  onSave: () => void;
}

const trashIconSvg = `
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3 6h18"></path>
    <path d="M8 6V4h8v2"></path>
    <path d="M19 6l-1 14H6L5 6"></path>
    <path d="M10 11v5"></path>
    <path d="M14 11v5"></path>
  </svg>
`;

function appendTextBlock(blocks: MemoBodyBlock[], text: string) {
  const normalized = text.replace(/\u00A0/g, ' ');
  if (!normalized) return;
  const last = blocks[blocks.length - 1];
  if (last?.type === 'text') {
    last.text += normalized;
  } else {
    blocks.push({ type: 'text', text: normalized });
  }
}

function serializeBlocks(blocks: MemoBodyBlock[]): string {
  const hasImage = blocks.some(block => block.type === 'image');
  const text = blocks.map(block => (block.type === 'text' ? block.text : '')).join('');
  if (!hasImage && text.trim() === '') return '';

  return blocks
    .map(block => (block.type === 'text' ? block.text : `![image](${block.dataUrl})`))
    .join('');
}

function serializeEditor(editor: HTMLElement): string {
  const blocks: MemoBodyBlock[] = [];

  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      appendTextBlock(blocks, node.textContent ?? '');
      return;
    }

    if (!(node instanceof HTMLElement)) return;

    if (node.dataset.memoImage === 'true') {
      const imageNode = node as MemoImageElement;
      const dataUrl = imageNode.memoDataUrl || node.querySelector('img')?.getAttribute('src') || '';
      if (dataUrl) blocks.push({ type: 'image', dataUrl });
      return;
    }

    if (node.tagName === 'BR') {
      appendTextBlock(blocks, '\n');
      return;
    }

    Array.from(node.childNodes).forEach(visit);
  };

  Array.from(editor.childNodes).forEach(visit);
  return serializeBlocks(blocks);
}

function editorHasContent(editor: HTMLElement): boolean {
  return Boolean(
    editor.querySelector('[data-memo-image="true"]')
    || (editor.textContent ?? '').replace(/\u200B/g, '').trim()
  );
}

function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function getFilesFromDataTransfer(dataTransfer: DataTransfer): File[] {
  const files = Array.from(dataTransfer.files).filter(file => file.type.startsWith('image/'));
  if (files.length) return files;

  return Array.from(dataTransfer.items)
    .filter(item => item.type.startsWith('image/'))
    .map(item => item.getAsFile())
    .filter((file): file is File => Boolean(file));
}

export default function MemoRichEditor({
  body,
  placeholder,
  dragLabel,
  deleteLabel,
  initialHeight,
  onChange,
  onEscape,
  onSave,
}: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastRenderedBodyRef = useRef<string>('');
  const draggingImageRef = useRef<MemoImageElement | null>(null);
  const dragOverImageRef = useRef<MemoImageElement | null>(null);
  const activeDragCleanupRef = useRef<(() => void) | null>(null);

  const updateEmptyState = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.dataset.empty = editorHasContent(editor) ? 'false' : 'true';
  }, []);

  const createImageElement = useCallback((dataUrl: string): MemoImageElement => {
    const wrapper = document.createElement('span') as MemoImageElement;
    wrapper.className = 'memo-editor-image';
    wrapper.dataset.memoImage = 'true';
    wrapper.contentEditable = 'false';
    wrapper.memoDataUrl = dataUrl;

    const tools = document.createElement('span');
    tools.className = 'memo-editor-image-tools';

    const dragHandle = document.createElement('span');
    dragHandle.className = 'memo-editor-image-btn memo-editor-image-drag';
    dragHandle.dataset.memoImageDrag = 'true';
    dragHandle.title = dragLabel;
    dragHandle.textContent = '\u2261';

    const deleteButton = document.createElement('button');
    deleteButton.className = 'memo-editor-image-btn memo-editor-image-delete';
    deleteButton.dataset.memoImageDelete = 'true';
    deleteButton.type = 'button';
    deleteButton.title = deleteLabel;
    deleteButton.innerHTML = trashIconSvg;

    const image = document.createElement('img');
    image.src = dataUrl;
    image.alt = 'memo';
    image.draggable = false;

    tools.append(dragHandle, deleteButton);
    wrapper.append(tools, image);
    return wrapper;
  }, [deleteLabel, dragLabel]);

  const renderBody = useCallback((nextBody: string) => {
    const editor = editorRef.current;
    if (!editor) return;

    const fragment = document.createDocumentFragment();
    for (const block of parseMemoBody(nextBody)) {
      if (block.type === 'image') {
        fragment.appendChild(createImageElement(block.dataUrl));
      } else if (block.text) {
        fragment.appendChild(document.createTextNode(block.text));
      }
    }

    editor.replaceChildren(fragment);
    lastRenderedBodyRef.current = nextBody;
    updateEmptyState();
  }, [createImageElement, updateEmptyState]);

  const emitChange = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const nextBody = serializeEditor(editor);
    lastRenderedBodyRef.current = nextBody;
    updateEmptyState();
    onChange(nextBody);
  }, [onChange, updateEmptyState]);

  const placeCaretAfter = useCallback((node: Node) => {
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }, []);

  const getEditorRange = useCallback(() => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection) return null;

    if (selection.rangeCount > 0 && selection.anchorNode && editor.contains(selection.anchorNode)) {
      return selection.getRangeAt(0);
    }

    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    return range;
  }, []);

  const insertNodesAtSelection = useCallback((nodes: Node[]) => {
    const range = getEditorRange();
    if (!range || nodes.length === 0) return;

    range.deleteContents();
    const fragment = document.createDocumentFragment();
    for (const node of nodes) fragment.appendChild(node);
    const lastNode = nodes[nodes.length - 1];
    range.insertNode(fragment);
    placeCaretAfter(lastNode);
    emitChange();
  }, [emitChange, getEditorRange, placeCaretAfter]);

  const insertTextAtSelection = useCallback((text: string) => {
    insertNodesAtSelection([document.createTextNode(text.replace(/\r\n?/g, '\n'))]);
  }, [insertNodesAtSelection]);

  const insertImagesAtSelection = useCallback((dataUrls: string[]) => {
    const nodes = dataUrls.flatMap((dataUrl) => [
      createImageElement(dataUrl),
      document.createTextNode('\n'),
    ]);
    insertNodesAtSelection(nodes);
  }, [createImageElement, insertNodesAtSelection]);

  const setCaretFromPoint = useCallback((x: number, y: number) => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection) return;

    const doc = document as DocumentWithCaretPoint;
    let range = doc.caretRangeFromPoint?.(x, y) ?? null;
    if (!range) {
      const position = doc.caretPositionFromPoint?.(x, y);
      if (position) {
        range = document.createRange();
        range.setStart(position.offsetNode, position.offset);
        range.collapse(true);
      }
    }

    if (range && editor.contains(range.startContainer)) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }, []);

  const clearImageDrag = useCallback(() => {
    draggingImageRef.current?.classList.remove('is-dragging');
    dragOverImageRef.current?.classList.remove('is-over');
    draggingImageRef.current = null;
    dragOverImageRef.current = null;
  }, []);

  const handleImageDragMove = useCallback((event: PointerEvent) => {
    const source = draggingImageRef.current;
    if (!source) return;

    event.preventDefault();
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest('.memo-editor-image') as MemoImageElement | null;

    if (dragOverImageRef.current && dragOverImageRef.current !== target) {
      dragOverImageRef.current.classList.remove('is-over');
    }

    if (target && target !== source) {
      target.classList.add('is-over');
      dragOverImageRef.current = target;
    } else {
      dragOverImageRef.current = null;
    }
  }, []);

  const handleImageDragEnd = useCallback(() => {
    const source = draggingImageRef.current;
    const target = dragOverImageRef.current;

    if (source && target && source !== target) {
      const sourceBeforeTarget = Boolean(source.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING);
      if (sourceBeforeTarget) {
        target.after(source);
      } else {
        target.before(source);
      }
      emitChange();
    }

    clearImageDrag();
    activeDragCleanupRef.current?.();
    activeDragCleanupRef.current = null;
  }, [clearImageDrag, emitChange]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const dragHandle = target.closest('[data-memo-image-drag]');
    if (!dragHandle) return;

    const image = dragHandle.closest('.memo-editor-image') as MemoImageElement | null;
    if (!image) return;

    event.preventDefault();
    event.stopPropagation();
    activeDragCleanupRef.current?.();
    draggingImageRef.current = image;
    image.classList.add('is-dragging');

    document.addEventListener('pointermove', handleImageDragMove);
    document.addEventListener('pointerup', handleImageDragEnd);
    document.addEventListener('pointercancel', handleImageDragEnd);
    activeDragCleanupRef.current = () => {
      document.removeEventListener('pointermove', handleImageDragMove);
      document.removeEventListener('pointerup', handleImageDragEnd);
      document.removeEventListener('pointercancel', handleImageDragEnd);
    };
  }, [handleImageDragEnd, handleImageDragMove]);

  const handleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const deleteButton = target.closest('[data-memo-image-delete]');
    if (!deleteButton) return;

    event.preventDefault();
    event.stopPropagation();
    deleteButton.closest('.memo-editor-image')?.remove();
    editorRef.current?.focus();
    emitChange();
  }, [emitChange]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onEscape();
      return;
    }

    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) {
      event.preventDefault();
      onSave();
      return;
    }

    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault();
      insertTextAtSelection('\n');
    }
  }, [insertTextAtSelection, onEscape, onSave]);

  const handlePaste = useCallback((event: React.ClipboardEvent<HTMLDivElement>) => {
    const imageFiles = getFilesFromDataTransfer(event.clipboardData);
    if (imageFiles.length) {
      event.preventDefault();
      void Promise.all(imageFiles.map(readImageFile))
        .then(insertImagesAtSelection)
        .catch(err => console.error('Failed to paste memo image:', err));
      return;
    }

    const text = event.clipboardData.getData('text/plain');
    if (text) {
      event.preventDefault();
      insertTextAtSelection(text);
    }
  }, [insertImagesAtSelection, insertTextAtSelection]);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    const imageFiles = getFilesFromDataTransfer(event.dataTransfer);
    if (!imageFiles.length) return;

    event.preventDefault();
    setCaretFromPoint(event.clientX, event.clientY);
    void Promise.all(imageFiles.map(readImageFile))
      .then(insertImagesAtSelection)
      .catch(err => console.error('Failed to drop memo image:', err));
  }, [insertImagesAtSelection, setCaretFromPoint]);

  useEffect(() => {
    if (body !== lastRenderedBodyRef.current) {
      renderBody(body);
    }
  }, [body, renderBody]);

  useEffect(() => () => {
    clearImageDrag();
    activeDragCleanupRef.current?.();
    activeDragCleanupRef.current = null;
  }, [clearImageDrag]);

  return (
    <div
      ref={editorRef}
      className="memo-rich-editor memo-selectable"
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      data-placeholder={placeholder}
      data-empty="true"
      style={{ height: initialHeight }}
      onInput={emitChange}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onDrop={handleDrop}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
    />
  );
}
