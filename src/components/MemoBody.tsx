import type React from 'react';

export type MemoBodyBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; dataUrl: string };

const MEMO_IMAGE_RE = /!\[[^\]]*\]\((data:image\/[^)]+)\)/g;
const MEMO_IMAGE_TEST_RE = /!\[[^\]]*\]\(data:image\/[^)]+\)/;

export function hasMemoImage(body: string): boolean {
  return MEMO_IMAGE_TEST_RE.test(body);
}

export function parseMemoBody(body: string, includeEmptyText = false): MemoBodyBlock[] {
  const blocks: MemoBodyBlock[] = [];
  let lastIndex = 0;

  for (const match of body.matchAll(MEMO_IMAGE_RE)) {
    const fullMatch = match[0];
    const dataUrl = match[1];
    const index = match.index ?? 0;
    const text = body.slice(lastIndex, index);

    if (includeEmptyText || text) {
      blocks.push({ type: 'text', text });
    }
    blocks.push({ type: 'image', dataUrl });
    lastIndex = index + fullMatch.length;
  }

  const tail = body.slice(lastIndex);
  if (includeEmptyText || tail || blocks.length === 0) {
    blocks.push({ type: 'text', text: tail });
  }

  return blocks;
}

export function parseMemoBodyForEditing(body: string): MemoBodyBlock[] {
  const blocks = parseMemoBody(body, true);
  if (blocks.length === 0 || blocks[blocks.length - 1].type === 'image') {
    blocks.push({ type: 'text', text: '' });
  }
  return blocks;
}

export function serializeMemoBodyBlocks(blocks: MemoBodyBlock[]): string {
  return blocks
    .map((block) => (block.type === 'text' ? block.text : `\n![image](${block.dataUrl})\n`))
    .join('');
}

export function renderMemoBody(body: string, textLimit = 300, imageMaxHeight = 120): React.ReactNode {
  if (!body) return '\u00A0';

  const nodes: React.ReactNode[] = [];
  let remainingText = textLimit;
  let truncated = false;

  for (const [index, block] of parseMemoBody(body).entries()) {
    if (block.type === 'image') {
      nodes.push(
        <img
          key={`img-${index}`}
          src={block.dataUrl}
          alt="memo"
          style={{
            maxWidth: '100%',
            maxHeight: imageMaxHeight,
            borderRadius: 4,
            margin: '4px 0',
            display: 'block',
          }}
        />
      );
      continue;
    }

    if (!block.text) continue;
    if (remainingText <= 0) {
      truncated = true;
      continue;
    }

    const visibleText = block.text.slice(0, remainingText);
    remainingText -= visibleText.length;
    nodes.push(<span key={`text-${index}`}>{visibleText}</span>);
    if (block.text.length > visibleText.length) truncated = true;
  }

  if (!nodes.length) return '\u00A0';
  if (truncated || remainingText <= 0) nodes.push(<span key="ellipsis">...</span>);
  return nodes;
}
