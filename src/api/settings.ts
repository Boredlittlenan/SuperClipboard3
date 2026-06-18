import { invoke } from '@tauri-apps/api/core';

/** Get a user setting value by key */
export async function getSetting(key: string): Promise<string | null> {
  return invoke('get_setting', { key });
}

/** Set a user setting value */
export async function setSetting(key: string, value: string): Promise<void> {
  return invoke('set_setting', { key, value });
}

/** Check if auto-start on boot is enabled */
export async function getAutostartEnabled(): Promise<boolean> {
  return invoke('get_autostart_enabled');
}

/** Enable or disable auto-start on boot */
export async function setAutostartEnabled(enabled: boolean): Promise<boolean> {
  return invoke('set_autostart_enabled', { enabled });
}

/** Get the current global shortcut */
export async function getShortcut(): Promise<string> {
  return invoke('get_shortcut');
}

/** Set a new global shortcut */
export async function setShortcut(shortcut: string): Promise<string> {
  return invoke('set_shortcut', { newShortcut: shortcut });
}

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  downloadUrl: string;
  hasUpdate: boolean;
}

/** Check for updates from GitHub Releases */
export async function checkUpdate(): Promise<UpdateInfo> {
  return invoke('check_update');
}

/** Open a URL in the system default browser */
export async function openUrl(url: string): Promise<void> {
  return invoke('open_url', { url });
}
