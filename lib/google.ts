import "server-only";
import type { ConnectedAccount, DriveItem, PublicAccount, StoredToken } from "./types";
import { updateAccount } from "./store";
import { bundledGoogleClientId, bundledGoogleClientSecret } from "./oauth-client";
import { withRetry, fetchWithRetry, GoogleApiError } from "./retry";

const tokenEndpoint = "https://oauth2.googleapis.com/token";
const driveBase = "https://www.googleapis.com/drive/v3";

type GoogleTokenError = { error?: string; error_description?: string; error_subtype?: string };

async function tokenFailure(response: Response, operation: "exchange" | "refresh", email?: string) {
  const body = await response.json().catch(() => ({})) as GoogleTokenError;
  if (operation === "refresh" && body.error === "invalid_grant") {
    const account = email ? ` for ${email}` : "";
    return new Error(`Google authorization${account} has expired or was created by an older MegaDrive OAuth client. Connect this account again.`);
  }
  const detail = body.error_description || body.error || `HTTP ${response.status}`;
  return new Error(`Google token ${operation} failed: ${detail}`);
}

function oauthConfig() {
  const overrideId = process.env.MEGADRIVE_GOOGLE_CLIENT_ID;
  const overrideSecret = process.env.MEGADRIVE_GOOGLE_CLIENT_SECRET;
  if (Boolean(overrideId) !== Boolean(overrideSecret)) {
    throw new Error("Set both MEGADRIVE_GOOGLE_CLIENT_ID and MEGADRIVE_GOOGLE_CLIENT_SECRET, or neither");
  }
  const clientId = overrideId || bundledGoogleClientId;
  const clientSecret = overrideSecret || bundledGoogleClientSecret;
  if (!clientId) throw new Error("Google Desktop OAuth client ID is not configured");
  if (!clientSecret) throw new Error("Google Desktop OAuth client secret is not configured");
  return { clientId, clientSecret };
}

export function authorizationUrl(state: string, redirectUri: string, codeChallenge: string) {
  const { clientId } = oauthConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent select_account",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    scope: "openid email profile https://www.googleapis.com/auth/drive",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCode(code: string, redirectUri: string, codeVerifier: string): Promise<StoredToken> {
  const { clientId, clientSecret } = oauthConfig();
  const response = await fetchWithRetry(tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  }, { retries: 3, label: "OAuth token exchange" });
  if (!response.ok) throw await tokenFailure(response, "exchange");
  const result = await response.json() as { access_token: string; refresh_token?: string; expires_in: number; scope: string };
  if (!result.refresh_token) throw new Error("Google did not return a refresh token. Revoke the app grant and connect again.");
  return { accessToken: result.access_token, refreshToken: result.refresh_token, expiresAt: Date.now() + result.expires_in * 1000, scope: result.scope ?? "" };
}

async function accessToken(account: ConnectedAccount) {
  if (account.token.expiresAt > Date.now() + 60_000) return account.token.accessToken;
  const { clientId, clientSecret } = oauthConfig();
  const response = await fetchWithRetry(tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: account.token.refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  }, { retries: 3, label: `Token refresh for ${account.email}` });
  if (!response.ok) throw await tokenFailure(response, "refresh", account.email);
  const result = await response.json() as { access_token: string; expires_in: number; scope?: string };
  account.token = { ...account.token, accessToken: result.access_token, expiresAt: Date.now() + result.expires_in * 1000, scope: result.scope ?? account.token.scope };
  await updateAccount(account);
  return account.token.accessToken;
}

export async function googleFetch(account: ConnectedAccount, url: string, init: RequestInit = {}) {
  return withRetry(async () => {
    const token = await accessToken(account);
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    const response = await fetch(url, { ...init, headers, cache: "no-store" });
    if (!response.ok) {
      const body = await response.text();
      if (response.status === 429 || response.status === 500 || response.status === 502 || response.status === 503 || response.status === 504) {
        throw response;
      }
      throw new GoogleApiError(response.status, body);
    }
    return response;
  }, { retries: 4, label: `Google API ${url.split("?")[0].split("/").slice(-2).join("/")}` });
}

export async function googleFetchNoRetry(account: ConnectedAccount, url: string, init: RequestInit = {}) {
  const token = await accessToken(account);
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  const response = await fetch(url, { ...init, headers, cache: "no-store" });
  if (!response.ok) {
    const body = await response.text();
    throw new GoogleApiError(response.status, body);
  }
  return response;
}

export async function revokeGoogleAccount(account: ConnectedAccount) {
  try {
    const response = await fetchWithRetry("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: account.token.refreshToken }),
      cache: "no-store",
    }, { retries: 2, label: "Account revocation" });
    if (!response.ok && response.status !== 400) throw new Error(`Google access revocation failed (${response.status})`);
  } catch (error) {
    if ((error as Error)?.message?.includes("expired")) return;
    throw error;
  }
}

export async function readProfile(token: StoredToken) {
  const response = await fetchWithRetry("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${token.accessToken}` },
    cache: "no-store",
  }, { retries: 2, label: "Profile read" });
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
  const params = new URLSearchParams({
    q: filters.join(" and "),
    pageSize: "100",
    orderBy: "modifiedTime desc",
    fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime,createdTime,parents,trashed,webViewLink,iconLink,md5Checksum,ownedByMe,shared,sharedWithMeTime,driveId,owners(displayName,emailAddress,photoLink),capabilities(canDownload,canTrash,canDelete,canCopy,canEdit,canRemoveMyDriveParent))",
    spaces: "drive",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
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
    const createdResponse = await googleFetch(account, `${driveBase}/files?fields=id`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
    });
    parentId = ((await createdResponse.json()) as { id: string }).id;
  }
  return parentId;
}

