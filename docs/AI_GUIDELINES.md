# AI Guidelines for DLMan

Guidelines for AI-assisted development on this project.

## Project Overview

DLMan is a cross-platform download manager:
- **Frontend:** React 18 + TypeScript + Tailwind + shadcn/ui + Zustand
- **Backend:** Tauri v2 + Rust + SQLite (sqlx)
- **Core:** `dlman-core` crate (shared between desktop and CLI)

## Key Architecture Points

### Data Storage (v1.3.0+)
- **SQLite is the single source of truth** for downloads, segments, and settings
- Queues still use JSON files
- Frontend syncs with backend on startup via `get_settings()` command

### State Flow
```
User Action → Zustand Store → Tauri Command → DlmanCore → SQLite
                                    ↓
                              Tauri Event → Zustand Store → UI Update
```

### File Organization
```
apps/desktop/src/           # React frontend
apps/desktop/src-tauri/src/ # Tauri/Rust backend
crates/dlman-core/src/      # Core engine (shared)
crates/dlman-types/src/     # Shared types
```

## Code Standards

### TypeScript
- Strict mode, no `any`
- One component per file
- Use existing shadcn/ui components

### Rust
- Use `thiserror` for errors
- No `.unwrap()` in production code
- Async with tokio

### General
- Files under 300 lines
- Events over polling
- Memoize expensive operations

## Important Files

| File | Purpose |
|------|---------|
| `commands.rs` | Tauri commands (frontend ↔ backend) |
| `dlman-core/src/lib.rs` | Core API |
| `persistence.rs` | SQLite operations |
| `stores/*.ts` | Zustand stores |

## Common Tasks

### Adding a Tauri Command
1. Add function in `commands.rs`
2. Register in `lib.rs`
3. Call from frontend with `invoke()`

### Adding a Setting
1. Add field to `Settings` struct in `dlman-types`
2. Update SQLite schema in `persistence.rs`
3. Add to settings dialog UI

### Modifying Download Logic
1. Core logic in `dlman-core/src/engine/`
2. Test with CLI first (`cargo run -p dlman-cli`)
3. Then integrate with desktop

## Don'ts

- Don't poll for updates (use Tauri events)
- Don't store settings in JSON (use SQLite)
- Don't put business logic in React components
- Don't use inline styles (use Tailwind)
