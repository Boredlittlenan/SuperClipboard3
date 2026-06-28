import { invoke } from '@tauri-apps/api/core';
import type { Memo, MemoFilter } from '../types';

export async function getMemos(filter?: MemoFilter): Promise<Memo[]> {
  return invoke('get_memos', { filter });
}

export async function createMemo(title: string, body: string, tags: string): Promise<Memo> {
  return invoke('create_memo', { title, body, tags });
}

export async function updateMemo(id: number, title: string, body: string, tags: string): Promise<boolean> {
  return invoke('update_memo', { id, title, body, tags });
}

export async function deleteMemo(id: number, archive?: boolean): Promise<boolean> {
  return invoke('delete_memo', { id, archive });
}

export async function toggleMemoPin(id: number): Promise<boolean> {
  return invoke('toggle_memo_pin', { id });
}

export async function memoCount(): Promise<number> {
  return invoke('memo_count');
}

export async function reorderMemos(orders: Array<{ id: number; sort_order: number }>): Promise<void> {
  await invoke('reorder_memos', { orders });
}

export async function archiveMemo(id: number): Promise<boolean> {
  return invoke('archive_memo', { id });
}

export async function unarchiveMemo(id: number): Promise<boolean> {
  return invoke('unarchive_memo', { id });
}

export async function getArchivedMemos(filter?: MemoFilter): Promise<Memo[]> {
  return invoke('get_archived_memos', { filter });
}

export async function memoArchiveCount(): Promise<number> {
  return invoke('memo_archive_count');
}

export async function permanentDeleteMemo(id: number): Promise<boolean> {
  return invoke('permanent_delete_memo', { id });
}

export async function purgeOldMemoArchives(days: number): Promise<number> {
  return invoke('purge_old_memo_archives', { days });
}
