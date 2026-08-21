// Desktop OAuth credentials — PKCE protects each authorization-code exchange.
// Read from environment variables. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
// in your .env.local file (see PRODUCTION_SETUP.md for details).
export const bundledGoogleClientId = process.env.GOOGLE_CLIENT_ID || "";
export const bundledGoogleClientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