export async function setTrashed(account: ConnectedAccount, fileId: string, trashed: boolean) {
  const response = await googleFetch(account, `${driveBase}/files/${encodeURIComponent(fileId)}?fields=id,trashed&supportsAllDrives=true`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ trashed }),
  });
  return response.json();
}

export async function removeFromMyDrive(account: ConnectedAccount, fileId: string, parentId: string) {
  const params = new URLSearchParams({ removeParents: parentId, fields: "id,parents", supportsAllDrives: "true" });
  await googleFetch(account, `${driveBase}/files/${encodeURIComponent(fileId)}?${params}`, { method: "PATCH" });
}

export async function permanentlyDelete(account: ConnectedAccount, fileId: string) {
  await googleFetch(account, `${driveBase}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`, { method: "DELETE" });
}

export async function listFolderFiles(account: ConnectedAccount, folderId: string, query?: string) {
  const filters = [`'${folderId}' in parents`, "trashed = false"];
  if (query) filters.push(`name contains '${query.replaceAll("'", "\\'")}'`);
  const params = new URLSearchParams({
    q: filters.join(" and "),
    pageSize: "1000",
    orderBy: "name",
    fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime,createdTime,md5Checksum,ownedByMe,shared,parents,capabilities(canDownload,canTrash,canDelete,canCopy,canEdit,canRemoveMyDriveParent))",
    spaces: "drive",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  const response = await googleFetch(account, `${driveBase}/files?${params}`);
  return response.json() as Promise<{ files: DriveItem[]; nextPageToken?: string }>;
}

export async function findFolderByName(account: ConnectedAccount, name: string, parentId = "root"): Promise<string | null> {
  const escapedName = name.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
  const query = `name = '${escapedName}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`;
  const params = new URLSearchParams({ q: query, pageSize: "1", fields: "files(id)", spaces: "drive", supportsAllDrives: "true" });
  const response = await googleFetch(account, `${driveBase}/files?${params}`);
  const data = await response.json() as { files?: { id: string }[] };
  return data.files?.[0]?.id ?? null;
}

export async function copyFileBetweenAccounts(
  source: ConnectedAccount,
  dest: ConnectedAccount,
  fileId: string,
  destParentId = "root",
): Promise<{ id: string; name: string; md5Checksum?: string }> {
  const metaResp = await googleFetch(source, `${driveBase}/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,md5Checksum,capabilities(canDownload,canCopy)&supportsAllDrives=true`);
  const meta = await metaResp.json() as { id: string; name: string; mimeType: string; size: string; md5Checksum?: string; capabilities?: { canDownload?: boolean; canCopy?: boolean } };

  const isWorkspaceFile = meta.mimeType.startsWith("application/vnd.google-apps.");
  if (isWorkspaceFile) {
    if (!meta.capabilities?.canCopy) throw new Error(`Cannot copy "${meta.name}" — no copy permission on source`);
    const tempPerm = await googleFetch(source, `${driveBase}/files/${encodeURIComponent(fileId)}?addParents=${destParentId}&supportsAllDrives=true&fields=id`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "reader", type: "user", emailAddress: dest.email }),
    });
    await tempPerm.json();
    try {
      const copyResp = await googleFetch(dest, `${driveBase}/files/${encodeURIComponent(fileId)}/copy?supportsAllDrives=true&fields=id,name,md5Checksum`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: meta.name, parents: [destParentId] }),
      });
      const copied = await copyResp.json() as { id: string; name: string; md5Checksum?: string };
      return copied;
    } finally {
      try {
        await googleFetch(source, `${driveBase}/permissions/${dest.email}?fileId=${encodeURIComponent(fileId)}&supportsAllDrives=true`, { method: "DELETE" });
      } catch { /* cleanup best-effort */ }
    }
  }

  const fileSize = Number(meta.size);
  const startResp = await googleFetch(dest, `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-upload-content-type": meta.mimeType,
      "x-upload-content-length": String(fileSize),
    },
    body: JSON.stringify({ name: meta.name, mimeType: meta.mimeType, parents: [destParentId] }),
  });
  const uploadLocation = startResp.headers.get("location");
  if (!uploadLocation) throw new Error("Failed to initiate resumable upload");

  const downloadResp = await googleFetch(source, `${driveBase}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`);
  if (!downloadResp.body) throw new Error("Failed to download file from source");

  const uploadResp = await fetch(uploadLocation, {
    method: "PUT",
    headers: {
      "content-length": String(fileSize),
      "content-range": `bytes 0-${fileSize - 1}/${fileSize}`,
      "content-type": meta.mimeType,
    },
    body: downloadResp.body,
    duplex: "half",
  } as RequestInit);

  if (!uploadResp.ok && uploadResp.status !== 308) {
    const err = await uploadResp.text();
    throw new Error(`Upload failed for "${meta.name}": ${err.slice(0, 200)}`);
  }

  const result = await uploadResp.json() as { id: string; name: string; md5Checksum?: string };
  if (meta.md5Checksum && result.md5Checksum && meta.md5Checksum !== result.md5Checksum) {
    throw new Error(`MD5 mismatch for "${meta.name}" — source and copy differ`);
  }
  return result;
}

export async function emptyTrash(account: ConnectedAccount) {
  await googleFetch(account, `${driveBase}/files/trash?supportsAllDrives=true`, { method: "DELETE" });
}

export { driveBase };
