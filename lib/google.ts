import "server-only";
import type { ConnectedAccount, DriveItem, PublicAccount, StoredToken } from "./types";
import { updateAccount } from "./store";

const tokenEndpoint = "https://oauth2.googleapis.com/token";
const driveBase = "https://www.googleapis.com/drive/v3";

function oauthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth environment variables are not configured");
  return { clientId, clientSecret };
}

export function authorizationUrl(state: string, redirectUri: string) {
  const { clientId } = oauthConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent select_account",
    include_granted_scopes: "true",
    state,
    scope: "openid email profile https://www.googleapis.com/auth/drive",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCode(code: string, redirectUri: string): Promise<StoredToken> {
  const { clientId, clientSecret } = oauthConfig();
  const response = await fetch(tokenEndpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }), cache: "no-store" });
  if (!response.ok) throw new Error(`Google token exchange failed: ${await response.text()}`);
  const result = await response.json() as { access_token: string; refresh_token?: string; expires_in: number; scope: string };
  if (!result.refresh_token) throw new Error("Google did not return a refresh token. Revoke the app grant and connect again.");
  return { accessToken: result.access_token, refreshToken: result.refresh_token, expiresAt: Date.now() + result.expires_in * 1000, scope: result.scope };
}

async function accessToken(account: ConnectedAccount) {
  if (account.token.expiresAt > Date.now() + 60_000) return account.token.accessToken;
  const { clientId, clientSecret } = oauthConfig();
  const response = await fetch(tokenEndpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: account.token.refreshToken, grant_type: "refresh_token" }), cache: "no-store" });
  if (!response.ok) throw new Error(`Google token refresh failed: ${response.status}`);
  const result = await response.json() as { access_token: string; expires_in: number; scope?: string };
  account.token = { ...account.token, accessToken: result.access_token, expiresAt: Date.now() + result.expires_in * 1000, scope: result.scope ?? account.token.scope };
  await updateAccount(account);
  return account.token.accessToken;
}

export async function googleFetch(account: ConnectedAccount, url: string, init: RequestInit = {}) {
  const token = await accessToken(account);
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  const response = await fetch(url, { ...init, headers, cache: "no-store" });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google API ${response.status}: ${body.slice(0, 500)}`);
  }
  return response;
}

export async function readProfile(token: StoredToken) {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${token.accessToken}` }, cache: "no-store" });
  if (!response.ok) throw new Error("Unable to read the Google account profile");
  return response.json() as Promise<{ sub: string; email: string; name: string; picture?: string }>;
}

export async function publicAccount(account: ConnectedAccount): Promise<PublicAccount> {
  const response = await googleFetch(account, `${driveBase}/about?fields=storageQuota`);
  const data = await response.json() as { storageQuota?: { limit?: string; usage?: string; usageInDrive?: string; usageInDriveTrash?: string } };
  const quota = data.storageQuota ?? {};
  const { token: _token, workspaceId: _workspaceId, ...safeAccount } = account;
  return { ...safeAccount, storage: { limit: quota.limit ? Number(quota.limit) : null, usage: Number(quota.usage ?? 0), usageInDrive: Number(quota.usageInDrive ?? 0), usageInTrash: Number(quota.usageInDriveTrash ?? 0) } };
}

export async function listDriveFiles(account: ConnectedAccount, options: { trashed?: boolean; query?: string; pageToken?: string | null }) {
  const filters = [`trashed = ${options.trashed ? "true" : "false"}`];
  if (options.query) filters.push(`name contains '${options.query.replaceAll("'", "\\'")}'`);
  const params = new URLSearchParams({ q: filters.join(" and "), pageSize: "100", orderBy: "modifiedTime desc", fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime,createdTime,parents,trashed,webViewLink,iconLink,md5Checksum,ownedByMe,shared,sharedWithMeTime,driveId,owners(displayName,emailAddress,photoLink),capabilities(canDownload,canTrash,canDelete,canCopy,canEdit,canRemoveMyDriveParent))", spaces: "drive", supportsAllDrives: "true", includeItemsFromAllDrives: "true" });
  if (options.pageToken) params.set("pageToken", options.pageToken);
  const response = await googleFetch(account, `${driveBase}/files?${params}`);
  return response.json() as Promise<{ files: DriveItem[]; nextPageToken?: string }>;
}

export async function ensureDriveFolderPath(account: ConnectedAccount, segments: string[]) {
  let parentId = "root";
  for (const rawName of segments) {
    const name = rawName.trim();
    if (!name || name === "." || name === "..") continue;
    const escapedName = name.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
    const query = `name = '${escapedName}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
    const params = new URLSearchParams({ q: query, pageSize: "1", fields: "files(id)", spaces: "drive" });
    const existingResponse = await googleFetch(account, `${driveBase}/files?${params}`);
    const existing = await existingResponse.json() as { files?: { id: string }[] };
    if (existing.files?.[0]) { parentId = existing.files[0].id; continue; }
    const createdResponse = await googleFetch(account, `${driveBase}/files?fields=id`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }) });
    parentId = ((await createdResponse.json()) as { id: string }).id;
  }
  return parentId;
}

export async function setTrashed(account: ConnectedAccount, fileId: string, trashed: boolean) {
  const response = await googleFetch(account, `${driveBase}/files/${encodeURIComponent(fileId)}?fields=id,trashed&supportsAllDrives=true`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ trashed }) });
  return response.json();
}

export async function removeFromMyDrive(account: ConnectedAccount, fileId: string, parentId: string) {
  const params = new URLSearchParams({ removeParents: parentId, fields: "id,parents", supportsAllDrives: "true" });
  await googleFetch(account, `${driveBase}/files/${encodeURIComponent(fileId)}?${params}`, { method: "PATCH" });
}

export async function permanentlyDelete(account: ConnectedAccount, fileId: string) {
  await googleFetch(account, `${driveBase}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`, { method: "DELETE" });
}

export { driveBase };
