# SuperClipboard3

[中文文档](README.zh-CN.md)

A lightweight clipboard manager built with Rust + Tauri + React + TypeScript.

## Features

- Smart categorization: automatically classifies clipboard content (text, links, images, code, emails, file paths)
- Real-time clipboard monitoring with SHA-256 deduplication
- SQLite storage with indexed queries for fast search
- Pin important entries, one-click copy back to clipboard
- Global shortcut to show/hide window (customizable in settings)
- System tray with context menu (open settings, quit app)
- Auto dark/light theme
- Settings panel with language switching (Chinese / English)
- Auto-start on system boot (Windows registry)
- User preferences persisted in SQLite
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
    storage.rs      # SQLite storage layer (entries + settings)
    autostart.rs    # Auto-start on boot (Windows registry)
    lib.rs          # Tauri commands & app setup
    main.rs         # Entry point
src/
  components/       # React UI components
    SettingsButton.tsx  # Settings panel (language, shortcut, autostart)
  api/              # Tauri command wrappers
  i18n/             # Internationalization (translations + context)
  types/            # TypeScript type definitions
```

## Roadmap

- [ ] **Virtual Scrolling**: When clipboard entries accumulate to thousands, the current `.map()` full-render approach creates excessive DOM nodes and causes scroll jank. Introduce a virtual list (e.g. `@tanstack/react-virtual` or `react-window`) to render only visible items, keeping render cost constant, and support infinite scroll for history browsing.
