import "server-only";
import path from "node:path";

export function dataPath(...parts: string[]) {
  const configuredDirectory = process.env.MEGADRIVE_DATA_DIR?.trim();
  const directory = configuredDirectory ? path.resolve(configuredDirectory) : path.join(process.cwd(), ".data");

  return path.join(directory, ...parts);
}
