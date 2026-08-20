import "server-only";
import os from "node:os";
import path from "node:path";

export function dataPath(...parts: string[]) {
  const configuredDirectory = process.env.MEGADRIVE_DATA_DIR?.trim();
  const directory = configuredDirectory
    ? path.resolve(configuredDirectory)
    : process.env.VERCEL
      ? path.join(os.tmpdir(), "megadrive")
      : path.join(process.cwd(), ".data");

  return path.join(directory, ...parts);
}
