import { NextRequest, NextResponse } from "next/server";
import { getUploadSession, removeUploadSession } from "@/lib/uploads";
import { workspaceFromRequest } from "@/lib/workspace";

export const runtime = "nodejs";

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const workspaceId = workspaceFromRequest(request);
    if (!workspaceId) return NextResponse.json({ error: "Workspace session is required" }, { status: 401 });
    const session = await getUploadSession(workspaceId, id);
    if (!session) return NextResponse.json({ error: "Upload session expired" }, { status: 404 });

    const range = request.headers.get("content-range");
    if (!range) return NextResponse.json({ error: "Content-Range is required" }, { status: 400 });

    const contentLength = request.headers.get("content-length") ?? "0";

    const MAX_RETRIES = 3;
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(session.location, {
          method: "PUT",
          headers: {
            "content-length": contentLength,
            "content-range": range,
          },
          body: request.body,
          duplex: "half",
        } as RequestInit & { duplex: "half" });

        if (response.status === 308) {
          return new NextResponse(null, { status: 308, headers: { range: response.headers.get("range") ?? "" } });
        }

        if (!response.ok) {
          const errorBody = await response.text().catch(() => "");
          if (response.status === 404 || response.status === 410) {
            await removeUploadSession(workspaceId, id).catch(() => {});
            return NextResponse.json({ error: "Upload session expired. Please restart the upload.", expired: true }, { status: 410 });
          }
          if (response.status === 500 || response.status === 502 || response.status === 503 || response.status === 504) {
            if (attempt < MAX_RETRIES) {
              await new Promise((r) => setTimeout(r, Math.min(1000 * Math.pow(2, attempt), 8000)));
              continue;
            }
          }
          if (response.status === 408 || response.status === 429) {
            if (attempt < MAX_RETRIES) {
              await new Promise((r) => setTimeout(r, Math.min(1500 * Math.pow(2, attempt), 15000)));
              continue;
            }
          }
          throw new Error(`Google upload failed: ${response.status} ${errorBody}`);
        }

        await removeUploadSession(workspaceId, id).catch(() => {});
        return NextResponse.json(await response.json());
      } catch (error) {
        lastError = error;
        if ((error as Error)?.message?.includes("Upload session expired")) throw error;
        if (attempt >= MAX_RETRIES) break;
        const msg = (error as Error)?.message || "";
        if (msg.includes("fetch failed") || msg.includes("network") || msg.includes("timeout") || msg.includes("ECONNRESET")) {
          await new Promise((r) => setTimeout(r, Math.min(1000 * Math.pow(2, attempt), 10000)));
          continue;
        }
        break;
      }
    }

    throw lastError ?? new Error("Upload chunk failed after retries");
  } catch (error) {
    const msg = (error as Error)?.message || "Unknown error";
    if (msg.includes("Upload session expired")) {
      return NextResponse.json({ error: msg, expired: true }, { status: 410 });
    }
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
