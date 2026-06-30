import { useState, useRef, useEffect, useCallback } from 'react';
import { useI18n } from '../i18n';
import type { Locale } from '../i18n/translations';
import { getAutostartEnabled, setAutostartEnabled, getShortcut, setShortcut, checkUpdate, openUrl, getSetting, setSetting, setAlwaysOnTop } from '../api/settings';
import type { UpdateInfo } from '../api/settings';
import type { ThemeMode } from '../types';
import { listen } from '@tauri-apps/api/event';
import { getVersion } from '@tauri-apps/api/app';

const LANGUAGES: { value: Locale; labelKey: 'langZhCN' | 'langEn' }[] = [
  { value: 'zh-CN', labelKey: 'langZhCN' },
  { value: 'en', labelKey: 'langEn' },
];

/** Convert a JS KeyboardEvent key to Tauri shortcut token */
function keyToTauri(key: string): string {
  switch (key) {
    case 'Control': return 'Ctrl';
    case 'Meta': return 'Super';
    case 'Shift': return 'Shift';
    case 'Alt': return 'Alt';
    default:
      if (key.length === 1) return key.toUpperCase();
      // F-keys, arrows, etc.
      return key;
  }
}

interface SettingsButtonProps {
  onShortcutChange?: (shortcut: string) => void;
  onMemoEnabledChange?: (enabled: boolean) => void;
  onMemoColorChange?: (color: string | null) => void;
  onRawPreviewChange?: (enabled: boolean) => void;
  onThemeModeChange?: (mode: ThemeMode) => void;
  onThemeAccentChange?: (accent: string) => void;
  onArchiveEnabledChange?: (enabled: boolean) => void;
}

