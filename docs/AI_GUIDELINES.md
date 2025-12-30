# AI Development Guidelines for DLMan

## 🎯 Project Context

DLMan is a modern, open-source download manager built with:
- **Tauri v2** - Desktop framework (Rust + Web)
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **shadcn/ui** - Component library
- **Zustand** - State management
- **Framer Motion** - Animations
- **@dnd-kit** - Drag and drop

## 📋 Core Principles

### 1. Performance is Non-Negotiable
- Rust for ALL download logic (never JavaScript)
- Events over polling (Tauri event system)
- Virtual scrolling for long lists
- Lazy load dialogs and heavy components
- Memoize expensive computations

### 2. Type Safety Everywhere
- TypeScript strict mode (no `any`)
- Rust's type system for backend
- Shared types between frontend/backend
- Validate at boundaries

### 3. Keep It Modular
- Files under 300 lines
- One component per file
- Extract reusable hooks
- Separate concerns clearly

### 4. Consistent Code Style
```typescript
// Components: PascalCase
export const DownloadItem = () => {}

// Hooks: camelCase with 'use' prefix
export const useDownloads = () => {}

// Utils: camelCase
export const formatBytes = () => {}

// Types: PascalCase
export interface Download {}

// Constants: SCREAMING_SNAKE_CASE
export const MAX_CONCURRENT_DOWNLOADS = 8
```

## 🏗️ Architecture Rules

### Frontend Structure
```
src/
├── components/
│   ├── ui/           # shadcn components (don't modify)
│   ├── layout/       # Layout components
│   ├── dialogs/      # Modal dialogs
│   ├── sidebar/      # Sidebar components
│   └── downloads/    # Download-related
├── stores/           # Zustand stores
├── hooks/            # Custom hooks
├── lib/              # Utilities
├── types/            # TypeScript types
└── styles/           # Global CSS
```

### Component Guidelines
```typescript
// ✅ Good: Small, focused component
export const DownloadProgress: React.FC<{
  progress: number;
  speed: number;
}> = ({ progress, speed }) => {
  return (
    <div className="flex items-center gap-2">
      <Progress value={progress} />
      <span>{formatSpeed(speed)}</span>
    </div>
  );
};

// ❌ Bad: Doing too much
export const DownloadItem = () => {
  // 500 lines of mixed concerns
};
```

### State Management
```typescript
// ✅ Good: Focused store with actions
export const useDownloadStore = create<DownloadStore>((set, get) => ({
  downloads: [],
  
  addDownload: (download) => 
    set((state) => ({ 
      downloads: [...state.downloads, download] 
    })),
    
  updateProgress: (id, progress) =>
    set((state) => ({
      downloads: state.downloads.map((d) =>
        d.id === id ? { ...d, progress } : d
      ),
    })),
}));

// ❌ Bad: One giant store with everything
export const useStore = create(() => ({
  downloads: [],
  queues: [],
  settings: {},
  ui: {},
  // 50 more properties...
}));
```

### Tauri Commands
```typescript
// Always wrap Tauri commands in typed functions
import { invoke } from "@tauri-apps/api/core";

export async function addDownload(
  url: string,
  destination: string,
  queueId: string
): Promise<Download> {
  return invoke("add_download", { url, destination, queueId });
}

// Use in components via hooks
export function useAddDownload() {
  const addToStore = useDownloadStore((s) => s.addDownload);
  
  return useMutation({
    mutationFn: addDownload,
    onSuccess: (download) => addToStore(download),
  });
}
```

## 🎨 UI/UX Guidelines

### Styling
```typescript
// ✅ Use CSS variables for theming
className="bg-background text-foreground"

// ✅ Use Tailwind utilities
className="flex items-center gap-2 p-4 rounded-lg"

// ❌ Avoid inline styles
style={{ display: 'flex' }}

// ❌ Avoid arbitrary values when possible
className="mt-[23px]"
```

### Animations
```typescript
// ✅ Use Framer Motion for complex animations
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: -20 }}
/>

// ✅ Use Tailwind for simple transitions
className="transition-colors hover:bg-accent"

// ❌ Don't animate everything
// Only animate meaningful state changes
```

### Accessibility
```typescript
// ✅ Always include aria labels
<Button aria-label="Add new download">
  <PlusIcon />
</Button>

// ✅ Support keyboard navigation
<div role="listbox" tabIndex={0} onKeyDown={handleKeyDown}>

// ✅ Use semantic HTML
<nav>, <main>, <aside>, <article>
```

## 🔧 Rust Guidelines

### Error Handling
```rust
// ✅ Use Result with thiserror
#[derive(Debug, thiserror::Error)]
pub enum DownloadError {
    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),
}

pub async fn download(url: &str) -> Result<(), DownloadError> {
    // ...
}

// ❌ Don't panic in library code
panic!("Something went wrong");

// ❌ Don't use unwrap in production
let data = response.unwrap();
```

### Async Patterns
```rust
// ✅ Use tokio for async
use tokio::sync::mpsc;

pub async fn download_with_progress(
    url: &str,
    progress_tx: mpsc::Sender<Progress>,
) -> Result<()> {
    // Stream the download
    // Send progress updates
}

// ✅ Cancel downloads gracefully
use tokio_util::sync::CancellationToken;

pub async fn download(
    url: &str,
    cancel_token: CancellationToken,
) -> Result<()> {
    tokio::select! {
        result = do_download(url) => result,
        _ = cancel_token.cancelled() => {
            // Clean up partial download
            Ok(())
        }
    }
}
```

### Tauri Commands
```rust
// ✅ Return serializable types
#[tauri::command]
async fn add_download(
    url: String,
    destination: String,
    state: tauri::State<'_, AppState>,
) -> Result<Download, String> {
    state.core
        .add_download(&url, &destination)
        .await
        .map_err(|e| e.to_string())
}

// ✅ Use events for progress
use tauri::Emitter;

fn emit_progress(app: &tauri::AppHandle, progress: Progress) {
    app.emit("download-progress", progress).ok();
}
```

## 🚫 Common Mistakes to Avoid

### Don't
- Use `any` type in TypeScript
- Put business logic in components
- Make files longer than 300 lines
- Forget error boundaries
- Poll for updates (use events)
- Skip loading/error states
- Hardcode colors (use CSS variables)
- Ignore accessibility
- Over-engineer early

### Do
- Start simple, iterate
- Write tests for core logic
- Use existing libraries
- Follow established patterns
- Ask for clarification when unsure

## 📚 Reference Files

When working on DLMan, reference these files:
- `docs/ARCHITECTURE.md` - System design
- `docs/VISION.md` - Project goals
- `apps/desktop/src/types/` - Type definitions
- `crates/dlman-core/src/lib.rs` - Core API

## 🔄 Development Workflow

1. **Understand the task** - Read related docs/code
2. **Plan the approach** - Consider architecture impact
3. **Implement incrementally** - Small, tested changes
4. **Follow patterns** - Match existing code style
5. **Test thoroughly** - Both happy and error paths
6. **Document changes** - Update docs if needed

## 💡 Tips for Effective AI Collaboration

When prompting AI for DLMan:

1. **Be specific**: "Add pause button to DownloadItem" not "make it better"
2. **Provide context**: Mention relevant files and current state
3. **Ask for explanations**: Understand the "why" not just "what"
4. **Request alternatives**: "What are the trade-offs?"
5. **Iterate**: Break big changes into smaller steps
