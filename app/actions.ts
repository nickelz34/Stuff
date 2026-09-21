"use server";

import { promises as fs } from "fs";
import path from "path";
import { revalidatePath } from "next/cache";
import type { Bin, Item } from "@/types";

const DATA_PATH = path.join(process.cwd(), "data", "inventory.json");
const IMAGES_DIR = path.join(process.cwd(), "public", "images");

let writeQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(task, task);
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function readBins(): Promise<Bin[]> {
  const raw = await fs.readFile(DATA_PATH, "utf8");
  return JSON.parse(raw) as Bin[];
}

async function writeBins(data: Bin[]): Promise<void> {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2), "utf8");
}

function touch(bin: Bin): void {
  bin.updatedAt = new Date().toISOString();
}

function canonicalBinNumber(binNumber: string): number | null {
  const trimmed = binNumber.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value <= 0) return null;
  return value;
}

function formatBinNumber(value: number): string {
  return String(value).padStart(2, "0");
}

export type BinNumberResult =
  | { ok: true; binNumber: string }
  | { ok: false; error: string };

function normalizeBinNumber(input: string): BinNumberResult {
  const value = canonicalBinNumber(input);
  if (value === null) {
    return { ok: false, error: "Use a whole number, like 2 or 02." };
  }
  return { ok: true, binNumber: formatBinNumber(value) };
}

function compareBins(a: Bin, b: Bin): number {
  const aValue = canonicalBinNumber(a.bin_number);
  const bValue = canonicalBinNumber(b.bin_number);
  if (aValue !== null && bValue !== null && aValue !== bValue) return aValue - bValue;
  return a.bin_number.localeCompare(b.bin_number);
}

async function renameBinPhoto(bin: Bin, nextNumber: string): Promise<void> {
  if (!bin.photo || bin.bin_number === nextNumber) return;
  const nextFilename = `bin_${nextNumber}.jpg`;
  const oldPath = path.join(IMAGES_DIR, `bin_${bin.bin_number}.jpg`);
  const nextPath = path.join(IMAGES_DIR, nextFilename);
  try {
    await fs.access(oldPath);
  } catch {
    return;
  }
  await fs.mkdir(IMAGES_DIR, { recursive: true });
  await fs.rm(nextPath, { force: true });
  await fs.rename(oldPath, nextPath);
  bin.photo = `/images/${nextFilename}?t=${Date.now()}`;
}

export async function getBins(): Promise<Bin[]> {
  return enqueue(async () => {
    const bins = await readBins();
    return bins.sort(compareBins);
  });
}

export async function addBin(): Promise<Bin> {
  return enqueue(async () => {
    const bins = await readBins();
    const max = bins.reduce(
      (highest, bin) => Math.max(highest, parseInt(bin.bin_number, 10) || 0),
      0,
    );
    const bin: Bin = {
      id: crypto.randomUUID(),
      bin_number: String(max + 1).padStart(2, "0"),
      notes: "",
      items: [],
      photo: null,
      updatedAt: new Date().toISOString(),
    };
    bins.push(bin);
    await writeBins(bins);
    revalidatePath("/");
    return bin;
  });
}

export async function deleteBin(id: string): Promise<void> {
  return enqueue(async () => {
    const bins = await readBins();
    await writeBins(bins.filter((bin) => bin.id !== id));
    revalidatePath("/");
  });
}

export async function updateBinNumber(id: string, binNumber: string): Promise<BinNumberResult> {
  const normalized = normalizeBinNumber(binNumber);
  if (!normalized.ok) return normalized;

  return enqueue(async () => {
    const bins = await readBins();
    const bin = bins.find((entry) => entry.id === id);
    if (!bin) return { ok: false, error: "That bin is gone." };

    const nextNumber = normalized.binNumber;
    if (bin.bin_number === nextNumber) return { ok: true, binNumber: nextNumber };

    const taken = bins.some(
      (entry) => entry.id !== id && canonicalBinNumber(entry.bin_number) === canonicalBinNumber(nextNumber),
    );
    if (taken) return { ok: false, error: `Bin ${nextNumber} already exists.` };

    await renameBinPhoto(bin, nextNumber);
    bin.bin_number = nextNumber;
    touch(bin);
    await writeBins(bins);
    revalidatePath("/");
    return { ok: true, binNumber: nextNumber };
  });
}

export async function updateNotes(id: string, notes: string): Promise<void> {
  return enqueue(async () => {
    const bins = await readBins();
    const bin = bins.find((entry) => entry.id === id);
    if (!bin) return;
    bin.notes = notes;
    touch(bin);
    await writeBins(bins);
    revalidatePath("/");
  });
}

export async function addItem(binId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  return enqueue(async () => {
    const bins = await readBins();
    const bin = bins.find((entry) => entry.id === binId);
    if (!bin) return;
    const item: Item = {
      id: crypto.randomUUID(),
      name: trimmed,
      qty: 1,
    };
    bin.items.push(item);
    touch(bin);
    await writeBins(bins);
    revalidatePath("/");
  });
}

export async function updateQty(
  binId: string,
  itemId: string,
  qty: number,
): Promise<void> {
  return enqueue(async () => {
    const bins = await readBins();
    const bin = bins.find((entry) => entry.id === binId);
    if (!bin) return;
    if (qty <= 0) {
      bin.items = bin.items.filter((item) => item.id !== itemId);
    } else {
      const item = bin.items.find((entry) => entry.id === itemId);
      if (!item) return;
      item.qty = qty;
    }
    touch(bin);
    await writeBins(bins);
    revalidatePath("/");
  });
}

export async function deleteItem(binId: string, itemId: string): Promise<void> {
  return enqueue(async () => {
    const bins = await readBins();
    const bin = bins.find((entry) => entry.id === binId);
    if (!bin) return;
    bin.items = bin.items.filter((item) => item.id !== itemId);
    touch(bin);
    await writeBins(bins);
    revalidatePath("/");
  });
}

export async function uploadBinPhoto(formData: FormData): Promise<string | null> {
  const binId = String(formData.get("binId") ?? "");
  const file = formData.get("photo");
  if (!binId || !(file instanceof File) || file.size === 0) return null;
  const bytes = Buffer.from(await file.arrayBuffer());

  return enqueue(async () => {
    const bins = await readBins();
    const bin = bins.find((entry) => entry.id === binId);
    if (!bin) return null;

    await fs.mkdir(IMAGES_DIR, { recursive: true });
    const filename = `bin_${bin.bin_number}.jpg`;
    await fs.writeFile(path.join(IMAGES_DIR, filename), bytes);

    const photo = `/images/${filename}?t=${Date.now()}`;
    bin.photo = photo;
    touch(bin);
    await writeBins(bins);
    revalidatePath("/");
    return photo;
  });
}