export default function SettingsButton({ onShortcutChange, onMemoEnabledChange, onMemoColorChange, onRawPreviewChange, onThemeModeChange, onThemeAccentChange, onArchiveEnabledChange }: SettingsButtonProps) {
  const { t, locale, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const [autostart, setAutostart] = useState(false);
  const [memoEnabled, setMemoEnabledState] = useState(false);
  const [alwaysOnTop, setAlwaysOnTopState] = useState(false);
  const [rawPreview, setRawPreviewState] = useState(false);
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [themeAccent, setThemeAccentState] = useState('default');
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [archiveEnabled, setArchiveEnabledState] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const [memoColor, setMemoColor] = useState<string | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [hexInput, setHexInput] = useState('');
  const [shortcut, setShortcutState] = useState('Shift+C');
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'upToDate' | 'hasUpdate' | 'failed'>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const recorderRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const colorRef = useRef<HTMLDivElement>(null);
  const keysRef = useRef<{ modifiers: Set<string>; mainKey: string | null }>({
    modifiers: new Set(),
    mainKey: null,
  });

  const MEMO_PRESETS = [
    { color: '#ec5f9e', title: '樱花粉' },
    { color: '#2563eb', title: '少年蓝' },
    { color: '#8b5cf6', title: '友情紫' },
    { color: '#10b981' },
    { color: '#f59e0b' },
    { color: '#ef4444' },
    { color: '#14b8a6' },
    { color: '#6366f1' },
  ];

  // Listen for "open-settings" event from tray menu
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen('open-settings', () => {
      setOpen(true);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  // Load autostart state and shortcut when panel opens
  useEffect(() => {
    if (open) {
      getAutostartEnabled().then(setAutostart).catch(console.error);
      getShortcut().then((s) => {
        setShortcutState(s);
        onShortcutChange?.(s);
      }).catch(console.error);
      getSetting('memo_enabled').then((v) => {
        setMemoEnabledState(v === 'true');
        onMemoEnabledChange?.(v === 'true');
      }).catch(console.error);
      getSetting('always_on_top').then((v) => {
        setAlwaysOnTopState(v === null ? false : v === 'true');
      }).catch(console.error);
      getSetting('raw_preview').then((v) => {
        setRawPreviewState(v === 'true');
      }).catch(console.error);
      getSetting('theme_mode').then((v) => {
        const mode = v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
        setThemeModeState(mode);
        onThemeModeChange?.(mode);
      }).catch(console.error);
      getSetting('theme_accent').then((v) => {
        const accent = v === 'sakura' ? 'sakura' : 'default';
        setThemeAccentState(accent);
        onThemeAccentChange?.(accent);
      }).catch(console.error);
      getSetting('auto_update').then((v) => {
        setAutoUpdate(v === null ? true : v === 'true');
      }).catch(console.error);
      getSetting('archive_enabled').then((v) => {
        setArchiveEnabledState(v === 'true');
        onArchiveEnabledChange?.(v === 'true');
      }).catch(console.error);
      getSetting('memo_color').then((v) => {
        setMemoColor(v);
        setHexInput(v || '');
      }).catch(console.error);
      setShowColorPicker(false);
      getVersion().then(setAppVersion).catch(console.error);
    }
  }, [open, onMemoEnabledChange, onShortcutChange, onThemeModeChange, onThemeAccentChange, onArchiveEnabledChange]);

  // Close panel when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
        setRecording(false);
        setError('');
        setUpdateStatus('idle');
        setShowColorPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close color picker when clicking outside it (but inside the panel)
  useEffect(() => {
    if (!showColorPicker) return;
    const handler = (e: MouseEvent) => {
      if (colorRef.current && !colorRef.current.contains(e.target as Node)) {
        setShowColorPicker(false);
      }
    };
    // Delay to avoid the same click that opens it
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handler); };
  }, [showColorPicker]);

  // Keyboard capture for shortcut recording
  useEffect(() => {
    if (!recording) return;

    keysRef.current = { modifiers: new Set(), mainKey: null };

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        setRecording(false);
        setError('');
        return;
      }

      const modKeys = ['Control', 'Shift', 'Alt', 'Meta'];
      if (modKeys.includes(e.key)) {
        keysRef.current.modifiers.add(e.key);
      } else {
        keysRef.current.mainKey = e.key;
      }
    };

    const onKeyUp = async (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const { modifiers, mainKey } = keysRef.current;
      if (mainKey === null) return; // only modifier released, no main key yet

      // Build the shortcut string
      const parts: string[] = [];
      if (modifiers.has('Control')) parts.push('Ctrl');
      if (modifiers.has('Meta')) parts.push('Super');
      if (modifiers.has('Alt')) parts.push('Alt');
      if (modifiers.has('Shift')) parts.push('Shift');
      parts.push(keyToTauri(mainKey));

      if (modifiers.size === 0) {
        setError(t.shortcutInvalid);
        setRecording(false);
        return;
      }

      const combo = parts.join('+');
      try {
        const saved = await setShortcut(combo);
        setShortcutState(saved);
        onShortcutChange?.(saved);
        setError('');
      } catch (err) {
        setError(String(err));
      }
      setRecording(false);
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  }, [recording, t, onShortcutChange]);

  const handleAutostartToggle = useCallback(async () => {
    try {
      const newValue = !autostart;
      await setAutostartEnabled(newValue);
      await setSetting('autostart', newValue ? 'true' : 'false');
      setAutostart(newValue);
    } catch (err) {
      console.error('Failed to toggle autostart:', err);
    }
  }, [autostart]);

  const handleMemoToggle = useCallback(async () => {
    const newValue = !memoEnabled;
    await setSetting('memo_enabled', newValue ? 'true' : 'false');
    setMemoEnabledState(newValue);
    onMemoEnabledChange?.(newValue);
  }, [memoEnabled, onMemoEnabledChange]);

  const handleMemoColorChange = useCallback(async (color: string) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) return;
    await setSetting('memo_color', color);
    setMemoColor(color);
    setHexInput(color);
    onMemoColorChange?.(color);
  }, [onMemoColorChange]);

  const handleMemoColorReset = useCallback(async () => {
    await setSetting('memo_color', '');
    setMemoColor(null);
    setHexInput('');
    onMemoColorChange?.(null);
  }, [onMemoColorChange]);

  const handleAlwaysOnTopToggle = useCallback(async () => {
    const newValue = !alwaysOnTop;
    await setAlwaysOnTop(newValue);
    await setSetting('always_on_top', newValue ? 'true' : 'false');
    setAlwaysOnTopState(newValue);
  }, [alwaysOnTop]);

  const handleRawPreviewToggle = useCallback(async () => {
    const newValue = !rawPreview;
    await setSetting('raw_preview', newValue ? 'true' : 'false');
    setRawPreviewState(newValue);
    onRawPreviewChange?.(newValue);
  }, [rawPreview, onRawPreviewChange]);

  const handleThemeModeChange = useCallback(async (mode: ThemeMode) => {
    await setSetting('theme_mode', mode);
    setThemeModeState(mode);
    onThemeModeChange?.(mode);
  }, [onThemeModeChange]);

  const handleThemeAccentChange = useCallback(async (accent: string) => {
    await setSetting('theme_accent', accent);
    setThemeAccentState(accent);
    onThemeAccentChange?.(accent);
  }, [onThemeAccentChange]);

  const handleAutoUpdateToggle = useCallback(async () => {
    const newValue = !autoUpdate;
    await setSetting('auto_update', newValue ? 'true' : 'false');
    setAutoUpdate(newValue);
  }, [autoUpdate]);

  const handleArchiveToggle = useCallback(async () => {
    const newValue = !archiveEnabled;
    await setSetting('archive_enabled', newValue ? 'true' : 'false');
    setArchiveEnabledState(newValue);
    onArchiveEnabledChange?.(newValue);
  }, [archiveEnabled, onArchiveEnabledChange]);

  const handleCheckUpdate = useCallback(async () => {
    setUpdateStatus('checking');
    try {
      const info = await checkUpdate();
      setUpdateInfo(info);
      setUpdateStatus(info.hasUpdate ? 'hasUpdate' : 'upToDate');
    } catch (err) {
      console.error('Failed to check update:', err);
      setUpdateStatus('failed');
    }
  }, []);

  const handleDownload = useCallback(() => {
    if (updateInfo?.downloadUrl) {
      openUrl(updateInfo.downloadUrl);
    }
  }, [updateInfo]);

  return (
    <div style={styles.wrapper} ref={panelRef}>
      {/* Gear button */}
      <button
        className="settings-gear-btn"
        style={styles.gearBtn}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        title={t.settings}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {/* Settings dropdown panel */}
      {open && (
        <div style={{ ...styles.panel, width: '220px' }}>
          {/* Title row with version */}
          <div style={styles.panelTitle}>
            <span>{t.settings}</span>
            {appVersion && <span style={styles.versionBadge}>v{appVersion}</span>}
          </div>

          {/* Language section */}
          <div style={styles.section}>
            <div style={styles.langOptions}>
              {LANGUAGES.map(({ value, labelKey }) => (
                <button
                  key={value}
                  style={{
                    ...styles.langBtn,
                    ...(locale === value ? styles.langBtnActive : {}),
                  }}
                  onClick={() => setLocale(value)}
                >
                  {t[labelKey]}
                </button>
              ))}
            </div>
          </div>

          {/* System Settings header */}
          <div style={styles.sectionHeader}>{t.systemSettings}</div>

          {/* Shortcut section */}
          <div style={styles.compactRow} title={t.shortcutDesc}>
            <span style={styles.rowLabel}>{t.shortcut}</span>
            <button
              ref={recorderRef}
              style={{
                ...styles.shortcutBtn,
                ...(recording ? styles.shortcutBtnRecording : {}),
                ...(error ? styles.shortcutBtnError : {}),
              }}
              onClick={() => {
                if (!recording) {
                  setError('');
                  setRecording(true);
                }
              }}
            >
              {recording ? t.shortcutRecording : shortcut}
            </button>
          </div>
          {error && <span style={styles.errorText}>{error}</span>}

          {/* Theme mode */}
          <div style={styles.compactRow} title={t.themeModeDesc}>
            <span style={styles.rowLabel}>{t.themeMode}</span>
            <div style={styles.themeSegmented}>
              <button
                style={{
                  ...styles.themeSegBtn,
                  ...(themeMode === 'light' ? styles.themeSegBtnActive : {}),
                }}
                onClick={() => handleThemeModeChange('light')}
              >
                {t.themeLight}
              </button>
              <button
                style={{
                  ...styles.themeSegBtn,
                  ...(themeMode === 'dark' ? styles.themeSegBtnActive : {}),
                }}
                onClick={() => handleThemeModeChange('dark')}
              >
                {t.themeDark}
              </button>
              <button
                style={{
                  ...styles.themeSegBtn,
                  ...(themeMode === 'system' ? styles.themeSegBtnActive : {}),
                }}
                onClick={() => handleThemeModeChange('system')}
              >
                {t.themeSystem}
              </button>
            </div>
          </div>

          {/* Theme accent */}
          <div style={styles.compactRow} title={t.themeColorDesc}>
            <span style={styles.rowLabel}>{t.themeColor}</span>
            <div style={styles.colorOptions}>
              <button
                style={{
                  ...styles.colorBtn,
                  ...(themeAccent === 'default' ? styles.colorBtnActive : {}),
                }}
                onClick={() => handleThemeAccentChange('default')}
                title={t.themeDefault}
              >
                <span style={{ ...styles.colorSwatch, background: '#2563eb' }} />
                <span>{t.themeDefault}</span>
              </button>
              <button
                style={{
                  ...styles.colorBtn,
                  ...(themeAccent === 'sakura' ? styles.colorBtnActive : {}),
                }}
                onClick={() => handleThemeAccentChange('sakura')}
                title={t.themeSakura}
              >
                <span style={{ ...styles.colorSwatch, background: '#ec5f9e' }} />
                <span>{t.themeSakura}</span>
              </button>
            </div>
          </div>

          {/* Autostart */}
          <div style={styles.compactRow} title={t.autostartDesc}>
            <span style={styles.rowLabel}>{t.autostart}</span>
            <button
              style={{ ...styles.toggle, ...(autostart ? styles.toggleOn : {}) }}
              onClick={handleAutostartToggle}
            >
              <div style={{ ...styles.toggleKnob, ...(autostart ? styles.toggleKnobOn : {}) }} />
            </button>
          </div>

          {/* Always on top */}
          <div style={styles.compactRow} title={t.alwaysOnTopDesc}>
            <span style={styles.rowLabel}>{t.alwaysOnTop}</span>
            <button
              style={{ ...styles.toggle, ...(alwaysOnTop ? styles.toggleOn : {}) }}
              onClick={handleAlwaysOnTopToggle}
            >
              <div style={{ ...styles.toggleKnob, ...(alwaysOnTop ? styles.toggleKnobOn : {}) }} />
            </button>
          </div>

          {/* Raw preview */}
          <div style={styles.compactRow} title={t.rawPreviewDesc}>
            <span style={styles.rowLabel}>{t.rawPreview}</span>
            <button
              style={{ ...styles.toggle, ...(rawPreview ? styles.toggleOn : {}) }}
              onClick={handleRawPreviewToggle}
            >
              <div style={{ ...styles.toggleKnob, ...(rawPreview ? styles.toggleKnobOn : {}) }} />
            </button>
          </div>

          {/* Auto update */}
          <div style={styles.compactRow} title={t.autoUpdateDesc}>
            <span style={styles.rowLabel}>{t.autoUpdate}</span>
            <button
              style={{ ...styles.toggle, ...(autoUpdate ? styles.toggleOn : {}) }}
              onClick={handleAutoUpdateToggle}
            >
              <div style={{ ...styles.toggleKnob, ...(autoUpdate ? styles.toggleKnobOn : {}) }} />
            </button>
          </div>

          {/* Feature Settings header */}
          <div style={styles.sectionHeader}>{t.featureSettings}</div>

          {/* Memo */}
          <div style={styles.compactRow} title={t.memoSettingDesc}>
            <span style={styles.rowLabel}>{t.memoSetting}</span>
            <button
              style={{ ...styles.toggle, ...(memoEnabled ? styles.toggleOn : {}) }}
              onClick={handleMemoToggle}
            >
              <div style={{ ...styles.toggleKnob, ...(memoEnabled ? styles.toggleKnobOn : {}) }} />
            </button>
          </div>

          {/* Memo color picker (only when memo is enabled) */}
          {memoEnabled && (
            <div style={{ ...styles.compactRow, position: 'relative' }} title={t.memoColorDesc}>
              <span style={styles.rowLabel}>{t.memoColor}</span>
              <div ref={colorRef} style={{ position: 'relative' }}>
                <button
                  style={styles.memoColorBtn}
                  onClick={(e) => { e.stopPropagation(); setShowColorPicker(!showColorPicker); }}
                >
                  <span style={{
                    ...styles.memoColorSwatch,
                    background: memoColor || 'var(--memo-contrast)',
                  }} />
                  {memoColor && <span style={styles.memoColorResetMini} onClick={(e) => { e.stopPropagation(); handleMemoColorReset(); }}>{'\u2715'}</span>}
                </button>
                {showColorPicker && (
                  <div style={styles.colorPicker} onClick={(e) => e.stopPropagation()}>
                    <div style={styles.colorGrid}>
                      {MEMO_PRESETS.map((preset) => (
                        <button
                          key={preset.color}
                          style={{
                            ...styles.colorPreset,
                            background: preset.color,
                            ...(memoColor === preset.color ? styles.colorPresetActive : {}),
                          }}
                          title={preset.title}
                          onClick={() => handleMemoColorChange(preset.color)}
                        />
                      ))}
                    </div>
                    <div style={styles.colorInputRow}>
                      <span style={styles.colorHash}>#</span>
                      <input
                        style={styles.colorHexInput}
                        value={hexInput.replace('#', '')}
                        onChange={(e) => {
                          const val = e.target.value.replace('#', '').slice(0, 6);
                          setHexInput(val);
                          if (/^[0-9a-fA-F]{6}$/.test(val)) {
                            handleMemoColorChange('#' + val);
                          }
                        }}
                        placeholder="ec5f9e"
                        maxLength={6}
                      />
                      <button style={styles.colorResetBtn} onClick={handleMemoColorReset}>
                        {t.memoColorReset}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Archive */}
          <div style={styles.compactRow} title={t.archiveSettingDesc}>
            <span style={styles.rowLabel}>{t.archiveSetting}</span>
            <button
              style={{ ...styles.toggle, ...(archiveEnabled ? styles.toggleOn : {}) }}
              onClick={handleArchiveToggle}
            >
              <div style={{ ...styles.toggleKnob, ...(archiveEnabled ? styles.toggleKnobOn : {}) }} />
            </button>
          </div>

          {/* Divider */}
          <div style={styles.divider} />

          {/* Check for updates */}
          <div style={styles.section}>
            {updateStatus === 'idle' && (
              <button style={styles.updateBtn} onClick={handleCheckUpdate}>
                {t.checkUpdate}
              </button>
            )}
            {updateStatus === 'checking' && (
              <button style={{ ...styles.updateBtn, ...styles.updateBtnDisabled }} disabled>
                <span style={styles.spinner} />
                {t.checking}
              </button>
            )}
            {updateStatus === 'upToDate' && (
              <div style={styles.updateResult}>
                <span style={styles.updateOkIcon}>&#10003;</span>
                <span style={styles.updateOkText}>{t.upToDate}</span>
              </div>
            )}
            {updateStatus === 'hasUpdate' && updateInfo && (
              <div style={styles.updateResult}>
                <span style={styles.updateNewText}>{t.hasUpdate(updateInfo.latestVersion)}</span>
                <button style={styles.updateDownloadBtn} onClick={handleDownload}>
                  {t.downloadUpdate}
                </button>
              </div>
            )}
            {updateStatus === 'failed' && (
              <div style={styles.updateResult}>
                <span style={styles.errorText}>{t.updateFailed}</span>
                <button style={styles.updateRetryBtn} onClick={handleCheckUpdate}>
                  {t.checkUpdate}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    position: 'relative',
    zIndex: 100,
  },
  gearBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    border: 'none',
    borderRadius: '6px',
    background: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'background 0.15s, color 0.15s',
  },
  panel: {
    position: 'absolute',
    top: '36px',
    right: '0',
    width: '220px',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '10px',
    zIndex: 200,
  },
  panelTitle: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    marginBottom: '10px',
    paddingBottom: '8px',
    borderBottom: '1px solid var(--border)',
  },
  versionBadge: {
    fontSize: '10px',
    fontWeight: 500,
    color: 'var(--text-muted)',
    fontFamily: 'monospace',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  compactRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '4px 0',
  },
  rowLabel: {
    fontSize: '12px',
    color: 'var(--text-primary)',
    flex: 1,
  },
  divider: {
    height: '1px',
    background: 'var(--border)',
    margin: '6px 0',
  },
  sectionHeader: {
    fontSize: '10px',
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginTop: '6px',
    marginBottom: '2px',
    paddingBottom: '4px',
    borderBottom: '1px solid var(--border)',
  },
  langOptions: {
    display: 'flex',
    gap: '4px',
  },
  langBtn: {
    flex: 1,
    padding: '5px 0',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: '11px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  langBtnActive: {
    background: 'var(--accent)',
    border: '1px solid var(--accent)',
    color: '#ffffff',
  },
  themeSegmented: {
    display: 'flex',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    overflow: 'hidden',
    flexShrink: 0,
  },
  themeSegBtn: {
    flex: 1,
    padding: '4px 8px',
    border: 'none',
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: '10px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  },
  themeSegBtnActive: {
    background: 'var(--accent)',
    color: '#ffffff',
  },
  colorOptions: {
    display: 'flex',
    gap: '4px',
    flexShrink: 0,
  },
  colorBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 6px',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: '10px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  },
  colorBtnActive: {
    border: '1px solid var(--accent)',
    color: 'var(--accent)',
    background: 'var(--accent-bg)',
  },
  colorSwatch: {
    width: '9px',
    height: '9px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  shortcutBtn: {
    padding: '3px 8px',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    background: 'transparent',
    color: 'var(--text-primary)',
    fontSize: '11px',
    fontWeight: 600,
    fontFamily: 'monospace',
    cursor: 'pointer',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  shortcutBtnRecording: {
    border: '1px solid var(--accent)',
    color: 'var(--accent)',
    animation: 'pulse 1s infinite',
  },
  shortcutBtnError: {
    border: '1px solid #e74c3c',
    color: '#e74c3c',
  },
  errorText: {
    fontSize: '10px',
    color: '#e74c3c',
    marginTop: '2px',
  },
  toggle: {
    position: 'relative',
    width: '34px',
    height: '18px',
    border: 'none',
    borderRadius: '9px',
    background: 'var(--border)',
    cursor: 'pointer',
    padding: 0,
    transition: 'background 0.2s',
    flexShrink: 0,
  },
  toggleOn: {
    background: 'var(--accent)',
  },
  toggleKnob: {
    position: 'absolute',
    top: '2px',
    left: '2px',
    width: '14px',
    height: '14px',
    borderRadius: '50%',
    background: '#ffffff',
    transition: 'transform 0.2s',
  },
  toggleKnobOn: {
    transform: 'translateX(16px)',
  },
  updateBtn: {
    width: '100%',
    padding: '6px 0',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    background: 'transparent',
    color: 'var(--text-primary)',
    fontSize: '11px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
  },
  updateBtnDisabled: {
    opacity: 0.6,
    cursor: 'default',
  },
  spinner: {
    display: 'inline-block',
    width: '12px',
    height: '12px',
    border: '2px solid var(--border)',
    borderTopColor: 'var(--accent)',
    borderRadius: '50%',
    animation: 'spin 0.6s linear infinite',
  },
  updateResult: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
  },
  updateOkIcon: {
    color: 'var(--success)',
    fontSize: '14px',
    fontWeight: 700,
    flexShrink: 0,
  },
  updateOkText: {
    fontSize: '11px',
    color: 'var(--success)',
    flex: 1,
  },
  updateNewText: {
    fontSize: '11px',
    color: 'var(--accent)',
    fontWeight: 500,
    flex: 1,
  },
  updateDownloadBtn: {
    padding: '4px 12px',
    border: 'none',
    borderRadius: '6px',
    background: 'var(--accent)',
    color: '#ffffff',
    fontSize: '11px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.15s',
    flexShrink: 0,
  },
  updateRetryBtn: {
    padding: '4px 10px',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: '11px',
    fontWeight: 500,
    cursor: 'pointer',
    flexShrink: 0,
  },
  memoColorBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    padding: '2px',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    background: 'transparent',
    cursor: 'pointer',
    transition: 'all 0.15s',
    position: 'relative',
  },
  memoColorSwatch: {
    width: '18px',
    height: '18px',
    borderRadius: '4px',
    flexShrink: 0,
  },
  memoColorResetMini: {
    fontSize: '9px',
    color: 'var(--text-muted)',
    lineHeight: 1,
    padding: '0 2px',
  },
  colorPicker: {
    position: 'absolute',
    top: '28px',
    right: '0',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '10px',
    zIndex: 300,
    width: '180px',
  },
  colorGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '6px',
    marginBottom: '8px',
  },
  colorPreset: {
    width: '100%',
    aspectRatio: '1',
    border: '2px solid transparent',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.15s',
    padding: 0,
  },
  colorPresetActive: {
    border: '2px solid var(--text-primary)',
  },
  colorInputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  colorHash: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    fontFamily: 'monospace',
  },
  colorHexInput: {
    flex: 1,
    padding: '3px 4px',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    background: 'var(--bg)',
    color: 'var(--text-primary)',
    fontSize: '11px',
    fontFamily: 'monospace',
    outline: 'none',
    minWidth: 0,
  },
  colorResetBtn: {
    padding: '3px 8px',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: '10px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
};
