<h1 align="center">
  <br>
  <img src="https://raw.githubusercontent.com/HashirLodhi/Mega-Drive/main/public/favicon.svg" width="100">
  <br>
  MegaDrive
  <br>
</h1>

<h4 align="center">Your Google Drive. Your machine. Your rules.</h4>

<p align="center">
  <a href="https://github.com/HashirLodhi/Mega-Drive">
    <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blueviolet?style=for-the-badge" alt="Platform">
  </a>
  <a href="https://github.com/HashirLodhi/Mega-Drive">
    <img src="https://img.shields.io/badge/node-%3E%3D22.13-brightgreen?style=for-the-badge&logo=node.js" alt="Node.js">
  </a>
  <a href="https://github.com/HashirLodhi/Mega-Drive">
    <img src="https://img.shields.io/badge/python-%3E%3D3.10-yellow?style=for-the-badge&logo=python" alt="Python">
  </a>
  <a href="https://github.com/HashirLodhi/Mega-Drive/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-red?style=for-the-badge" alt="License">
  </a>
</p>

<p align="center">
  <a href="#-quick-start">Quick Start</a> &bull;
  <a href="#-features">Features</a> &bull;
  <a href="#-ai-assistant">AI Assistant</a> &bull;
  <a href="#-security">Security</a> &bull;
  <a href="#-architecture">Architecture</a> &bull;
  <a href="#-troubleshooting">Troubleshooting</a>
</p>

---

<div align="center">

  ### :lock: 100% LOCAL -- Your files NEVER leave your device :lock:

  <img src="https://img.shields.io/badge/NO%20cloud%20backend-DC382D?style=for-the-badge&logo=cloudflare&logoColor=white" alt="No cloud">
  <img src="https://img.shields.io/badge/NO%20third--party%20servers-DC382D?style=for-the-badge&logo=firebase&logoColor=white" alt="No servers">
  <img src="https://img.shields.io/badge/NO%20data%20leaks-DC382D?style=for-the-badge&logo=hackaday&logoColor=white" alt="No leaks">
  <img src="https://img.shields.io/badge/tokens%20encrypted%20AES--256-GCM-0F9D58?style=for-the-badge&logo=protonmail&logoColor=white" alt="Encrypted">

  <br><br>

  MegaDrive is a **local-first Google Drive manager** that runs entirely on your computer.
  Connect multiple accounts, compare storage, upload folders, copy files between accounts,
  and use AI to clean up your storage -- all from a single private dashboard.

  **No cloud backend. No external servers. No data leaks.**
  Your Google tokens stay encrypted on **YOUR** machine.

</div>

---

## :rocket: Quick Start

### :memo: Prerequisites

