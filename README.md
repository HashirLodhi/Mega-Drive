# MegaDrive

MegaDrive is an open-source, local-first Google Drive manager. Connect multiple Google accounts, compare storage, upload complete folders, copy files between accounts, and manage owned or shared files from one private dashboard.

Everything runs on your computer. Google tokens are encrypted locally and Drive files are transferred only when you request an operation.

## Features

- Connect multiple Google Drive accounts
- Combined and per-account storage capacity
- Browse, search, and filter live Drive files
- Display file ownership and permissions
- Upload individual files or complete nested folders
- Resumable uploads with retries and progress
- Copy files safely between connected accounts
- Trash, restore, or permanently delete files when Google permits it
- Remove eligible shared items from My Drive
- Revoke Google access when disconnecting an account

## Requirements

- [Python 3.10 or newer](https://www.python.org/downloads/)
- [Node.js 22.13 or newer](https://nodejs.org/)
- [Git](https://git-scm.com/downloads)
- A modern browser

## Install and run

```powershell
git clone https://github.com/HashirLodhi/Mega-Drive.git
cd Mega-Drive
python app.py
```

On the first launch, `app.py` automatically:

1. Checks the installed Node.js version.
2. Installs the exact dependencies from `package-lock.json`.
3. Builds the local production application.
4. Creates a private encryption key and workspace ID.
5. Starts MegaDrive on a random `127.0.0.1` port.
6. Opens the dashboard in your default browser.

After the dashboard opens, click **Connect your first Google account**. While the official Google OAuth application is still in testing, only accounts added by the maintainer as test users can connect.

Stop MegaDrive with `Ctrl+C` in the terminal. Start it again with `python app.py`.

No `.env` file, Google client secret, Redis database, or Vercel account is required.

## Launcher options

```text
python app.py --help
python app.py --dev
python app.py --rebuild
python app.py --no-browser
python app.py --port 3000
```

Use `--dev` only while developing. The normal command runs an optimized production build.

## Local data

MegaDrive keeps private runtime data outside the repository:

```text
Windows: %LOCALAPPDATA%\MegaDrive
macOS:   ~/Library/Application Support/MegaDrive
Linux:   ~/.local/share/MegaDrive
```

This directory contains the local encryption key, encrypted Google refresh tokens, resumable upload sessions, and workspace identifier. Do not share it. Deleting it resets MegaDrive and requires reconnecting every account.

## Security model

- OAuth uses a Google Desktop client with PKCE.
- Login happens in the system browser.
- OAuth callbacks return only to a loopback address.
- No Google client secret is used or shipped.
- Refresh tokens are encrypted with AES-256-GCM at rest.
- The server binds only to `127.0.0.1`.
- OAuth state and PKCE verifier cookies are HTTP-only and short-lived.
- Disconnecting an account revokes the Google grant and removes its local token.
- Source files remain untouched during transfers until the destination is verified.

The bundled Desktop OAuth client ID is a public application identifier. The downloaded Google credential JSON and its unused secret are deliberately excluded from Git.

## Development

```powershell
npm install
python app.py --dev
```

Before submitting a change:

```powershell
npx tsc --noEmit --incremental false
npm test
npm run build
```

Fork maintainers should create their own Google Desktop OAuth client and set `MEGADRIVE_GOOGLE_CLIENT_ID`, rather than publishing builds under MegaDrive's official OAuth identity. See [PRODUCTION_SETUP.md](PRODUCTION_SETUP.md).

## Troubleshooting Google authorization

If MegaDrive says that Google authorization expired or came from an older OAuth client, click **Connect your first Google account** or **Add account** and authorize that account again. Refresh tokens cannot be moved between OAuth client IDs.

While the Google OAuth app remains in **Testing**, refresh tokens for Drive access normally expire after seven days. Moving the consent screen to production and completing any required verification removes that testing limitation. Users can always reconnect in the meantime.

## Important Google limitations

- MegaDrive can only perform operations allowed by each file's Google capabilities.
- Shared or read-only files generally cannot be trashed by a non-owner.
- Google Photos does not provide full-library management or deletion through its current public APIs.
- Public use of the full Google Drive scope requires Google OAuth verification.

## License

No open-source license has been selected yet. Until a license is added, normal copyright rules apply even though the source is publicly visible.
