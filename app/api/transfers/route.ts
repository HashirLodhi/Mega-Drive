import { NextRequest, NextResponse } from "next/server";
import { driveBase, googleFetch } from "@/lib/google";
import { getAccount } from "@/lib/store";
import type { DriveItem } from "@/lib/types";

export const runtime = "nodejs";
const googleNativePrefix = "application/vnd.google-apps.";

async function transferOne(sourceId: string, destinationId: string, fileId: string) {
  const [source, destination] = await Promise.all([getAccount(sourceId), getAccount(destinationId)]);
  if (!source || !destination) throw new Error("Source or destination account is no longer connected");
  if (source.id === destination.id) throw new Error("Choose a different destination account");
  const metadataResponse = await googleFetch(source, `${driveBase}/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,md5Checksum,capabilities(canDownload,canCopy)&supportsAllDrives=true`);
  const metadata = await metadataResponse.json() as DriveItem;
  if (metadata.mimeType === "application/vnd.google-apps.folder") throw new Error(`Folders are not yet transferable as one operation: ${metadata.name}`);

  if (metadata.mimeType.startsWith(googleNativePrefix)) {
    if (!metadata.capabilities?.canCopy) throw new Error(`${metadata.name} cannot be copied by this account`);
    let permissionId: string | null = null;
    try {
      const permissionResponse = await googleFetch(source, `${driveBase}/files/${encodeURIComponent(fileId)}/permissions?fields=id&sendNotificationEmail=false&supportsAllDrives=true`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "user", role: "reader", emailAddress: destination.email }) }).catch(() => { throw new Error(`${metadata.name} is shared or read-only. The connected source account cannot share it with the destination; ask the owner for sharing permission first.`); });
      permissionId = ((await permissionResponse.json()) as { id: string }).id;
      const copyResponse = await googleFetch(destination, `${driveBase}/files/${encodeURIComponent(fileId)}/copy?fields=id,name,mimeType,size,md5Checksum&supportsAllDrives=true`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: metadata.name }) });
      return { source: metadata, destination: await copyResponse.json(), verified: true };
    } finally {
      if (permissionId) await googleFetch(source, `${driveBase}/files/${encodeURIComponent(fileId)}/permissions/${encodeURIComponent(permissionId)}?supportsAllDrives=true`, { method: "DELETE" }).catch(() => undefined);
    }
  }

  if (!metadata.capabilities?.canDownload || !metadata.size) throw new Error(`${metadata.name} cannot be downloaded for transfer`);
  const init = await googleFetch(destination, "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size,md5Checksum", { method: "POST", headers: { "content-type": "application/json", "x-upload-content-type": metadata.mimeType, "x-upload-content-length": metadata.size }, body: JSON.stringify({ name: metadata.name, mimeType: metadata.mimeType }) });
  const location = init.headers.get("location");
  if (!location) throw new Error("Destination upload session was not created");
  const download = await googleFetch(source, `${driveBase}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`);
  const upload = await fetch(location, { method: "PUT", headers: { "content-length": metadata.size, "content-range": `bytes 0-${Number(metadata.size) - 1}/${metadata.size}`, "content-type": metadata.mimeType }, body: download.body, duplex: "half" } as RequestInit & { duplex: "half" });
  if (!upload.ok) throw new Error(`Destination upload failed: ${upload.status} ${await upload.text()}`);
  const copied = await upload.json() as DriveItem;
  const verified = copied.size === metadata.size && (!metadata.md5Checksum || copied.md5Checksum === metadata.md5Checksum);
  if (!verified) throw new Error(`Verification failed for ${metadata.name}; the source was kept`);
  return { source: metadata, destination: copied, verified };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { sourceAccountId?: string; destinationAccountId?: string; fileIds?: string[] };
    if (!body.sourceAccountId || !body.destinationAccountId || !body.fileIds?.length) return NextResponse.json({ error: "Source, destination, and files are required" }, { status: 400 });
    const results = [];
    for (const fileId of body.fileIds) results.push(await transferOne(body.sourceAccountId, body.destinationAccountId, fileId));
    return NextResponse.json({ results, sourceRetained: true });
  } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 502 }); }
}
