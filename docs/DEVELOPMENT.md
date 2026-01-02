# Development Guide

## Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [Rust](https://rustup.rs/) 1.75+
- [pnpm](https://pnpm.io/) v9+

## Setup

```bash
git clone https://github.com/novincode/dlman.git
cd dlman
pnpm install
```

## Running

```bash
# Desktop app (dev mode)
pnpm tauri dev

# CLI
cargo run -p dlman-cli -- --help

# Build release
pnpm tauri build
```

## Project Structure

```
dlman/
├── apps/
│   ├── desktop/          # Tauri + React app
│   │   ├── src/          # React frontend
│   │   └── src-tauri/    # Rust backend
│   └── cli/              # CLI application
├── crates/
│   ├── dlman-core/       # Core download engine
│   └── dlman-types/      # Shared types
└── docs/                 # Documentation
```

## Tech Stack

**Frontend:** React 18, TypeScript, Tailwind CSS, shadcn/ui, Zustand

**Backend:** Tauri v2, Rust, tokio, reqwest, SQLite (sqlx)

## Roadmap

- [x] Multi-segment parallel downloads
- [x] Queue management with speed limits
- [x] SQLite-based persistence
- [x] Per-download speed limits
- [x] Auto-retry failed downloads
- [ ] Browser extension
- [ ] Plugin system
- [ ] Scheduled downloads
- [ ] Torrent support

## Code Style

- TypeScript: strict mode, no `any`
- Rust: standard clippy lints
- Files < 300 lines preferred
- One component per file

## Testing

```bash
# Rust tests
cargo test

# Type check frontend
cd apps/desktop && pnpm tsc --noEmit
```

## Submitting Changes

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a PR

## Docs

- [Architecture](ARCHITECTURE.md) — System design
- [Core Engine](CORE.md) — Download engine internals
- [CLI](CLI.md) — CLI documentation
- [AI Guidelines](AI_GUIDELINES.md) — For AI-assisted development
