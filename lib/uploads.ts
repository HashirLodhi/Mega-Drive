import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { dataPath } from "./data-path";

type UploadSession = { workspaceId: string; id: string; accountId: string; location: string; createdAt: number };
const file = dataPath("uploads.json");
const MAX_RETRIES = 3;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function read(): Promise<UploadSession[]> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const data = await readFile(file, "utf8");
      const sessions = JSON.parse(data) as UploadSession[];
      return Array.isArray(sessions) ? sessions : [];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      if ((error as NodeJS.ErrnoException).code === "EBUSY" || (error as NodeJS.ErrnoException).code === "EACCES") {
        if (attempt < MAX_RETRIES - 1) { await sleep(50 * (attempt + 1)); continue; }
      }
      if (error instanceof SyntaxError) return [];
      if (attempt < MAX_RETRIES - 1) { await sleep(50 * (attempt + 1)); continue; }
      throw error;
    }
  }
  return [];
}

async function write(items: UploadSession[]) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  const filtered = items.filter((x) => Date.now() - x.createdAt < 86_400_000);
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await writeFile(temp, JSON.stringify(filtered), { mode: 0o600 });
      await rename(temp, file);
      return;
    } catch (error) {
      if (attempt < MAX_RETRIES - 1) { await sleep(50 * (attempt + 1)); continue; }
      try { const { unlink } = await import("node:fs/promises"); await unlink(temp).catch(() => {}); } catch { /* best effort */ }
      throw error;
    }
  }
}

export async function saveUploadSession(session: UploadSession) {
  await write([session, ...(await read()).filter((x) => x.workspaceId !== session.workspaceId || x.id !== session.id)]);
}
export async function getUploadSession(workspaceId: string, id: string) {
  return (await read()).find((x) => x.workspaceId === workspaceId && x.id === id) ?? null;
}
export async function removeUploadSession(workspaceId: string, id: string) {
  await write((await read()).filter((x) => x.workspaceId !== workspaceId || x.id !== id));
}
