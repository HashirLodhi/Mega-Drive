import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { authorizationUrl } from "@/lib/google";
export const runtime = "nodejs";
export async function GET() {
  try { const state = randomBytes(32).toString("base64url"); const response = NextResponse.redirect(authorizationUrl(state)); response.cookies.set("megadrive_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/" }); return response; }
  catch (error) { return NextResponse.redirect(new URL(`/?error=${encodeURIComponent((error as Error).message)}`, process.env.APP_ORIGIN ?? "http://localhost:3000")); }
}
