# DLMan CLI

## Overview

The `dlman` CLI provides full command-line access to DLMan's download engine. It shares the same core library (`dlman-core`) as the desktop app, ensuring feature parity and data compatibility.

## Installation

```bash
# From source (recommended)
cd apps/cli
cargo build --release
# Binary will be at target/release/dlman

# Install system-wide
cargo install --path apps/cli
```

## Quick Start

```bash
# Add a download
dlman add https://example.com/file.zip

# Add and save to specific path
dlman add https://example.com/file.zip -o ~/Downloads/

# List all downloads
dlman list

# Check download info
dlman info <download-id>

# Pause/Resume/Cancel
dlman pause <id>
dlman resume <id>
dlman cancel <id>
```

## Commands Reference

### Download Management

```bash
# Add a new download
dlman add <URL> [OPTIONS]
  -o, --output <PATH>     Save location (default: current directory)
  -q, --queue <QUEUE_ID>  Add to specific queue
  -s, --segments <N>      Number of parallel segments
  -n, --now               Start immediately

# List downloads with optional filters
dlman list [OPTIONS]
  --status <STATUS>       Filter by status (completed, failed, downloading, etc.)
  --queue <QUEUE_ID>      Filter by queue
  -a, --all               Show detailed information

# Show detailed download info
dlman info <ID>

# Control downloads
dlman pause <ID>          # Pause an active download
dlman resume <ID>         # Resume a paused download
dlman cancel <ID>         # Cancel a download

# Delete a download
dlman delete <ID> [OPTIONS]
  --with-file             Also delete the downloaded file
```

### Queue Management

```bash
# List all queues
dlman queue list

# Create a new queue
dlman queue create <NAME> [OPTIONS]
  --color <HEX>           Queue color (e.g., "#3b82f6")
  --max-concurrent <N>    Max concurrent downloads
  --speed-limit <BYTES>   Speed limit in bytes/sec

# Delete a queue
dlman queue delete <QUEUE_ID>

# Start/Stop a queue
dlman queue start <QUEUE_ID>
dlman queue stop <QUEUE_ID>
```

### URL Probing

```bash
# Probe URLs for file information
dlman probe <URL1> [URL2] [URL3...]

# Example output:
# ✓ ubuntu-24.04-desktop-amd64.iso
#     Size: 5.7 GB
#     Type: application/x-iso9660-image
#     Resumable: Yes
```

### Data Import/Export

```bash
# Export all data to JSON
dlman export -o backup.json

# Export to stdout
dlman export

# Import from JSON file
dlman import backup.json
```

### Configuration

```bash
# Show all settings
dlman config show

# Get a specific setting
dlman config get default_download_path

# Update a setting
dlman config set max_concurrent_downloads 5
dlman config set default_segments 8

# Reset to defaults (with confirmation)
dlman config reset
```

### Shell Completions

```bash
# Generate completions for your shell
dlman completions bash > ~/.local/share/bash-completion/completions/dlman
dlman completions zsh > ~/.zfunc/_dlman
dlman completions fish > ~/.config/fish/completions/dlman.fish
dlman completions powershell > dlman.ps1
```

## Output Formats

All commands support multiple output formats:

```bash
# Human-readable (default)
dlman list

# JSON format (for scripting)
dlman list --output json

# Table format
dlman list --output table
```

## Global Options

```bash
dlman [OPTIONS] <COMMAND>

Options:
  --data-dir <PATH>       Custom data directory (default: ~/.local/share/dlman)
  --output <FORMAT>       Output format: human, json, table (default: human)
  -v, --verbose           Verbose output
  -h, --help              Print help
  -V, --version           Print version
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DLMAN_DATA_DIR` | Override default data directory |

## Examples

### Basic Workflow

```bash
# Add a large file download
dlman add https://releases.ubuntu.com/24.04/ubuntu-24.04-desktop-amd64.iso \
  -o ~/Downloads/ \
  --segments 8

# Check progress
dlman list

# Pause if needed
dlman pause abc12345

# Resume later
dlman resume abc12345
```

### Queue-based Downloads

```bash
# Create a queue for night downloads
dlman queue create "Night Queue" --max-concurrent 4

# Add downloads to the queue
dlman add https://example.com/file1.zip -q <queue-id>
dlman add https://example.com/file2.zip -q <queue-id>

# Start the queue
dlman queue start <queue-id>
```

### Scripting with JSON

```bash
# Get all completed downloads as JSON
dlman list --status completed --output json | jq '.[].filename'

# Probe multiple URLs and parse results
dlman probe url1 url2 url3 --output json | jq '.[] | {name: .filename, size: .size}'
```

### Backup and Restore

```bash
# Backup everything
dlman export -o dlman-backup-$(date +%Y%m%d).json

# Restore on another machine
dlman import dlman-backup-20250105.json
```

## Data Directory Structure

```
~/.local/share/dlman/
├── dlman.db              # SQLite database (downloads, settings)
├── queues.json           # Queue configurations
└── downloads/            # Temporary download segments
    └── <download-id>/
        ├── segment_0.part
        ├── segment_1.part
        └── ...
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Invalid arguments / Parse error |

## Tips

1. **Tab Completion**: Generate shell completions for faster command entry
2. **JSON Output**: Use `--output json` with `jq` for advanced scripting
3. **Portable Data**: Export/import allows syncing across machines
4. **Queue IDs**: Use short IDs (first 8 chars) - the CLI will match them
