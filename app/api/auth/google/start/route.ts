import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { authorizationUrl } from "@/lib/google";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const redirectUri = new URL("/api/auth/google/callback", origin).toString();
  try { const state = randomBytes(32).toString("base64url"); const response = NextResponse.redirect(authorizationUrl(state, redirectUri)); response.cookies.set("megadrive_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/" }); return response; }
  catch (error) { return NextResponse.redirect(new URL(`/?error=${encodeURIComponent((error as Error).message)}`, origin)); }
}
