# MegaDrive maintainer setup

Ordinary users do not need Google Cloud configuration. This document is for the official maintainer and fork authors.

## Official Google project

The official build uses the **MegaDrive Production** Google Cloud project.

1. Enable the Google Drive API.
2. Configure Google Auth Platform with an External audience.
3. Add development accounts under **Audience → Test users** while the app remains in Testing.
4. Add `openid`, `userinfo.email`, `userinfo.profile`, and `https://www.googleapis.com/auth/drive` under **Data Access**.
5. Create an OAuth client of type **Desktop app**.
6. Keep the downloaded `client_secret_*.json` outside version control; copy only the Desktop client values into your private build configuration.

MegaDrive's official build embeds its Desktop client ID and client secret because installed applications cannot keep these identifiers confidential. PKCE protects each authorization-code exchange. Never substitute a confidential Web application client.

## Forks and local overrides

Fork maintainers should create a separate Google Cloud project and Desktop client:

```powershell
$env:MEGADRIVE_GOOGLE_CLIENT_ID="YOUR_DESKTOP_CLIENT_ID.apps.googleusercontent.com"
$env:MEGADRIVE_GOOGLE_CLIENT_SECRET="YOUR_DESKTOP_CLIENT_SECRET"
python app.py
```

Never publish a Web OAuth client secret, user token, or downloaded credential JSON. A distributed Desktop client's embedded secret is not a confidential credential, but fork maintainers should still use their own OAuth project.

## OAuth verification

The full Drive scope is restricted. Before opening MegaDrive to all Google users:

1. Publish a homepage, privacy policy, terms, and user-help page on a verified domain.
2. Verify domain ownership in Google Search Console using a Google Cloud project owner account.
3. Ensure consent-screen scopes exactly match the application request.
4. Record a demonstration video showing connection, listing, upload, transfer, trash, permission blocking, and disconnect/revocation.
5. Explain why `drive.file` cannot manage pre-existing files across multiple accounts.
6. Submit the application for brand and restricted-scope verification.
7. Explain that tokens and files remain on-device and no developer-controlled backend receives restricted Drive data.

Google decides whether an additional assessment is required.

## Runtime storage

`app.py` generates and passes these values only to the local child process:

- `MEGADRIVE_DATA_DIR`
- `MEGADRIVE_ENCRYPTION_KEY`
- `MEGADRIVE_WORKSPACE_ID`
- `MEGADRIVE_LOCAL_MODE=1`

They are stored under the operating system's application-data directory, not the repository.

## Release checklist

```powershell
npx tsc --noEmit --incremental false
npm test
npm run build
python app.py --help
```
