import { NextRequest, NextResponse } from "next/server";
import { getAccount } from "@/lib/store";
import { driveBase, googleFetch, listDriveFiles, permanentlyDelete, removeFromMyDrive, setTrashed } from "@/lib/google";
import { workspaceFromRequest } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const accountId = request.nextUrl.searchParams.get("accountId");
    const workspaceId = workspaceFromRequest(request);
    if (!workspaceId) return NextResponse.json({ error: "Workspace session is required" }, { status: 401 });
    if (!accountId) return NextResponse.json({ error: "Select an account" }, { status: 400 });
    const account = await getAccount(workspaceId, accountId);
    if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    return NextResponse.json(await listDriveFiles(account, {
      trashed: request.nextUrl.searchParams.get("trashed") === "true",
      query: request.nextUrl.searchParams.get("q") ?? undefined,
      pageToken: request.nextUrl.searchParams.get("pageToken"),
    }));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as { accountId?: string; fileIds?: string[]; trashed?: boolean; action?: "removeFromMyDrive" };
    if (!body.accountId || !body.fileIds?.length) return NextResponse.json({ error: "accountId and fileIds are required" }, { status: 400 });
    const workspaceId = workspaceFromRequest(request);
    if (!workspaceId) return NextResponse.json({ error: "Workspace session is required" }, { status: 401 });
    const account = await getAccount(workspaceId, body.accountId);
    if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

    if (body.action === "removeFromMyDrive") {
      const results: { id: string; ok: boolean; error?: string }[] = [];
      for (const id of body.fileIds) {
        try {
          const metaResponse = await googleFetch(account, `${driveBase}/files/${encodeURIComponent(id)}?fields=id,name,parents,capabilities(canRemoveMyDriveParent)&supportsAllDrives=true`);
          const meta = await metaResponse.json() as { id: string; name: string; parents?: string[]; capabilities?: { canRemoveMyDriveParent?: boolean } };
          if (!meta.capabilities?.canRemoveMyDriveParent || meta.parents?.length !== 1) {
            results.push({ id, ok: false, error: `${meta.name} cannot be removed (location inherited or managed)` });
            continue;
          }
          await removeFromMyDrive(account, meta.id, meta.parents[0]);
          results.push({ id, ok: true });
        } catch (error) {
          results.push({ id, ok: false, error: (error as Error).message });
        }
      }
      const failures = results.filter((r) => !r.ok);
      if (failures.length === results.length) {
        return NextResponse.json({ error: `${failures.length} item(s) could not be removed.`, details: failures }, { status: 403 });
      }
      return NextResponse.json({ ok: true, results, partial: failures.length > 0 });
    }

    if (typeof body.trashed !== "boolean") return NextResponse.json({ error: "trashed is required" }, { status: 400 });
    const results: { id: string; ok: boolean; error?: string }[] = [];
    for (const id of body.fileIds) {
      try {
        const metaResponse = await googleFetch(account, `${driveBase}/files/${encodeURIComponent(id)}?fields=name,capabilities(canTrash)&supportsAllDrives=true`);
        const meta = await metaResponse.json() as { name: string; capabilities?: { canTrash?: boolean } };
        if (!meta.capabilities?.canTrash) {
          results.push({ id, ok: false, error: `${meta.name} is shared or read-only` });
          continue;
        }
        await setTrashed(account, id, body.trashed);
        results.push({ id, ok: true });
      } catch (error) {
        results.push({ id, ok: false, error: (error as Error).message });
      }
    }
    const failures = results.filter((r) => !r.ok);
    if (failures.length === results.length) {
      return NextResponse.json({ error: `${failures.length} item(s) could not be ${body.trashed ? "trashed" : "restored"}.`, details: failures }, { status: 403 });
    }
    return NextResponse.json({ ok: true, results, partial: failures.length > 0 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json() as { accountId?: string; fileIds?: string[] };
    const workspaceId = workspaceFromRequest(request);
    if (!workspaceId) return NextResponse.json({ error: "Workspace session is required" }, { status: 401 });
    if (!body.accountId || !body.fileIds?.length) return NextResponse.json({ error: "accountId and fileIds are required" }, { status: 400 });
    const account = await getAccount(workspaceId, body.accountId);
    if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

    const results: { id: string; ok: boolean; error?: string }[] = [];
    for (const id of body.fileIds) {
      try {
        const metaResponse = await googleFetch(account, `${driveBase}/files/${encodeURIComponent(id)}?fields=name,capabilities(canDelete)&supportsAllDrives=true`);
        const meta = await metaResponse.json() as { name: string; capabilities?: { canDelete?: boolean } };
        if (!meta.capabilities?.canDelete) {
          results.push({ id, ok: false, error: `${meta.name} cannot be deleted (not owned)` });
          continue;
        }
        await permanentlyDelete(account, id);
        results.push({ id, ok: true });
      } catch (error) {
        results.push({ id, ok: false, error: (error as Error).message });
      }
    }
    const failures = results.filter((r) => !r.ok);
    if (failures.length === results.length) {
      return NextResponse.json({ error: `${failures.length} item(s) could not be permanently deleted.`, details: failures }, { status: 403 });
    }
    return NextResponse.json({ ok: true, results, partial: failures.length > 0 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}
