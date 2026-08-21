import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensureDriveFolderPath, googleFetch } from "@/lib/google";
import { getAccount } from "@/lib/store";
import { saveUploadSession } from "@/lib/uploads";
import { workspaceFromRequest } from "@/lib/workspace";
import { withRetry } from "@/lib/retry";

export const runtime = "nodejs";

function adaptiveChunkSize(fileSize: number): number {
  if (fileSize <= 5 * 1024 * 1024) return 4 * 1024 * 1024;
  if (fileSize <= 50 * 1024 * 1024) return 16 * 1024 * 1024;
  if (fileSize <= 200 * 1024 * 1024) return 32 * 1024 * 1024;
  if (fileSize <= 1024 * 1024 * 1024) return 64 * 1024 * 1024;
  return 128 * 1024 * 1024;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { accountId?: string; name?: string; mimeType?: string; size?: number; parentId?: string; relativePath?: string };
    const workspaceId = workspaceFromRequest(request);
    if (!workspaceId) return NextResponse.json({ error: "Workspace session is required" }, { status: 401 });
    if (!body.accountId || !body.name || !body.mimeType || !Number.isFinite(body.size)) {
      return NextResponse.json({ error: "Invalid upload request" }, { status: 400 });
    }
    const account = await getAccount(workspaceId, body.accountId);
    if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

    const relativeSegments = (body.relativePath || "").split("/").filter(Boolean);
    relativeSegments.pop();
    const parentId = body.parentId ?? (relativeSegments.length ? await withRetry(() => ensureDriveFolderPath(account, relativeSegments), { retries: 3, label: "Folder path creation" }) : undefined);

    const response = await withRetry(() => googleFetch(account, "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size,md5Checksum", {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=UTF-8",
        "x-upload-content-type": body.mimeType!,
        "x-upload-content-length": String(body.size),
      },
      body: JSON.stringify({
        name: body.name,
        mimeType: body.mimeType,
        ...(parentId ? { parents: [parentId] } : {}),
      }),
    }), { retries: 3, label: "Upload session creation" });

    const location = response.headers.get("location");
    if (!location) throw new Error("Google did not create an upload session");

    const uploadId = randomUUID();
    await saveUploadSession({ workspaceId, id: uploadId, accountId: account.id, location, createdAt: Date.now() });

    return NextResponse.json({
      uploadId,
      chunkSize: adaptiveChunkSize(body.size!),
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}
