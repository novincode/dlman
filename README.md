<p align="center">
  <img src="apps/desktop/src-tauri/icons/128x128@2x.png" alt="DLMan" width="80" height="80">
</p>

<h1 align="center">DLMan</h1>

<p align="center">
  <strong>A fast, reliable, open-source download manager.</strong><br>
  Multi-segment downloads • Crash-safe • Cross-platform
</p>

<p align="center">
  <a href="https://github.com/novincode/dlman/releases">
    <img src="https://img.shields.io/github/v/release/novincode/dlman?style=flat-square" alt="Release">
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" alt="License">
  </a>
  <a href="https://github.com/novincode/dlman/stargazers">
    <img src="https://img.shields.io/github/stars/novincode/dlman?style=flat-square" alt="Stars">
  </a>
  <a href="https://github.com/novincode/dlman/issues">
    <img src="https://img.shields.io/github/issues/novincode/dlman?style=flat-square" alt="Issues">
  </a>
</p>

<p align="center">
  <a href="https://github.com/novincode/dlman/releases"><strong>📥 Download</strong></a> •
  <a href="docs/INSTALL.md"><strong>📖 Install Guide</strong></a> •
  <a href="CHANGELOG.md"><strong>📋 Changelog</strong></a> •
  <a href="CONTRIBUTING.md"><strong>🤝 Contributing</strong></a>
</p>

---

## What is DLMan?

DLMan is a **free, open-source download manager** built with Rust for speed and reliability. It runs on Windows, macOS, and Linux.

<p align="center">
  <img src="https://github.com/user-attachments/assets/f81e6354-715e-4d47-8e46-55e00cb61346" alt="DLMan Screenshot" width="800">
</p>


Unlike traditional download managers, DLMan uses a modern tech stack:
- **Rust backend** — Native performance, no Electron bloat
- **Tauri framework** — Lightweight and secure
- **SQLite persistence** — Crash-safe, no corrupted downloads

If you care about **speed, reliability, and control**, DLMan is for you.

---

## Features

### ⚡ Speed & Performance
- Multi-segment parallel downloads (1–32 segments per file)
- Cached CDN URLs to avoid redirect overhead on resume
- Real-time bandwidth monitoring
- Per-download and per-queue speed limits

### 🔄 Reliability
- Pause and resume anytime
- Auto-resume after crashes or restarts
- Automatic retry for failed downloads
- SQLite-backed persistence (no half-broken files)

### ⏱️ Scheduling & Automation
- Schedule queues to start/stop at specific times
- Select active days of the week
- Post-download actions: Sleep, Shutdown, Hibernate
- Run custom commands after downloads complete
- Queue auto-advance: next downloads start automatically when slots free up

### 🗂️ Organization
- Queue management with priorities
- Categories with custom download folders
- Batch import multiple URLs
- Drag and drop support
- Quick "Clear Filters" button when any filter is active

### 🔐 Site Logins & Credentials
- Save site login credentials per domain
- Auto-apply credentials for authenticated downloads (HTTP Basic Auth)
- Auth detection during URL probe — warning shown before download starts
- Credential prompt on 401/403 failures with retry
- Manage saved logins in Settings

### 🎨 Interface
- Modern, clean UI
- Dark and light themes
- Real-time segment visualization
- Desktop notifications
- macOS dock badge for active downloads
- In-app update notifications

### 🧰 Ecosystem
- CLI tool for scripts and automation
- Browser extensions for Chrome, Firefox, Edge
- 100% free and open source

---

## Download

<p align="center">
  <a href="https://github.com/novincode/dlman/releases/latest">
    <img src="https://img.shields.io/badge/Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Windows">
  </a>
  <a href="https://github.com/novincode/dlman/releases/latest">
    <img src="https://img.shields.io/badge/macOS-000000?style=for-the-badge&logo=apple&logoColor=white" alt="macOS">
  </a>
  <a href="https://github.com/novincode/dlman/releases/latest">
    <img src="https://img.shields.io/badge/Linux-FCC624?style=for-the-badge&logo=linux&logoColor=black" alt="Linux">
  </a>
