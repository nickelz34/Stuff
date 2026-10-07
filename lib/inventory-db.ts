import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import type { Bin } from "@/types";

export const DATA_PATH = path.join(process.cwd(), "data", "inventory.json");
export const IMAGES_DIR = path.join(process.cwd(), "public", "images");

let writeQueue: Promise<unknown> = Promise.resolve();

export function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(task, task);
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function readBins(): Promise<Bin[]> {
  let raw: string;
  try {
    raw = await fs.readFile(DATA_PATH, "utf8");
  } catch (error) {
    // The inventory file is local-only (gitignored), so a fresh checkout has none yet.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return JSON.parse(raw) as Bin[];
}

export async function writeBins(data: Bin[]): Promise<void> {
  const dir = path.dirname(DATA_PATH);
  await fs.mkdir(dir, { recursive: true });
  // Write a sibling temp file and rename it over the real one. rename() is atomic on
  // the same filesystem, so a crash mid-write can never leave a truncated inventory.json.
  const temp = path.join(dir, `.inventory-${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temp, JSON.stringify(data, null, 2), "utf8");
    await fs.rename(temp, DATA_PATH);
  } catch (error) {
    await fs.rm(temp, { force: true });
    throw error;
  }
}
