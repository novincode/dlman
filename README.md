<p align="center">
  <img src="apps/desktop/src-tauri/icons/128x128@2x.png" alt="DLMan" width="128" height="128">
</p>

<h1 align="center">DLMan</h1>

<p align="center">
  <strong>A modern, open-source download manager for everyone.</strong>
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
</p>

<p align="center">
  <a href="https://github.com/novincode/dlman/releases"><strong>Download</strong></a> •
  <a href="docs/INSTALL.md"><strong>Install Guide</strong></a> •
  <a href="CHANGELOG.md"><strong>Changelog</strong></a>
</p>

---

## What is DLMan?

DLMan is a **free, open-source download manager** that runs on Windows, macOS, and Linux. Built with Rust for speed and reliability, it helps you download files faster with multi-segment parallel connections.

---

## Features

**Speed**
- Multi-segment parallel downloads — split files into multiple connections
- Configurable segment count (1-32 per download)
- Per-download and per-queue speed limits
- Real-time network usage monitoring

**Reliability**
- Pause and resume downloads anytime
- Auto-resume after crashes or restarts
- Automatic retry for failed downloads
- SQLite-based crash-safe persistence

**Scheduling**
- Schedule queues to start/stop at specific times
- Select active days of the week
- Post-download actions (sleep, shutdown, run command)
- Automatic queue management

**Organization**
- Queue management with priorities
- Categories with custom download folders
- Batch import multiple URLs at once
- Drag and drop support (single or multiple links)

**Interface**
- Modern, clean UI
- Dark and light themes
- Real-time progress with segment visualization
- Desktop notifications
- In-app update notifications

**More**
- CLI tool included
- Cross-platform (Windows, macOS, Linux)
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

| Platform | Files |
|----------|-------|
| Windows | `.msi`, `.exe` |
| macOS (Intel) | `.dmg` (x64) |
| macOS (Apple Silicon) | `.dmg` (aarch64) |
| Linux | `.deb`, `.rpm`, `.AppImage` |

See the [Install Guide](docs/INSTALL.md) for platform-specific instructions.

---

## CLI

DLMan includes a command-line interface:

```bash
# Basic download
dlman https://example.com/file.zip

# With options
dlman https://example.com/file.zip -o ~/Downloads/ -s 8

# See all options
dlman --help
```

See [CLI documentation](docs/CLI.md) for more.

---

## Browser Extension

Install the DLMan browser extension to capture downloads directly from your browser:

| Browser | Download |
|---------|----------|
| **Chrome / Edge / Brave** | [📦 dlman-extension-chrome.zip](https://github.com/novincode/dlman/releases/latest/download/dlman-extension-chrome.zip) |
| **Firefox** | [📦 dlman-extension-firefox.zip](https://github.com/novincode/dlman/releases/latest/download/dlman-extension-firefox.zip) |

See the [Extension Download Guide](apps/extension/DOWNLOAD.md) for detailed installation instructions.

---

## Contributing

Contributions welcome! See the [Development Guide](docs/DEVELOPMENT.md).

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

---

<p align="center">
  MIT License © <a href="https://github.com/novincode">Novin Code</a>
</p>
