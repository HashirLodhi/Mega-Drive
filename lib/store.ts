import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ConnectedAccount } from "./types";

type Database = { accounts: ConnectedAccount[] };
const dataDir = path.join(process.cwd(), ".data");
const dataFile = path.join(dataDir, "accounts.enc");

function key() {
  const secret = process.env.MEGADRIVE_ENCRYPTION_KEY;
  if (!secret || secret.length < 24) throw new Error("MEGADRIVE_ENCRYPTION_KEY must contain at least 24 characters");
  return createHash("sha256").update(secret).digest();
}

function encrypt(value: Database) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const payload = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), payload]).toString("base64");
}

function decrypt(value: string): Database {
  const input = Buffer.from(value, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), input.subarray(0, 12));
  decipher.setAuthTag(input.subarray(12, 28));
  const payload = Buffer.concat([decipher.update(input.subarray(28)), decipher.final()]);
  return JSON.parse(payload.toString("utf8")) as Database;
}

async function readDatabase(): Promise<Database> {
  await mkdir(dataDir, { recursive: true });
  try { return decrypt(await readFile(dataFile, "utf8")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { accounts: [] };
    throw error;
  }
}

async function writeDatabase(database: Database) {
  await mkdir(dataDir, { recursive: true });
  const temporary = `${dataFile}.${process.pid}.tmp`;
  await writeFile(temporary, encrypt(database), { encoding: "utf8", mode: 0o600 });
  await rename(temporary, dataFile);
}

export async function listAccounts() { return (await readDatabase()).accounts; }
export async function getAccount(id: string) { return (await readDatabase()).accounts.find((account) => account.id === id) ?? null; }
export async function saveAccount(account: ConnectedAccount) {
  const database = await readDatabase();
  database.accounts = [account, ...database.accounts.filter((item) => item.id !== account.id && item.email !== account.email)];
  await writeDatabase(database);
}
export async function removeAccount(id: string) {
  const database = await readDatabase();
  database.accounts = database.accounts.filter((account) => account.id !== id);
  await writeDatabase(database);
}
export async function updateAccount(account: ConnectedAccount) { await saveAccount(account); }
