# MegaDrive

> ### 100% LOCAL. Your files never leave your device. Your data never touches any external server.

MegaDrive is a **local-first Google Drive manager** that runs entirely on your computer. Connect multiple Google Drive accounts, compare storage, upload folders, copy files between accounts, manage permissions, and even use AI to clean up your storage -- all from a single private dashboard.

> **No cloud backend. No third-party servers. No data leaks. Your Google tokens stay encrypted on YOUR machine.**

---

## Why MegaDrive?

| | Cloud-based tools | MegaDrive |
|---|---|---|
| **Where your data lives** | On their servers | **On YOUR machine only** |
| **Google tokens** | Stored on remote servers | **Encrypted locally (AES-256-GCM)** |
| **File transfers** | Route through their servers | **Direct: your PC to Google** |
| **Privacy risk** | Third-party access possible | **Zero -- nothing leaves your device** |
| **Who can see your files** | Their employees, infrastructure | **Only you** |

---

## Features

### Account Management
- Connect **multiple Google Drive accounts** from one dashboard
- See **combined and per-account** storage usage at a glance
- Disconnect any account -- Google access is revoked instantly

### File Operations
- **Browse** all files across connected accounts
- **Search** by name, type, or folder path
- **Trash / Restore** files (reversible)
- **Permanently delete** files when you need to
- **Remove shared files** from My Drive (they stay accessible via link)
- View **ownership and permissions** for every file

### Cross-Account Transfers
- **Copy files** between any two connected accounts
- Source files are **always kept** -- never deleted
- **MD5 checksum verification** ensures bit-perfect copies
- Google Workspace files (Docs, Sheets) copied via native API

### Smart Upload
- Upload **individual files or entire folder trees**
- **Resumable uploads** -- pick up where you left off if interrupted
- **Adaptive chunk sizes** (4MB to 128MB) based on file size
- Real-time **speed and progress tracking**

### AI Assistant
- Ask your AI about files, storage, and account details
- **Browse into folders** and find duplicates
- **Execute actions** via chat: trash, delete, copy, cleanup
- **Smart Cleanup** -- AI analyzes and cleans trash, large files, old files, and duplicates
- Two-step confirmation: preview first, then approve

---

## Quick Start

### Prerequisites

| Requirement | Version | Download |
|---|---|---|
| Python | 3.10+ | https://www.python.org/downloads/ |
| Node.js | 22.13+ | https://nodejs.org/ |
| Git | Any | https://git-scm.com/downloads |
| Browser | Modern | Chrome, Firefox, Edge, or Safari |

### Install and Run (3 commands)

`ash
git clone https://github.com/HashirLodhi/Mega-Drive.git
cd Mega-Drive
python app.py
`

That is it. The launcher handles everything automatically:

1. Checks your Node.js version
2. Installs verified dependencies (npm ci)
3. Builds the production app
4. Generates a private encryption key and workspace ID
5. Starts the server on 127.0.0.1 (localhost ONLY)
6. Opens the dashboard in your browser

### First-Time Setup

1. Click **"Connect your first Google account"** on the dashboard
2. Sign in with your Google account
3. Grant Drive access (read/write)
4. Done -- your files appear instantly

> **Note:** While the Google OAuth app is in testing, only accounts added as test users can connect. See PRODUCTION_SETUP.md to set up your own Google Cloud credentials.

---

## How It Works

`
+--------------------------------------------------+
|               YOUR COMPUTER                      |
|                                                   |
|  +----------+    +----------+    +------------+  |
|  | Browser  |--->| Next.js  |--->| Encrypted  |  |
|  | (React)  |<---| Server   |<---|  Storage   |  |
|  +----------+    +----+-----+    +------------+  |
|                       |                           |
|                  127.0.0.1 only                   |
+-----------------------+---------------------------+
                        |
                        | Direct HTTPS calls
                        | (no middleman)
                        v
              +-------------------+
              |   Google Drive    |
              |      APIs         |
              +-------------------+
`

**Key points:**
- The server binds to **127.0.0.1** -- not accessible from the network
- All Google API calls happen **server-side** (browser never talks to Google directly)
- File transfers go **directly between your PC and Google** -- no intermediary
- Tokens are encrypted with **AES-256-GCM** and stored only on your machine

