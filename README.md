<p align="center">
  <img src="apps/desktop/src-tauri/icons/128x128@2x.png" alt="DLMan" width="128" height="128">
</p>

<h1 align="center">DLMan</h1>

<p align="center">
  <strong>The open-source download manager that makes IDM obsolete.</strong>
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
  <a href="https://github.com/novincode/dlman/releases"><strong>📥 Download</strong></a> •
  <a href="docs/INSTALL.md"><strong>📖 Install Guide</strong></a> •
  <a href="#features"><strong>✨ Features</strong></a> •
  <a href="CHANGELOG.md"><strong>📋 Changelog</strong></a>
</p>

---

## Why DLMan?

**Free. Fast. Modern.** DLMan is a cross-platform download manager built with Rust and React. Multi-segment downloads, queue management, and a clean UI — everything you need, nothing you don't.

| | IDM | DLMan |
|---|:---:|:---:|
| Price | $25+ | **Free** |
| Open Source | ❌ | ✅ |
| Cross Platform | Windows | **Win/Mac/Linux** |
| CLI Tool | ❌ | ✅ |

---

## Features

- **Multi-segment downloads** — Split files into parallel connections for maximum speed
- **Pause & Resume** — Pick up where you left off, even after crashes
- **Queue management** — Organize downloads with speed limits and scheduling
- **Modern UI** — Clean, responsive interface with dark/light themes
- **CLI included** — Full power from your terminal
- **Cross-platform** — Windows, macOS, and Linux

---

## Download

Get the latest release for your platform:

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

| Platform | File |
|----------|------|
| Windows | `.msi` or `.exe` |
| macOS Intel | `.dmg` (x64) |
| macOS Apple Silicon | `.dmg` (aarch64) |
| Linux | `.deb` / `.rpm` / `.AppImage` |

**macOS note:** Run `xattr -cr /Applications/DLMan.app` after install. See [Install Guide](docs/INSTALL.md).

---

## CLI

```bash
# Download a file
dlman https://example.com/file.zip

# With options
dlman https://example.com/file.zip -o ~/Downloads/ -s 8

# Batch download
dlman batch urls.txt -o ~/Downloads/
```

See [CLI docs](docs/CLI.md) for full usage.

---

## Contributing

Want to contribute? Check out the [Development Guide](docs/DEVELOPMENT.md).

---

## Support

If DLMan saves you time, consider supporting development:

<p align="center">
  <a href="https://github.com/sponsors/novincode">
    <img src="https://img.shields.io/badge/GitHub%20Sponsors-EA4AAA?style=for-the-badge&logo=github-sponsors&logoColor=white" alt="GitHub Sponsors">
  </a>
  <a href="https://buymeacoffee.com/codeideal">
    <img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black" alt="Buy Me a Coffee">
  </a>
</p>

---

<p align="center">
  MIT © <a href="https://github.com/novincode">Novin Code</a>
</p>
