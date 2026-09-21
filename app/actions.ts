"use server";

import { promises as fs } from "fs";
import path from "path";
import { revalidatePath } from "next/cache";
import { IMAGES_DIR, enqueue, readBins, writeBins } from "@/lib/inventory-db";
import type { Bin, Item } from "@/types";

function touch(bin: Bin): void {
  bin.updatedAt = new Date().toISOString();
}

export async function getBins(): Promise<Bin[]> {
  return enqueue(() => readBins());
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