---

## Security

### Your Data Stays on Your Machine

| What | Where it lives |
|---|---|
| Google OAuth tokens | Encrypted in %LOCALAPPDATA%/MegaDrive/accounts.enc |
| Encryption key | %LOCALAPPDATA%/MegaDrive/master.key |
| Workspace ID | %LOCALAPPDATA%/MegaDrive/workspace.id |
| Upload sessions | %LOCALAPPDATA%/MegaDrive/data/uploads.json |
| Source code | Your local clone (never sent anywhere) |

> **None of this data is uploaded, transmitted, or shared with anyone. Ever.**

### Security Features

- **OAuth 2.0 with PKCE** -- Every login is cryptographically verified
- **AES-256-GCM encryption** -- Tokens encrypted at rest
- **Loopback-only server** -- 127.0.0.1, NOT 0.0.0.0
- **HTTP-only cookies** -- OAuth state and PKCE verifier cannot be accessed by JavaScript
- **Source file safety** -- Transfers keep source files until destination is verified
- **Revocation** -- Disconnecting an account revokes the Google grant permanently

### What Google Sees

Google only sees standard OAuth requests from a Desktop app. Your refresh tokens are encrypted locally and never transmitted in plaintext. MegaDrive never sends your files to any third-party server.

---

## AI Assistant

The built-in AI lets you manage your storage through natural language.

### Ask Questions

- "How much storage am I using across all accounts?"
- "Show me all PDF files in my Work account"
- "What is in the Home-Mehtab's Wedding folder?"
- "Find duplicates across all my accounts"
- "Which files are taking up the most space?"

### Execute Actions

- "Trash all files larger than 500MB"
- "Copy my photos from Account A to Account B"
- "Empty trash on all accounts"
- "Remove shared files from My Drive"
- "Smart cleanup my storage"

### Smart Cleanup

The AI analyzes your storage and identifies:
- **Trash files** ready to be emptied
- **Large files** (over 100MB) that might be candidates for removal
- **Old files** (over 6 months) you may have forgotten
- **Duplicates** (same name + size across accounts)

It shows a preview with potential space savings, then asks for your approval before doing anything.

---

## Launcher Options

`ash
python app.py                  # Normal production mode
python app.py --dev            # Development mode (hot reload)
python app.py --rebuild        # Force fresh production build
python app.py --no-browser     # Start without opening browser
python app.py --port 3000      # Use a specific port
`

---

## Local Data Locations

MegaDrive keeps private data outside the repository:

| OS | Location |
|---|---|
| Windows | %LOCALAPPDATA%/MegaDrive |
| macOS | ~/Library/Application Support/MegaDrive |
| Linux | ~/.local/share/MegaDrive |

Deleting this directory resets MegaDrive and requires reconnecting every account.

---

## Development

`ash
git clone https://github.com/HashirLodhi/Mega-Drive.git
cd Mega-Drive
npm install
python app.py --dev
`

Before submitting a change:

`ash
npx tsc --noEmit --incremental false
npm test
npm run build
`

---

## Troubleshooting

### Google Authorization Expired

If MegaDrive says Google authorization expired, click **Connect your first Google account** or **Add account** and authorize that account again. Refresh tokens cannot be moved between OAuth client IDs.

### Testing Mode Limitations

While the Google OAuth app remains in Testing, refresh tokens for Drive access normally expire after seven days. Moving the consent screen to production removes that limitation. Users can always reconnect in the meantime.

---

## Fork / Self-Host Setup

If you fork MegaDrive, create your own Google Desktop OAuth client and set these environment variables in .env.local:

`
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
`

See PRODUCTION_SETUP.md for the full guide.

---

## Important Google Limitations

- MegaDrive can only perform operations allowed by each file's Google capabilities
- Shared or read-only files generally cannot be trashed by a non-owner
- Google Photos does not provide full-library management or deletion through its current public APIs
- Public use of the full Google Drive scope requires Google OAuth verification

## License

No open-source license has been selected yet. Until a license is added, normal copyright rules apply even though the source is publicly visible.
