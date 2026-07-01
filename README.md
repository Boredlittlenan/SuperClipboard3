# SuperClipboard

[中文文档](README.zh-CN.md)

A lightweight clipboard manager built with Rust + Tauri + React + TypeScript.
Chinese display name: `超级剪贴板`.

## Features

- Smart categorization: automatically classifies clipboard content (text, links, images, code, emails, file paths)
- Real-time clipboard monitoring with SHA-256 deduplication
- SQLite storage with indexed queries for fast search
- Pin important entries, one-click copy back to clipboard
- Memo / quick notes: independent tab for title, body, tags, search, pin, and auto-save; disabled by default and available from settings
- Global shortcut to show/hide window (default: Alt+X, customizable in settings)
- Always-on-top toggle (default: off) to keep the window above others when enabled
- System tray with context menu (open settings, quit app)
- Single-instance launch: repeated shortcut/icon launches focus the existing app instead of creating duplicate tray icons
- Theme mode follows the system by default, with Light / Dark / Auto segmented switching
- Settings panel with language switching (Chinese / English); first launch follows the system language
- Auto-start on system boot (Windows registry)
- User preferences persisted in SQLite
- Horizontally scrollable tab bar (mouse wheel supported)
- Separate storage display in footer: memo tab shows memo content size, clipboard tabs show clipboard content size
- Memo image paste: paste images (Ctrl+V) into memo body and render them directly in preview without showing base64 text
- Clipboard content editing: inline edit with original content preservation and collapsible diff view
- Raw preview toggle: view clipboard content in monospace full format without truncation; memos always use formatted preview
- Auto-update check on startup toggle, enabled by default
- Improved time display: entries older than 24h show concrete date/time (e.g. "6/24 15:30")
- Compact settings panel with hover tooltips for each option
- 3-way theme toggle (Light / Dark / Auto) in a single segmented button
- Memo module with independent visual styling; its initial color is `#3f3f3f` and does not follow the app accent
- Custom memo color: 8 presets + HEX input, independent of theme
- Recycle Bin: soft-delete with Recycle Bin tab split into "Clipboard" and "Memos" sub-tabs, 30-day auto-purge; disabled by default
- Recycle Bin countdown: shows days remaining before auto-deletion with yellow badge
- Window position: the app starts at the same default position used by tray context menu > Settings; shortcut and tray-left-click restores keep the user's current dragged position
- Paste to active window: click an entry after shortcut-open to auto-hide and simulate Ctrl+V paste
- Memo drag-and-drop reordering: Pointer Events implementation, reliable in Tauri WebView2
- App rename migration: `SuperClipboard3` data is migrated automatically to `SuperClipboard`
- Title easter egg: double-click the title to restore, triple-click for `小楠の剪贴板`, five-click for `瑛楠の剪贴板`
- One-click update check via GitHub Releases

## Tech Stack

- **Backend**: Rust, Tauri v2, SQLite (rusqlite), arboard
- **Frontend**: React 19, TypeScript, Vite 8
- **Storage**: SQLite with content hashing for deduplication

## Development

```bash
# Install dependencies
pnpm install

# Run in dev mode
pnpm tauri:dev

# Build for production
pnpm tauri:build
```

## Project Structure

```
src-tauri/
  src/
    clipboard.rs    # Clipboard monitoring service
    classifier.rs   # Content type classification
    storage.rs      # SQLite storage layer (entries + memos + settings)
    autostart.rs    # Auto-start on boot (Windows registry)
    window_position.rs # Default settings-entry positioning with work-area clamping
    lib.rs          # Tauri commands & app setup
    main.rs         # Entry point
src/
  components/       # React UI components
    icons/              # Shared icon components (TrashIcon)
    SettingsButton.tsx  # Settings panel (language, shortcut, autostart, always-on-top, memo)
    MemoList.tsx        # Inline memo list with CRUD, auto-save, pin, reorder
    MemoRichEditor.tsx  # Rich memo editor with image blocks
    MemoBody.tsx        # Memo preview renderer
  api/              # Tauri command wrappers
    clipboard.ts    # Clipboard API
    settings.ts     # Settings API
    memos.ts        # Memo CRUD API
  i18n/             # Internationalization (translations + context)
  types/            # TypeScript type definitions
```

## Roadmap

- [ ] **Virtual Scrolling**: When clipboard entries accumulate to thousands, the current `.map()` full-render approach creates excessive DOM nodes and causes scroll jank. Introduce a virtual list (e.g. `@tanstack/react-virtual` or `react-window`) to render only visible items, keeping render cost constant, and support infinite scroll for history browsing.
- [ ] **Window Follow / Save Position**: Save Position and caret Follow Mode are paused for now and should be redesigned before being exposed again.
