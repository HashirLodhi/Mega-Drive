# MegaDrive production setup

MegaDrive starts empty and uses only live Google Drive data after account connection.

## Google Cloud configuration

1. Create or select a Google Cloud project and enable **Google Drive API**.
2. Configure the OAuth consent screen. While its publishing status is Testing, add every account you will connect as a test user.
3. Create an **OAuth client ID** of type **Web application**.
4. Add `http://localhost:3000/api/auth/google/callback` as an authorized redirect URI.
5. Copy `.env.example` to `.env.local` and fill in the client ID and client secret.
6. Set `MEGADRIVE_ENCRYPTION_KEY` to a unique private string of at least 24 characters. Do not change it after connecting accounts.

The app needs the full Drive scope because narrower `drive.file` access cannot manage files created outside MegaDrive. Public distribution may require Google OAuth verification; personal accounts added as test users can be used while the consent screen remains in Testing.

## Run

Requires Node.js 22.13 or newer.

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`. For a production process, run `npm run build` and then `npm start`.

## Security behavior

- OAuth state uses an HTTP-only, SameSite cookie.
- Refresh tokens are AES-256-GCM encrypted in `.data/accounts.enc`.
- On Vercel, filesystem data uses `/tmp/megadrive` to avoid the read-only `/var/task` directory. `/tmp` is ephemeral, so use a durable database before serving multiple users or relying on accounts surviving cold starts.
- Uploads use resumable chunks and show real progress.
- Cross-account copies keep the source and verify destination size and checksum when available.
- Permanent deletion requires explicit confirmation.
- Disconnecting removes local credentials without changing Google Drive files.
