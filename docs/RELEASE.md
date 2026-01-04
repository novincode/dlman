# Release Process

This document explains how releases are automated via GitHub Actions.

## Overview

When you push a version tag, GitHub Actions automatically:
1. Builds the desktop app for Windows, macOS, and Linux
2. Builds the browser extension for Chrome and Firefox
3. Creates ZIPs for the extensions
4. Uploads all artifacts to the GitHub Release

**No manual building or uploading needed!** ✅

## How to Release

### Step 1: Bump Version

Versions are defined in multiple files (all synced):

```
Cargo.toml               (workspace version)
package.json            (root)
apps/desktop/package.json
apps/desktop/src-tauri/tauri.conf.json
apps/extension/package.json
apps/extension/wxt.config.ts (manifest version)
```

All should be bumped together. Example for v1.6.0:

```bash
# Root
sed -i '' 's/"version": "1.5.0"/"version": "1.6.0"/' package.json

# Desktop
sed -i '' 's/"version": "1.5.0"/"version": "1.6.0"/' apps/desktop/package.json
sed -i '' 's/"version": "1.5.0"/"version": "1.6.0"/' apps/desktop/src-tauri/tauri.conf.json

# Extension
sed -i '' 's/"version": "1.0.0"/"version": "1.6.0"/' apps/extension/package.json
sed -i '' 's/version: '"'"'1.0.0'"'"'/version: '"'"'1.6.0'"'"'/' apps/extension/wxt.config.ts

# Cargo
sed -i '' 's/version = "1.5.0"/version = "1.6.0"/' Cargo.toml
```

Or manually edit the files - they're clearly marked.

### Step 2: Commit and Tag

```bash
git add .
git commit -m "Bump version to 1.6.0"
git tag v1.6.0
git push origin main
git push origin v1.6.0
```

### Step 3: GitHub Actions Takes Over

Two workflows trigger automatically:

#### 1. **Build and Release** (`.github/workflows/release.yml`)
- Runs on: Windows, macOS (Intel & Apple Silicon), Linux
- Builds the desktop app
- Creates platform-specific installers (`.msi`, `.dmg`, `.deb`, `.rpm`, `.AppImage`)
- Uploads to GitHub Release

#### 2. **Build Browser Extensions** (`.github/workflows/build-extensions.yml`)
- Builds Chrome extension
- Builds Firefox extension
- Creates ZIPs: `dlman-extension-chrome.zip`, `dlman-extension-firefox.zip`
- Uploads to the same GitHub Release

**Total time:** ~5-10 minutes

### Step 4: Verify

1. Go to [GitHub Releases](https://github.com/novincode/dlman/releases)
2. Check that the latest release has:
   - Desktop app binaries for all platforms
   - Browser extension ZIPs
   - Changelog extracted from CHANGELOG.md

Done! Users can download everything.

## CI/CD Details

### Caching Strategy

Both workflows use GitHub's cache to speed up builds:

**pnpm Cache:**
```yaml
- name: Setup pnpm cache
  uses: actions/cache@v3
  with:
    path: ${{ env.STORE_PATH }}
    key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
    restore-keys: |
      ${{ runner.os }}-pnpm-store-
```

**Rust Cache:**
```yaml
- name: Setup Rust cache
  uses: Swatinem/rust-cache@v2
  with:
    workspaces: '. -> target'
```

### Why `--frozen-lockfile`?

- Ensures exact versions from `pnpm-lock.yaml` are used
- Prevents dependency updates during CI
- Cache works properly with exact hash
- Reproducible builds

### Local Testing

To test the build locally before releasing:

```bash
# Install
pnpm install --frozen-lockfile

# Copy icons
pnpm --filter @dlman/extension run copy-icons

# Build extensions
pnpm --filter @dlman/extension run build:chrome
pnpm --filter @dlman/extension run build:firefox

# Build desktop
pnpm build
```

The extension ZIPs are automatically created in `.github/workflows/build-extensions.yml`.

## Troubleshooting

### Release created but no artifacts uploaded

Check the workflow logs:
1. Go to [Actions](https://github.com/novincode/dlman/actions)
2. Find the failed workflow
3. Check the step logs for errors

### Extensions not building

Common causes:
- `pnpm-lock.yaml` out of sync: Run `pnpm install` locally
- Icons not copied: Check `scripts/copy-icons.js`
- WXT build error: Run `pnpm --filter @dlman/extension run build:chrome` locally

### Version mismatch

If extension version doesn't match app version:
- Edit `apps/extension/package.json`
- Edit `apps/extension/wxt.config.ts` (manifest version)
- Both must match for release

## Future Improvements

- [ ] Automated changelog generation from commits
- [ ] Signed binaries for macOS
- [ ] Notarization for macOS
- [ ] Browser extension store submissions
