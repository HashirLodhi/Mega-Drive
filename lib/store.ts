import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile, copyFile, unlink } from "node:fs/promises";
import type { ConnectedAccount } from "./types";
import { dataPath } from "./data-path";

type Database = { accounts: ConnectedAccount[] };
const dataDir = dataPath();
const dataFile = dataPath("accounts.enc");
const backupFile = dataPath("accounts.enc.bak");
const MAX_RETRIES = 3;

function key() {
  const secret = process.env.MEGADRIVE_ENCRYPTION_KEY;
  if (!secret || secret.length < 24) throw new Error("MEGADRIVE_ENCRYPTION_KEY must contain at least 24 characters");
  return createHash("sha256").update(secret).digest();
}

function encrypt(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const payload = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), payload]).toString("base64");
}

function decrypt<T>(value: string): T {
  const input = Buffer.from(value, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), input.subarray(0, 12));
  decipher.setAuthTag(input.subarray(12, 28));
  const payload = Buffer.concat([decipher.update(input.subarray(28)), decipher.final()]);
  return JSON.parse(payload.toString("utf8")) as T;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readDatabase(): Promise<Database> {
  await mkdir(dataDir, { recursive: true });
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return decrypt<Database>(await readFile(dataFile, "utf8"));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        if (attempt > 0) return { accounts: [] };
        await sleep(100);
        continue;
      }
      if (code === "EBUSY" || code === "EACCES" || (error as Error)?.message?.includes("EBUSY")) {
        if (attempt < MAX_RETRIES - 1) { await sleep(100 * (attempt + 1)); continue; }
      }
      if (attempt === 0 && backupFile) {
        try {
          const backupData = await readFile(backupFile, "utf8");
          const result = decrypt<Database>(backupData);
          await writeFile(dataFile, backupData, { encoding: "utf8", mode: 0o600 });
          return result;
        } catch {
          // backup also corrupt or missing, continue to throw
        }
      }
      if (error instanceof SyntaxError || (error as Error)?.message?.includes("Unsupported state") || (error as Error)?.message?.includes("unable to authenticate")) {
        if (backupFile) {
          try {
            const backupData = await readFile(backupFile, "utf8");
            const result = decrypt<Database>(backupData);
            await writeFile(dataFile, backupData, { encoding: "utf8", mode: 0o600 });
            return result;
          } catch {
            // backup also corrupt, reset to empty
            const empty: Database = { accounts: [] };
            await writeDatabase(empty);
            return empty;
          }
        }
        const empty: Database = { accounts: [] };
        await writeDatabase(empty);
        return empty;
      }
      if (attempt < MAX_RETRIES - 1) { await sleep(100 * (attempt + 1)); continue; }
      throw error;
    }
  }
  return { accounts: [] };
}

async function writeDatabase(database: Database) {
  await mkdir(dataDir, { recursive: true });
  const temporary = `${dataFile}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      try { await copyFile(dataFile, backupFile); } catch { /* no existing file to back up */ }
      await writeFile(temporary, encrypt(database), { encoding: "utf8", mode: 0o600 });
      await rename(temporary, dataFile);
      return;
    } catch (error) {
      if (attempt < MAX_RETRIES - 1) { await sleep(100 * (attempt + 1)); continue; }
      try { await unlink(temporary).catch(() => {}); } catch { /* best effort */ }
      throw error;
    }
  }
}

async function mutateDatabase(change: (database: Database) => void) {
  const mutation = async () => { const database = await readDatabase(); change(database); await writeDatabase(database); };
  const pending = localWriteQueue.then(mutation, mutation);
  localWriteQueue = pending.then(() => undefined, () => undefined);
  await pending;
}

let localWriteQueue = Promise.resolve();

export async function listAccounts(workspaceId: string) {
  return (await readDatabase()).accounts.filter((account) => account.workspaceId === workspaceId);
}
export async function getAccount(workspaceId: string, id: string) {
  return (await readDatabase()).accounts.find((account) => account.workspaceId === workspaceId && account.id === id) ?? null;
}
export async function saveAccount(account: ConnectedAccount) {
  await mutateDatabase((database) => { database.accounts = [account, ...database.accounts.filter((item) => item.workspaceId !== account.workspaceId || (item.id !== account.id && item.email !== account.email))]; });
}
export async function removeAccount(workspaceId: string, id: string) {
  await mutateDatabase((database) => { database.accounts = database.accounts.filter((account) => account.workspaceId !== workspaceId || account.id !== id); });
}
export async function updateAccount(account: ConnectedAccount) { await saveAccount(account); }
