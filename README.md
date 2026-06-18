# SuperClipboard3

A lightweight clipboard manager built with Rust + Tauri + React + TypeScript.

## Features

- Smart categorization: automatically classifies clipboard content (text, links, images, code, emails, file paths)
- Real-time clipboard monitoring with SHA-256 deduplication
- SQLite storage with indexed queries for fast search
- Pin important entries, one-click copy back to clipboard
- Global shortcut (Ctrl+Shift+V) to show/hide window
- System tray integration
- Auto dark/light theme

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
    storage.rs      # SQLite storage layer
    lib.rs          # Tauri commands & app setup
    main.rs         # Entry point
src/
  components/       # React UI components
  api/              # Tauri command wrappers
  types/            # TypeScript type definitions
```
