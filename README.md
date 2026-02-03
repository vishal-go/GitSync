# GitSync - Obsidian GitHub Sync Plugin

Sync your Obsidian vault to a GitHub repository. **Works on both mobile and desktop** without requiring Git to be installed locally.

## Features

- 🔄 **Full Sync**: Push local changes and pull remote changes
- ⬆️ **Push to GitHub**: Upload all local vault files to your repository
- ⬇️ **Pull from GitHub**: Download all files from your repository
- ⏰ **Auto Sync**: Optionally sync at regular intervals (5-120 minutes)
- 📱 **Mobile Compatible**: Uses GitHub REST API, no Git installation needed
- 🔒 **Private Repos**: Automatically creates a private repository if it doesn't exist
- 📁 **Exclusions**: Configure folders and files to exclude from sync
- 🖼️ **Binary Files**: Supports images, PDFs, and other binary files

## Setup

### 1. Create a GitHub Personal Access Token

1. Go to [GitHub Settings → Developer Settings → Personal Access Tokens](https://github.com/settings/tokens)
2. Click **Generate new token (classic)**
3. Give it a descriptive name (e.g., "Obsidian GitSync")
4. Select the `repo` scope (full control of private repositories)
5. Click **Generate token**
6. **Copy the token immediately** - you won't be able to see it again!

### 2. Configure the Plugin

1. Open Obsidian Settings
2. Go to **Community plugins → GitSync**
3. Enter your GitHub username
4. Paste your Personal Access Token
5. Enter a repository name (e.g., `obsidian-vault`)
6. Click **Test Connection** to verify your credentials

### 3. Start Syncing

- Use the **ribbon icon** (git branch icon) for quick sync
- Or use the **Command Palette** (Ctrl/Cmd + P):
  - `GitSync: Push to GitHub`
  - `GitSync: Pull from GitHub`
  - `GitSync: Sync with GitHub`
- Or use the buttons in the settings tab

## Settings

| Setting | Description |
|---------|-------------|
| **GitHub Username** | Your GitHub username |
| **Personal Access Token** | GitHub token with `repo` scope |
| **Repository Name** | Name of the repo (created if doesn't exist) |
| **Branch** | Git branch to use (default: `main`) |
| **Auto Sync** | Enable automatic syncing |
| **Auto Sync Interval** | How often to auto-sync (5-120 minutes) |
| **Commit Message** | Template with `{{date}}` placeholder |
| **Excluded Folders** | Folders to skip (one per line) |
| **Excluded Files** | Files to skip (one per line) |

## Default Exclusions

By default, these folders are excluded:
- `.obsidian/plugins` - Plugin files (too large, use plugin manager)
- `.obsidian/themes` - Theme files
- `.trash` - Deleted files

## How It Works

This plugin uses the **GitHub REST API** to sync files. Unlike traditional Git sync plugins that require Git to be installed, GitSync:

1. Reads all files in your vault
2. Uploads them to GitHub using the Git Data API (efficient batch uploads)
3. Downloads any remote-only files to your vault

This makes it perfect for **Obsidian Mobile** where Git isn't available.

## Commands

| Command | Description |
|---------|-------------|
| `Push to GitHub` | Upload all local files to GitHub |
| `Pull from GitHub` | Download all files from GitHub |
| `Sync with GitHub` | Push first, then pull (full sync) |

## Troubleshooting

### "Connection failed"
- Verify your GitHub username is correct
- Ensure your token has the `repo` scope
- Check that the token hasn't expired

### Files not syncing
- Check the **Excluded Folders** and **Excluded Files** settings
- Make sure the file isn't in `.obsidian/plugins` (excluded by default)

### Large vaults
- The plugin uses batch uploads for efficiency
- Very large vaults (10,000+ files) may take a few minutes for the first sync

## Development

```bash
# Install dependencies
npm install

# Build for development (watch mode)
npm run dev

# Build for production
npm run build
```

## License

MIT
