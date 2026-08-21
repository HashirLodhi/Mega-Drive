import { NextRequest } from "next/server";
import { chat, getQuickGreeting } from "@/lib/ai";
import { workspaceFromRequest } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const workspaceId = workspaceFromRequest(request);
    if (!workspaceId) return new Response(JSON.stringify({ error: "Workspace session is required" }), { status: 401, headers: { "Content-Type": "application/json" } });

    const body = await request.json() as { sessionId?: string; message?: string };
    if (!body.sessionId || !body.message) {
      return new Response(JSON.stringify({ error: "sessionId and message are required" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const stream = await chat(workspaceId, body.sessionId, body.message);
    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Transfer-Encoding": "chunked", "Cache-Control": "no-cache" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

export async function GET(request: NextRequest) {
  try {
    const workspaceId = workspaceFromRequest(request);
    if (!workspaceId) return new Response(JSON.stringify({ error: "Workspace session is required" }), { status: 401, headers: { "Content-Type": "application/json" } });

    const greeting = await getQuickGreeting(workspaceId);
    return new Response(JSON.stringify({ greeting }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
