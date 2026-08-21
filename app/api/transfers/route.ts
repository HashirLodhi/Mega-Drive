import { NextRequest, NextResponse } from "next/server";
import { driveBase, googleFetch } from "@/lib/google";
import { getAccount } from "@/lib/store";
import type { DriveItem } from "@/lib/types";
import { workspaceFromRequest } from "@/lib/workspace";
import { fetchWithRetry, GoogleApiError } from "@/lib/retry";

export const runtime = "nodejs";
const googleNativePrefix = "application/vnd.google-apps.";
const PARALLEL_TRANSFERS = 3;

async function transferOne(workspaceId: string, sourceId: string, destinationId: string, fileId: string) {
  const [source, destination] = await Promise.all([
    getAccount(workspaceId, sourceId),
    getAccount(workspaceId, destinationId),
  ]);
  if (!source || !destination) throw new Error("Source or destination account is no longer connected");
  if (source.id === destination.id) throw new Error("Choose a different destination account");

  const metadataResponse = await googleFetch(source, `${driveBase}/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,md5Checksum,capabilities(canDownload,canCopy)&supportsAllDrives=true`);
  const metadata = await metadataResponse.json() as DriveItem;
  if (metadata.mimeType === "application/vnd.google-apps.folder") throw new Error(`Folders are not yet transferable as one operation: ${metadata.name}`);

  if (metadata.mimeType.startsWith(googleNativePrefix)) {
    if (!metadata.capabilities?.canCopy) throw new Error(`${metadata.name} cannot be copied by this account`);
    let permissionId: string | null = null;
    try {
      const permissionResponse = await googleFetch(source, `${driveBase}/files/${encodeURIComponent(fileId)}/permissions?fields=id&sendNotificationEmail=false&supportsAllDrives=true`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "user", role: "reader", emailAddress: destination.email }),
      }).catch(() => {
        throw new Error(`${metadata.name} is shared or read-only. The connected source account cannot share it with the destination; ask the owner for sharing permission first.`);
      });
      permissionId = ((await permissionResponse.json()) as { id: string }).id;
      const copyResponse = await googleFetch(destination, `${driveBase}/files/${encodeURIComponent(fileId)}/copy?fields=id,name,mimeType,size,md5Checksum&supportsAllDrives=true`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: metadata.name }),
      });
      return { source: metadata, destination: await copyResponse.json(), verified: true };
    } finally {
      if (permissionId) {
        await googleFetch(source, `${driveBase}/files/${encodeURIComponent(fileId)}/permissions/${encodeURIComponent(permissionId)}?supportsAllDrives=true`, {
          method: "DELETE",
        }).catch(() => undefined);
      }
    }
  }

  if (!metadata.capabilities?.canDownload || !metadata.size) throw new Error(`${metadata.name} cannot be downloaded for transfer`);
  const fileSize = Number(metadata.size);

  const init = await googleFetch(destination, "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size,md5Checksum", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-upload-content-type": metadata.mimeType,
      "x-upload-content-length": metadata.size,
    },
    body: JSON.stringify({ name: metadata.name, mimeType: metadata.mimeType }),
  });
  const location = init.headers.get("location");
  if (!location) throw new Error("Destination upload session was not created");

  const MAX_STREAM_RETRIES = 4;
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_STREAM_RETRIES; attempt++) {
    try {
      const download = await googleFetch(source, `${driveBase}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`);
      const downloadStream = download.body;
      if (!downloadStream) throw new Error("Source file stream is empty");

      const uploadResponse = await fetch(location, {
        method: "PUT",
        headers: {
          "content-length": String(fileSize),
          "content-range": `bytes 0-${fileSize - 1}/${fileSize}`,
          "content-type": metadata.mimeType,
        },
        body: downloadStream,
        duplex: "half",
      } as unknown as RequestInit & { duplex: "half" });

      if (!uploadResponse.ok && uploadResponse.status !== 308) {
        const errorBody = await uploadResponse.text().catch(() => "");
        if (uploadResponse.status === 404 || uploadResponse.status === 410) {
          throw new Error("Upload session expired — cannot resume");
        }
        if (uploadResponse.status === 500 || uploadResponse.status === 502 || uploadResponse.status === 503) {
          throw new Error(`Destination server error: ${uploadResponse.status}`);
        }
        throw new Error(`Destination upload failed: ${uploadResponse.status} ${errorBody}`);
      }

      if (uploadResponse.status === 308) continue;

      const copied = await uploadResponse.json() as DriveItem;
      const verified = Number(copied.size) === fileSize && (!metadata.md5Checksum || copied.md5Checksum === metadata.md5Checksum);
      if (!verified) throw new Error(`Verification failed for ${metadata.name}; the source was kept`);
      return { source: metadata, destination: copied, verified };
    } catch (error) {
      lastError = error;
      const msg = (error as Error)?.message || "";
      if (msg.includes("Upload session expired") || msg.includes("cannot resume")) throw error;
      if (attempt >= MAX_STREAM_RETRIES) break;
      if (error instanceof GoogleApiError && error.status >= 400 && error.status < 500 && error.status !== 429) break;
      const delay = Math.min(1000 * Math.pow(2, attempt), 15000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw new Error(`Transfer of ${metadata.name} failed after ${MAX_STREAM_RETRIES + 1} attempts: ${(lastError as Error)?.message || "unknown error"}. The source file was kept.`);
}

async function transferBatch(workspaceId: string, sourceId: string, destinationId: string, fileIds: string[]) {
  const results: unknown[] = [];
  const errors: { fileId: string; error: string }[] = [];
  for (let i = 0; i < fileIds.length; i += PARALLEL_TRANSFERS) {
    const batch = fileIds.slice(i, i + PARALLEL_TRANSFERS);
    const batchResults = await Promise.allSettled(
      batch.map((fileId) => transferOne(workspaceId, sourceId, destinationId, fileId)),
    );
    for (let j = 0; j < batchResults.length; j++) {
      const r = batchResults[j];
      if (r.status === "fulfilled") results.push(r.value);
      else errors.push({ fileId: batch[j], error: r.reason?.message || "Unknown error" });
    }
  }
  return { results, errors };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { sourceAccountId?: string; destinationAccountId?: string; fileIds?: string[] };
    const workspaceId = workspaceFromRequest(request);
    if (!workspaceId) return NextResponse.json({ error: "Workspace session is required" }, { status: 401 });
    if (!body.sourceAccountId || !body.destinationAccountId || !body.fileIds?.length) {
      return NextResponse.json({ error: "Source, destination, and files are required" }, { status: 400 });
    }
    const { results, errors } = await transferBatch(workspaceId, body.sourceAccountId, body.destinationAccountId, body.fileIds);
    return NextResponse.json({ results, errors, sourceRetained: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}
