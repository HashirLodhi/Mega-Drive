import { NextRequest, NextResponse } from "next/server";
import { listAccounts, removeAccount } from "@/lib/store";
import { publicAccount } from "@/lib/google";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET() { try { const source = await listAccounts(); const settled = await Promise.allSettled(source.map(publicAccount)); return NextResponse.json({ accounts: settled.flatMap((r) => r.status === "fulfilled" ? [r.value] : []), errors: settled.flatMap((r, i) => r.status === "rejected" ? [{ accountId: source[i].id, message: r.reason instanceof Error ? r.reason.message : "Account unavailable" }] : []) }); } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 500 }); } }
export async function DELETE(request: NextRequest) { try { const id = request.nextUrl.searchParams.get("id"); if (!id) return NextResponse.json({ error: "Account id is required" }, { status: 400 }); await removeAccount(id); return NextResponse.json({ ok: true }); } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 500 }); } }
