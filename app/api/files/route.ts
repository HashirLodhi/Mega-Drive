import { NextRequest, NextResponse } from "next/server";
import { getAccount } from "@/lib/store";
import { driveBase, googleFetch, listDriveFiles, permanentlyDelete, removeFromMyDrive, setTrashed } from "@/lib/google";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) { try { const accountId = request.nextUrl.searchParams.get("accountId"); if (!accountId) return NextResponse.json({ error: "Select an account" }, { status: 400 }); const account = await getAccount(accountId); if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 }); return NextResponse.json(await listDriveFiles(account, { trashed: request.nextUrl.searchParams.get("trashed") === "true", query: request.nextUrl.searchParams.get("q") ?? undefined, pageToken: request.nextUrl.searchParams.get("pageToken") })); } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 502 }); } }
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as { accountId?: string; fileIds?: string[]; trashed?: boolean; action?: "removeFromMyDrive" };
    if (!body.accountId || !body.fileIds?.length) return NextResponse.json({ error: "accountId and fileIds are required" }, { status: 400 });
    const account = await getAccount(body.accountId);
    if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

    if (body.action === "removeFromMyDrive") {
      const metadata = await Promise.all(body.fileIds.map(async (id) => (await googleFetch(account, `${driveBase}/files/${encodeURIComponent(id)}?fields=id,name,parents,capabilities(canRemoveMyDriveParent)&supportsAllDrives=true`)).json() as Promise<{ id: string; name: string; parents?: string[]; capabilities?: { canRemoveMyDriveParent?: boolean } }>));
      const blocked = metadata.filter((file) => !file.capabilities?.canRemoveMyDriveParent || file.parents?.length !== 1);
      if (blocked.length) return NextResponse.json({ error: `${blocked.length} item(s) cannot be removed because their location is inherited or managed by someone else.` }, { status: 403 });
      await Promise.all(metadata.map((file) => removeFromMyDrive(account, file.id, file.parents![0])));
      return NextResponse.json({ ok: true });
    }

    if (typeof body.trashed !== "boolean") return NextResponse.json({ error: "trashed is required" }, { status: 400 });
    const metadata = await Promise.all(body.fileIds.map(async (id) => (await googleFetch(account, `${driveBase}/files/${encodeURIComponent(id)}?fields=name,capabilities(canTrash)&supportsAllDrives=true`)).json() as Promise<{ name: string; capabilities?: { canTrash?: boolean } }>));
    const blocked = metadata.filter((file) => !file.capabilities?.canTrash);
    if (blocked.length) return NextResponse.json({ error: `${blocked.length} item(s) are shared or read-only and cannot be changed by this account.` }, { status: 403 });
    await Promise.all(body.fileIds.map((id) => setTrashed(account, id, body.trashed!)));
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 502 }); }
}
export async function DELETE(request: NextRequest) { try { const body = await request.json() as { accountId?: string; fileIds?: string[] }; if (!body.accountId || !body.fileIds?.length) return NextResponse.json({ error: "accountId and fileIds are required" }, { status: 400 }); const account = await getAccount(body.accountId); if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 }); const metadata=await Promise.all(body.fileIds.map(async id=>(await googleFetch(account,`${driveBase}/files/${encodeURIComponent(id)}?fields=name,capabilities(canDelete)&supportsAllDrives=true`)).json() as Promise<{name:string;capabilities?:{canDelete?:boolean}}>)); const blocked=metadata.filter(file=>!file.capabilities?.canDelete); if(blocked.length)return NextResponse.json({error:`${blocked.length} item(s) cannot be permanently deleted because this account is not their owner.`},{status:403}); await Promise.all(body.fileIds.map((id) => permanentlyDelete(account, id))); return NextResponse.json({ ok: true }); } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 502 }); } }
