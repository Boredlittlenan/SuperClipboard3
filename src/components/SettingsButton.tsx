import { useState, useRef, useEffect, useCallback } from 'react';
import { useI18n } from '../i18n';
import type { Locale } from '../i18n/translations';
import { getAutostartEnabled, setAutostartEnabled, getShortcut, setShortcut, checkUpdate, openUrl } from '../api/settings';
import type { UpdateInfo } from '../api/settings';
import { listen } from '@tauri-apps/api/event';

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
}

export default function SettingsButton({ onShortcutChange }: SettingsButtonProps) {
  const { t, locale, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const [autostart, setAutostart] = useState(false);
  const [shortcut, setShortcutState] = useState('Ctrl+Shift+V');
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'upToDate' | 'hasUpdate' | 'failed'>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const recorderRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const keysRef = useRef<{ modifiers: Set<string>; mainKey: string | null }>({
    modifiers: new Set(),
    mainKey: null,
  });

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
    }
  }, [open]);

  // Close panel when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
        setRecording(false);
        setError('');
        setUpdateStatus('idle');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

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
      setAutostart(newValue);
    } catch (err) {
      console.error('Failed to toggle autostart:', err);
    }
  }, [autostart]);

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
        <div style={{ ...styles.panel, width: '240px' }}>
          <div style={styles.panelTitle}>{t.settings}</div>

          {/* Language section */}
          <div style={styles.section}>
            <label style={styles.label}>{t.language}</label>
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

          {/* Shortcut section */}
          <div style={{ ...styles.section, marginTop: '12px' }}>
            <label style={styles.label}>{t.shortcut}</label>
            <div style={styles.toggleRow}>
              <span style={styles.toggleLabel}>{t.shortcutDesc}</span>
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
          </div>

          {/* Autostart section */}
          <div style={{ ...styles.section, marginTop: '12px' }}>
            <label style={styles.label}>{t.autostart}</label>
            <div style={styles.toggleRow}>
              <span style={styles.toggleLabel}>{t.autostartDesc}</span>
              <button
                style={{
                  ...styles.toggle,
                  ...(autostart ? styles.toggleOn : {}),
                }}
                onClick={handleAutostartToggle}
              >
                <div
                  style={{
                    ...styles.toggleKnob,
                    ...(autostart ? styles.toggleKnobOn : {}),
                  }}
                />
              </button>
            </div>
          </div>

          {/* Check for updates section */}
          <div style={{ ...styles.section, marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
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
    width: '240px',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '12px',
    zIndex: 200,
  },
  panelTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    marginBottom: '12px',
    paddingBottom: '8px',
    borderBottom: '1px solid var(--border)',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '11px',
    fontWeight: 500,
    color: 'var(--text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  langOptions: {
    display: 'flex',
    gap: '4px',
  },
  langBtn: {
    flex: 1,
    padding: '6px 0',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  langBtnActive: {
    background: 'var(--accent)',
    borderColor: 'var(--accent)',
    color: '#ffffff',
  },
  toggleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
  },
  toggleLabel: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    flex: 1,
  },
  shortcutBtn: {
    padding: '4px 10px',
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
    borderColor: 'var(--accent)',
    color: 'var(--accent)',
    animation: 'pulse 1s infinite',
  },
  shortcutBtnError: {
    borderColor: '#e74c3c',
    color: '#e74c3c',
  },
  errorText: {
    fontSize: '10px',
    color: '#e74c3c',
    marginTop: '2px',
  },
  toggle: {
    position: 'relative',
    width: '36px',
    height: '20px',
    border: 'none',
    borderRadius: '10px',
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
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    background: '#ffffff',
    transition: 'transform 0.2s',
  },
  toggleKnobOn: {
    transform: 'translateX(16px)',
  },
  updateBtn: {
    width: '100%',
    padding: '7px 0',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    background: 'transparent',
    color: 'var(--text-primary)',
    fontSize: '12px',
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
};
