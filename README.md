# DLMan

> A modern, open-source download manager that makes IDM obsolete.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Rust](https://img.shields.io/badge/Rust-1.75+-orange.svg)](https://www.rust-lang.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

## ✨ Features

- 🚀 **Multi-segment downloads** - Maximize your bandwidth
- ⏸️ **Pause/Resume** - Never lose progress
- 📦 **Queue management** - Organize and schedule downloads
- 🎨 **Modern UI** - Beautiful, responsive, dark/light themes
- 🖱️ **Drag & Drop** - Drop links or files anywhere
- 💻 **CLI included** - Same power from the terminal
- 🔌 **Extensible** - Plugin system (coming soon)
- 🌐 **Cross-platform** - Windows, macOS, Linux

## 📦 Installation

### Desktop App

Download from [Releases](https://github.com/novincode/dlman/releases) (coming soon)

### CLI

```bash
cargo install dlman-cli
```

## 🛠️ Development

### Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [Rust](https://rustup.rs/) 1.75+
- [pnpm](https://pnpm.io/) v8+

### Setup

```bash
# Clone the repo
git clone https://github.com/novincode/dlman.git
cd dlman

# Install dependencies
pnpm install

# Run the desktop app
pnpm dev

# Or run the CLI
cargo run -p dlman-cli -- --help
```

### Project Structure

```
dlman/
├── apps/
│   ├── desktop/     # Tauri + React app
│   └── cli/         # CLI application
├── crates/
│   ├── dlman-core/  # Core download engine
│   └── dlman-types/ # Shared types
├── docs/            # Documentation
└── README.md
```

## 🎯 Roadmap

- [x] Project setup
- [ ] Core download engine (Rust)
- [ ] Basic UI with React
- [ ] Multi-segment downloads
- [ ] Queue management
- [ ] Browser extension integration
- [ ] Plugin system

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) first.

## 📄 License

MIT © [Novin Code](https://github.com/novincode)
