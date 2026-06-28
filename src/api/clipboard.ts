import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { ClipboardEntry, QueryFilter, Stats } from '../types';

/** Fetch clipboard entries with optional filter */
export async function getEntries(filter?: QueryFilter): Promise<ClipboardEntry[]> {
  return invoke('get_entries', { filter });
}

/** Delete a clipboard entry by ID (optionally archive instead of hard delete) */
export async function deleteEntry(id: number, archive?: boolean): Promise<boolean> {
  return invoke('delete_entry', { id, archive });
}

/** Toggle pin status of an entry */
export async function togglePin(id: number): Promise<boolean> {
  return invoke('toggle_pin', { id });
}

/** Get category statistics */
export async function getStats(): Promise<Stats> {
  return invoke('get_stats');
}

/** Clear all non-pinned entries */
export async function clearUnpinned(archive?: boolean): Promise<number> {
  return invoke('clear_unpinned', { archive });
}

/** Copy an entry back to system clipboard */
export async function copyToClipboard(id: number): Promise<boolean> {
  return invoke('copy_to_clipboard', { id });
}

/** Update a clipboard entry's content */
export async function updateEntry(id: number, content: string): Promise<boolean> {
  return invoke('update_entry', { id, content });
}

/** Archive a clipboard entry */
export async function archiveEntry(id: number): Promise<boolean> {
  return invoke('archive_entry', { id });
}

/** Unarchive (restore) a clipboard entry */
export async function unarchiveEntry(id: number): Promise<boolean> {
  return invoke('unarchive_entry', { id });
}

/** Get archived clipboard entries */
export async function getArchivedEntries(filter?: QueryFilter): Promise<ClipboardEntry[]> {
  return invoke('get_archived_entries', { filter });
}

/** Get archived entries count */
export async function archiveCount(): Promise<number> {
  return invoke('archive_count');
}

/** Permanently delete an archived entry */
export async function permanentDelete(id: number): Promise<boolean> {
  return invoke('permanent_delete', { id });
}

/** Purge archives older than specified days */
export async function purgeOldArchives(days: number): Promise<number> {
  return invoke('purge_old_archives', { days });
}

/** Listen for new clipboard events */
export function onClipboardChanged(
  callback: (entry: ClipboardEntry) => void
): Promise<() => void> {
  return listen<ClipboardEntry>('clipboard-changed', (event) => {
    callback(event.payload);
  });
}
