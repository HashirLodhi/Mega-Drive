import { randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

export const workspaceCookie = "megadrive_workspace";
const validWorkspace = /^[A-Za-z0-9_-]{43}$/;

export function workspaceFromRequest(request: NextRequest) {
  const localWorkspace = process.env.MEGADRIVE_WORKSPACE_ID;
  if (localWorkspace && validWorkspace.test(localWorkspace)) return localWorkspace;
  const value = request.cookies.get(workspaceCookie)?.value;
  return value && validWorkspace.test(value) ? value : null;
}

export function workspaceForOAuth(request: NextRequest) {
  return workspaceFromRequest(request) ?? randomBytes(32).toString("base64url");
}

export function setWorkspaceCookie(response: NextResponse, workspaceId: string) {
  response.cookies.set(workspaceCookie, workspaceId, { httpOnly: true, sameSite: "lax", secure: false, maxAge: 31_536_000, path: "/" });
}
