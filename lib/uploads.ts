import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { dataPath } from "./data-path";
import { redis, redisConfigured } from "./redis";
type UploadSession = { workspaceId: string; id: string; accountId: string; location: string; createdAt: number };
const file = dataPath("uploads.json");
async function read(): Promise<UploadSession[]> { try { return JSON.parse(await readFile(file, "utf8")); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; } }
async function write(items: UploadSession[]) { await mkdir(path.dirname(file), { recursive: true }); const temp = `${file}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`; await writeFile(temp, JSON.stringify(items.filter((x) => Date.now() - x.createdAt < 86_400_000))); await rename(temp, file); }
const uploadKey = (workspaceId: string, id: string) => `megadrive:workspace:${workspaceId}:upload:${id}`;
function useRedis() { if (redisConfigured()) return true; if (process.env.VERCEL) redis(); return false; }
export async function saveUploadSession(session: UploadSession) { if(useRedis()){await redis().set(uploadKey(session.workspaceId,session.id),session,{ex:86_400});return}await write([session, ...(await read()).filter((x) => x.workspaceId!==session.workspaceId||x.id !== session.id)]); }
export async function getUploadSession(workspaceId:string,id: string) { if(useRedis())return await redis().get<UploadSession>(uploadKey(workspaceId,id));return (await read()).find((x) => x.workspaceId===workspaceId&&x.id === id) ?? null; }
export async function removeUploadSession(workspaceId:string,id: string) { if(useRedis()){await redis().del(uploadKey(workspaceId,id));return}await write((await read()).filter((x) => x.workspaceId!==workspaceId||x.id !== id)); }