</p>

| Platform | Downloads |
|----------|-----------|
| **Windows** | `.msi`, `.exe` |
| **macOS (Intel)** | `.dmg` (x64) |
| **macOS (Apple Silicon)** | `.dmg` (aarch64) |
| **Linux** | `.deb`, `.rpm`, `.AppImage` |

👉 [View all downloads](https://github.com/novincode/dlman/releases/latest)

For platform-specific instructions, see the [Install Guide](docs/INSTALL.md).

---

## Browser Extension

Capture downloads directly from your browser.

| Browser | Download |
|---------|----------|
| **Chrome / Edge / Brave** | [📦 Download Extension](https://github.com/novincode/dlman/releases/latest) |
| **Firefox** | [📦 Download Extension](https://github.com/novincode/dlman/releases/latest) |

Extension files are named `dlman-extension-chrome-vX.Y.Z.zip` and `dlman-extension-firefox-vX.Y.Z.zip`.

For installation instructions and features, see the [Extension README](apps/extension/README.md).

---

## CLI

DLMan includes a command-line interface for automation and scripting:

```bash
# Basic download
dlman https://example.com/file.zip

# Custom output folder and 8 segments
dlman https://example.com/file.zip -o ~/Downloads -s 8

# See all options
dlman --help
```

See the [CLI documentation](docs/CLI.md) for more.

---

## Architecture

DLMan is built with modern technologies:

| Component | Technology |
|-----------|------------|
| **Backend** | Rust, Tauri v2 |
| **Frontend** | React, TypeScript, Tailwind CSS |
| **Database** | SQLite (sqlx) |
| **Downloads** | tokio, reqwest |

For technical details, see [Architecture](docs/ARCHITECTURE.md) and [Core Engine](docs/CORE.md).

---

## Contributing

Contributions are welcome! Whether it's bug fixes, features, or documentation:

1. Read the [Contributing Guide](CONTRIBUTING.md)
2. Check the [Development Guide](docs/DEVELOPMENT.md)
3. Look at [open issues](https://github.com/novincode/dlman/issues)

### Quick Start

```bash
git clone https://github.com/novincode/dlman.git
cd dlman
pnpm install
pnpm tauri dev
```

---

## Support the Project

<p align="center">
  <a href="https://github.com/sponsors/novincode">
    <img src="https://img.shields.io/badge/Sponsor-GitHub-EA4AAA?style=for-the-badge&logo=github-sponsors&logoColor=white" alt="GitHub Sponsors">
  </a>
  <a href="https://buymeacoffee.com/codeideal">
    <img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black" alt="Buy Me a Coffee">
  </a>
</p>

<p align="center">
  <img src="docs/become-supporter.png" alt="Become a Supporter" width="256">
</p>

Support DLMan financially and help keep development moving. If you can’t donate, sharing DLMan on social media or tweeting about it helps just as much.

- GitHub Sponsors: https://github.com/sponsors/novincode
- Buy Me a Coffee: https://buymeacoffee.com/codeideal

#### Supporters

| Supporter | Why they helped |
|-----------|-----------------|
| @tom_doerr | Shared DLMan on X/Twitter: https://x.com/tom_doerr/status/2070526815467143459 |

---

## Documentation

| Document | Description |
|----------|-------------|
| [Install Guide](docs/INSTALL.md) | Platform-specific installation |
| [CLI](docs/CLI.md) | Command-line interface |
| [Architecture](docs/ARCHITECTURE.md) | System design |
| [Core Engine](docs/CORE.md) | Download engine internals |
| [Extension](docs/EXTENSION.md) | Browser extension development |
| [Development](docs/DEVELOPMENT.md) | Setting up for development |
| [Release](docs/RELEASE.md) | Release process |

---

<p align="center">
  MIT License © <a href="https://github.com/novincode">Novin Code</a>
</p>

<p align="center">
  <sub>Built with ❤️ by the DLMan team and <a href="https://github.com/novincode/dlman/graphs/contributors">contributors</a></sub>
</p>
