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
  const raw = await fs.readFile(DATA_PATH, "utf8");
  return JSON.parse(raw) as Bin[];
}

export async function writeBins(data: Bin[]): Promise<void> {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2), "utf8");
}
