# DLMan

> A modern, open-source download manager that makes IDM obsolete.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/novincode/dlman)](https://github.com/novincode/dlman/releases)
[![Rust](https://img.shields.io/badge/Rust-1.75+-orange.svg)](https://www.rust-lang.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

## ✨ Features

- 🚀 **Multi-segment downloads** - Maximize your bandwidth with parallel connections
- ⏸️ **Pause/Resume** - Never lose progress
- 📦 **Queue management** - Organize downloads with speed limits and scheduling
- 🎛️ **Per-download controls** - Override queue settings for individual downloads
- 🎨 **Modern UI** - Beautiful, responsive, dark/light themes
- 🖱️ **Drag & Drop** - Drop links or files anywhere
- 💻 **CLI included** - Same power from the terminal
- 📊 **Segment visualization** - See each connection's progress
- 🌐 **Cross-platform** - Windows, macOS, Linux

## 📦 Installation

### Desktop App

Download the latest version from [Releases](https://github.com/novincode/dlman/releases).

See [INSTALL.md](INSTALL.md) for detailed installation instructions for each platform.

#### Quick Start

| Platform | Download |
|----------|----------|
| Windows | `.msi` or `.exe` installer |
| macOS Intel | `.dmg` for x64 |
| macOS Apple Silicon | `.dmg` for aarch64 |
| Linux | `.deb`, `.rpm`, or `.AppImage` |

**macOS users:** You'll need to remove the quarantine attribute. See [INSTALL.md](INSTALL.md#macos) for instructions.

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
cd apps/desktop
pnpm tauri dev

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
├── scripts/         # Helper scripts
└── README.md
```

## 🎯 Roadmap

- [x] Core download engine (Rust)
- [x] Modern UI with React
- [x] Multi-segment downloads
- [x] Queue management with speed limits
- [x] Per-download speed limit override
- [x] Expandable download details
- [x] Dev console with filtering
- [ ] Browser extension integration
- [ ] Plugin system

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) first.

## 📄 License

MIT © [Novin Code](https://github.com/novincode)