| Requirement | Min Version | Install |
|:---:|:---:|:---|
| :snake: **Python** | 3.10+ | [Download Python](https://www.python.org/downloads/) |
| :green_book: **Node.js** | 22.13+ | [Download Node.js](https://nodejs.org/) |
| :electric_plug: **Git** | Any | [Download Git](https://git-scm.com/downloads) |
| :globe_with_meridians: **Browser** | Modern | Chrome, Firefox, Edge, or Safari |

### :hammer_and_wrench: Install and Run (3 commands)

```bash
git clone https://github.com/HashirLodhi/Mega-Drive.git
cd Mega-Drive
python app.py
```

<div align="center">

**:sparkles: That is it! The launcher handles everything automatically: :sparkles:**

</div>

| Step | What happens |
|:---:|:---|
| :one: | Checks your Node.js version |
| :two: | Installs verified dependencies (`npm ci`) |
| :three: | Builds the production app |
| :four: | Generates a **private encryption key** and workspace ID |
| :five: | Starts the server on `127.0.0.1` (**localhost ONLY**) |
| :six: | Opens the dashboard in your browser |

### :handshake: First-Time Setup

1. Click **":heavy_plus_sign: Connect your first Google account"** on the dashboard
2. Sign in with your Google account
3. Grant Drive access (read/write)
4. :tada: **Done** -- your files appear instantly

> :bulb: **Note:** While the Google OAuth app is in testing, only accounts added as test users can connect. See [PRODUCTION_SETUP.md](PRODUCTION_SETUP.md) to set up your own Google Cloud credentials.

---

## :star2: Features

<div align="center">

| Category | What you can do |
|:---|:---|
| :busts_in_silhouette: **Account Management** | Connect multiple accounts, see combined storage, disconnect instantly |
| :page_facing_up: **File Operations** | Browse, search, trash, restore, delete, remove from My Drive |
| :arrow_right: **Cross-Account Transfers** | Copy files between accounts with MD5 verification |
| :cloud_upload: **Smart Upload** | Upload files and folders with resumable progress |
| :robot: **AI Assistant** | Chat to search, analyze, and execute actions on your files |

</div>

### :busts_in_silhouette: Account Management
- Connect **multiple Google Drive accounts** from one dashboard
- See **combined and per-account** storage usage at a glance
- Disconnect any account -- Google access is revoked instantly

### :page_facing_up: File Operations
- **Browse** all files across connected accounts
- **Search** by name, type, or folder path
- **Trash / Restore** files (reversible)
- **Permanently delete** files when you need to
- **Remove shared files** from My Drive (they stay accessible via link)
- View **ownership and permissions** for every file

### :arrow_right: Cross-Account Transfers
- **Copy files** between any two connected accounts
- Source files are **always kept** -- never deleted
- **MD5 checksum verification** ensures bit-perfect copies
- Google Workspace files (Docs, Sheets) copied via native API

### :cloud_upload: Smart Upload
- Upload **individual files or entire folder trees**
- **Resumable uploads** -- pick up where you left off if interrupted
- **Adaptive chunk sizes** (4MB to 128MB) based on file size
- Real-time **speed and progress tracking**

---

## :robot: AI Assistant

<div align="center">

> :speech_balloon: **Ask questions. Execute actions. Clean up storage. All through chat.**

</div>

### :mag: Ask Questions

```
:bulb: "How much storage am I using across all accounts?"
:bulb: "Show me all PDF files in my Work account"
:bulb: "What is in the Home-Mehtab's Wedding folder?"
:bulb: "Find duplicates across all my accounts"
:bulb: "Which files are taking up the most space?"
```

### :zap: Execute Actions

```
:warning: "Trash all files larger than 500MB"
:warning: "Copy my photos from Account A to Account B"
:warning: "Empty trash on all accounts"
:warning: "Remove shared files from My Drive"
:warning: "Smart cleanup my storage"
```

### :sparkles: Smart Cleanup

The AI analyzes your storage and identifies:

| What it finds | Description |
|:---|:---|
| :wastebasket: **Trash files** | Ready to be emptied to free space |
| :package: **Large files** | Over 100MB -- candidates for removal |
| :clock1: **Old files** | Over 6 months -- files you may have forgotten |
| :arrows_counterclockwise: **Duplicates** | Same name + size across accounts |

It shows a **preview with potential space savings**, then asks for your approval before doing anything.

---

## :lock: Security

<div align="center">

> :shield: **Your data stays on your machine. Always.**

</div>

### :desktop_computer: Where your data lives

| Data | Location | Encrypted? |
|:---|:---|:---:|
| Google OAuth tokens | `%LOCALAPPDATA%/MegaDrive/accounts.enc` | :white_check_mark: **AES-256-GCM** |
| Encryption key | `%LOCALAPPDATA%/MegaDrive/master.key` | :white_check_mark: **AES-256-GCM** |
| Workspace ID | `%LOCALAPPDATA%/MegaDrive/workspace.id` | -- |
| Upload sessions | `%LOCALAPPDATA%/MegaDrive/data/uploads.json` | -- |
| Source code | Your local clone | -- |

> :no_entry: **None of this data is uploaded, transmitted, or shared with anyone. Ever.**

### :shield: Security Features

| Feature | Details |
|:---|:---|
| :key: **OAuth 2.0 with PKCE** | Every login is cryptographically verified |
| :closed_lock_with_key: **AES-256-GCM encryption** | Tokens encrypted at rest |
| :globe_with_meridians: **Loopback-only server** | `127.0.0.1`, NOT `0.0.0.0` |
| :cookie: **HTTP-only cookies** | OAuth state and PKCE verifier inaccessible to JavaScript |
| :white_check_mark: **Source file safety** | Transfers keep source files until destination is verified |
| :x: **Revocation** | Disconnecting an account revokes the Google grant permanently |

### :eye: What Google Sees

Google only sees standard OAuth requests from a Desktop app. Your refresh tokens are **encrypted locally** and never transmitted in plaintext. MegaDrive **never** sends your files to any third-party server.

---

## :compass: Architecture

```
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
```

**Key points:**
- :house: The server binds to **127.0.0.1** -- not accessible from the network
- :electric_plug: All Google API calls happen **server-side** (browser never talks to Google directly)
- :arrow_right: File transfers go **directly between your PC and Google** -- no intermediary
- :closed_lock_with_key: Tokens are encrypted with **AES-256-GCM** and stored only on your machine

---

## :gear: Launcher Options

```bash
python app.py                  # Normal production mode
python app.py --dev            # Development mode (hot reload)
python app.py --rebuild        # Force fresh production build
python app.py --no-browser     # Start without opening browser
python app.py --port 3000      # Use a specific port
python app.py --help           # Show all options
```

---

## :floppy_disk: Local Data Locations

| OS | Location |
|:---|:---|
| :windows: **Windows** | `%LOCALAPPDATA%\MegaDrive` |
| :apple: **macOS** | `~/Library/Application Support/MegaDrive` |
| :penguin: **Linux** | `~/.local/share/MegaDrive` |

> :warning: Deleting this directory resets MegaDrive and requires reconnecting every account.

---

## :hammer_and_wrench: Development

```bash
git clone https://github.com/HashirLodhi/Mega-Drive.git
cd Mega-Drive
npm install
python app.py --dev
```

Before submitting a change:

```bash
npx tsc --noEmit --incremental false
npm test
npm run build
```

---

## :wrench: Troubleshooting

### :red_circle: Google Authorization Expired

If MegaDrive says Google authorization expired, click **Connect your first Google account** or **Add account** and authorize that account again. Refresh tokens cannot be moved between OAuth client IDs.

### :orange_circle: Testing Mode Limitations

While the Google OAuth app remains in Testing, refresh tokens for Drive access normally expire after seven days. Moving the consent screen to production removes that limitation. Users can always reconnect in the meantime.

---

## :fork_and_knife: Fork / Self-Host Setup

If you fork MegaDrive, create your own Google Desktop OAuth client and set these environment variables in `.env.local`:

```env
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
```

See [PRODUCTION_SETUP.md](PRODUCTION_SETUP.md) for the full guide.

---

## :warning: Important Google Limitations

- MegaDrive can only perform operations allowed by each file's Google capabilities
- Shared or read-only files generally cannot be trashed by a non-owner
- Google Photos does not provide full-library management or deletion through its current public APIs
- Public use of the full Google Drive scope requires Google OAuth verification

---

<div align="center">

**Made with :heart: for privacy-conscious Google Drive users**

:MegaDrive -- 100% Local. 100% Private. 100% Yours.

</div>
