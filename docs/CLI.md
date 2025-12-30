# DLMan CLI

## Overview

The `dlman` CLI provides command-line access to DLMan's download engine. It uses the same `dlman-core` crate as the desktop app.

## Installation

```bash
# From crates.io (future)
cargo install dlman-cli

# From source
cd apps/cli
cargo build --release
```

## Usage

### Basic Download
```bash
# Download to current directory
dlman https://example.com/file.zip

# Download to specific location
dlman https://example.com/file.zip -o ~/Downloads/

# Download with custom filename
dlman https://example.com/file.zip -o ~/Downloads/custom-name.zip
```

### Options
```bash
dlman [OPTIONS] <URL>

Arguments:
  <URL>  URL to download

Options:
  -o, --output <PATH>     Output path (default: current directory)
  -s, --segments <N>      Number of segments (default: 4)
  -l, --limit <SPEED>     Speed limit (e.g., "1M", "500K")
  -q, --quiet             Suppress progress output
  -c, --continue          Resume interrupted download
  -H, --header <HEADER>   Add custom header (can be used multiple times)
  -h, --help              Print help
  -V, --version           Print version
```

### Batch Download
```bash
# From file (one URL per line)
dlman batch urls.txt -o ~/Downloads/

# From stdin
cat urls.txt | dlman batch -o ~/Downloads/
```

### Queue Management
```bash
# List queues
dlman queue list

# Create queue
dlman queue create "Night Downloads" --start 00:00 --stop 06:00

# Start queue
dlman queue start "Night Downloads"

# Stop queue
dlman queue stop "Night Downloads"
```

### Download Management
```bash
# List downloads
dlman list [--status completed|failed|active]

# Pause download
dlman pause <ID>

# Resume download
dlman resume <ID>

# Cancel download
dlman cancel <ID>

# Delete download
dlman delete <ID> [--with-file]
```

## Progress Display

```
Downloading: large-file.zip
[████████████████░░░░░░░░░░░░░░] 53% • 530MB/1GB • 15.2MB/s • ETA: 32s

Segments:
  [1] ████████████████████ 100% complete
  [2] ████████████████░░░░  80% 12.1MB/s
  [3] ████████████░░░░░░░░  60% 14.3MB/s
  [4] ████████░░░░░░░░░░░░  40% 13.8MB/s
```

## Configuration

Config file location: `~/.config/dlman/config.toml`

```toml
[defaults]
output_dir = "~/Downloads"
segments = 4
speed_limit = "0"  # 0 = unlimited

[display]
show_segments = true
color = true

[network]
timeout = 30  # seconds
retries = 5
user_agent = "DLMan/1.0"
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Invalid arguments |
| 3 | Network error |
| 4 | File I/O error |
| 5 | Download cancelled |

## Examples

### Download with speed limit
```bash
dlman https://example.com/large.iso -l 5M
```

### Resume interrupted download
```bash
dlman https://example.com/large.iso -c
```

### Download with custom headers
```bash
dlman https://api.example.com/file \
  -H "Authorization: Bearer token123" \
  -H "Accept: application/octet-stream"
```

### Quiet mode for scripts
```bash
dlman https://example.com/file.zip -q && echo "Done!"
```
