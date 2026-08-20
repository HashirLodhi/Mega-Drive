import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { dataPath } from "./data-path";
import { redis, redisConfigured } from "./redis";
type UploadSession = { id: string; accountId: string; location: string; createdAt: number };
const file = dataPath("uploads.json");
async function read(): Promise<UploadSession[]> { try { return JSON.parse(await readFile(file, "utf8")); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; } }
async function write(items: UploadSession[]) { await mkdir(path.dirname(file), { recursive: true }); const temp = `${file}.${process.pid}.tmp`; await writeFile(temp, JSON.stringify(items.filter((x) => Date.now() - x.createdAt < 86_400_000))); await rename(temp, file); }
const uploadKey = (id: string) => `megadrive:upload:${id}`;
function useRedis() { if (redisConfigured()) return true; if (process.env.VERCEL) redis(); return false; }
export async function saveUploadSession(session: UploadSession) { if(useRedis()){await redis().set(uploadKey(session.id),session,{ex:86_400});return}await write([session, ...(await read()).filter((x) => x.id !== session.id)]); }
export async function getUploadSession(id: string) { if(useRedis())return await redis().get<UploadSession>(uploadKey(id));return (await read()).find((x) => x.id === id) ?? null; }
export async function removeUploadSession(id: string) { if(useRedis()){await redis().del(uploadKey(id));return}await write((await read()).filter((x) => x.id !== id)); }
