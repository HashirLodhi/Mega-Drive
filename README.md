# MegaDrive

> The application now uses a real, empty-first Google Drive flow. Follow [PRODUCTION_SETUP.md](PRODUCTION_SETUP.md) to configure OAuth and run it.

MegaDrive is a local-first dashboard for viewing multiple Google Drive accounts, comparing their storage, and moving files safely between them.

## Current prototype

The included interactive prototype supports:

- combined and per-account storage summaries;
- account and file filtering;
- local file selection and upload-queue feedback;
- safe transfer simulations with explicit destinations;
- trash and restore actions;
- activity history and cleanup suggestions;
- responsive desktop, tablet, and mobile layouts.

Google OAuth is deliberately represented by a demo connector until a Google Cloud OAuth client is configured. No real credentials are committed to this repository.

## Run locally

Install Node.js 22 or newer, then run:

```powershell
npm install
npm run dev
```

Open the local address printed in the terminal. Use `npm run build` for a production build.

## Live Google integration boundary

Replace the demo account and file collections in `app/page.tsx` with a local service backed by Google OAuth and Drive API v3. Keep refresh tokens in the operating-system credential vault. For cross-account transfers, copy first, verify the destination, and only then offer to trash the source.
