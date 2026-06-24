# SuperClipboard3

[中文文档](README.zh-CN.md)

A lightweight clipboard manager built with Rust + Tauri + React + TypeScript.

## Features

- Smart categorization: automatically classifies clipboard content (text, links, images, code, emails, file paths)
- Real-time clipboard monitoring with SHA-256 deduplication
- SQLite storage with indexed queries for fast search
- Pin important entries, one-click copy back to clipboard
- Memo / quick notes: independent tab for jotting down ideas, with title, body, tags, search, pin, and auto-save
- Global shortcut to show/hide window (default: Shift+V, customizable in settings)
- Always-on-top toggle (default: on) to keep the window above others
- System tray with context menu (open settings, quit app)
- Auto dark/light theme
- Settings panel with language switching (Chinese / English)
- Auto-start on system boot (Windows registry)
- User preferences persisted in SQLite
- Horizontally scrollable tab bar (mouse wheel supported)
- Database size display in footer
- Clipboard content editing: inline edit with original content preservation and collapsible diff view
- Raw preview toggle: view clipboard content in monospace full format without truncation
- Auto-update check on startup toggle (configurable in settings)
- Improved time display: entries older than 24h show concrete date/time (e.g. "6/24 15:30")
- Compact settings panel with hover tooltips for each option
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
    lib.rs          # Tauri commands & app setup
    main.rs         # Entry point
src/
  components/       # React UI components
    SettingsButton.tsx  # Settings panel (language, shortcut, autostart, always-on-top, memo)
    MemoList.tsx        # Inline memo list with CRUD, auto-save, pin
  api/              # Tauri command wrappers
    clipboard.ts    # Clipboard API
    settings.ts     # Settings API
    memos.ts        # Memo CRUD API
  i18n/             # Internationalization (translations + context)
  types/            # TypeScript type definitions
```

## Roadmap

- [ ] **Virtual Scrolling**: When clipboard entries accumulate to thousands, the current `.map()` full-render approach creates excessive DOM nodes and causes scroll jank. Introduce a virtual list (e.g. `@tanstack/react-virtual` or `react-window`) to render only visible items, keeping render cost constant, and support infinite scroll for history browsing.
