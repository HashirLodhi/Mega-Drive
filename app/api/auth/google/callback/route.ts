import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, readProfile } from "@/lib/google";
import { saveAccount } from "@/lib/store";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const redirectUri = new URL("/api/auth/google/callback", origin).toString();
  try { const code = request.nextUrl.searchParams.get("code"); const state = request.nextUrl.searchParams.get("state"); const expected = request.cookies.get("megadrive_oauth_state")?.value; if (!code || !state || !expected || state !== expected) throw new Error("OAuth validation failed. Please connect again."); const token = await exchangeCode(code, redirectUri); const profile = await readProfile(token); await saveAccount({ id: profile.sub, email: profile.email, name: profile.name || profile.email, picture: profile.picture, token, connectedAt: new Date().toISOString() }); const response = NextResponse.redirect(new URL("/?connected=1", origin)); response.cookies.delete("megadrive_oauth_state"); return response; }
  catch (error) { return NextResponse.redirect(new URL(`/?error=${encodeURIComponent((error as Error).message)}`, origin)); }
}
