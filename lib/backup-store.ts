import { promises as fs } from "fs";
import path from "path";
import { buildBackupArchive, imageNameFromPhoto, parseBackupArchive } from "@/lib/backup";
import { DATA_PATH, IMAGES_DIR, enqueue, readBins, writeBins } from "@/lib/inventory-db";
import type { Bin } from "@/types";

export async function createBackupZip(): Promise<Uint8Array> {
  return enqueue(async () => {
    const bins = await readBins();
    const images = new Map<string, Uint8Array>();
    for (const bin of bins) {
      const name = imageNameFromPhoto(bin.photo);
      if (!name || images.has(name)) continue;
      try {
        const data = await fs.readFile(path.join(IMAGES_DIR, name));
        images.set(name, new Uint8Array(data));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    return buildBackupArchive(bins, images);
  });
}

export async function restoreBackupZip(
  bytes: Uint8Array,
): Promise<{ bins: number; photos: number }> {
  return enqueue(async () => {
    const parsed = parseBackupArchive(bytes);
    await fs.mkdir(IMAGES_DIR, { recursive: true });
    await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });

    const stamp = `${Date.now()}`;
    const staged: string[] = [];
    let bins: Bin[];
    try {
      for (const [name, data] of Array.from(parsed.images.entries())) {
        const stagedName = `.restore-${stamp}-${name}`;
        await fs.writeFile(path.join(IMAGES_DIR, stagedName), data);
        staged.push(stagedName);
      }

      for (const name of Array.from(parsed.images.keys())) {
        await fs.rename(
          path.join(IMAGES_DIR, `.restore-${stamp}-${name}`),
          path.join(IMAGES_DIR, name),
        );
      }

      const restoredAt = Date.now();
      bins = parsed.bins.map((bin) =>
        bin.photo ? { ...bin, photo: `${bin.photo}?t=${restoredAt}` } : bin,
      );
      await writeBins(bins);
    } catch (error) {
      await Promise.all(staged.map((name) => fs.rm(path.join(IMAGES_DIR, name), { force: true })));
      throw error;
    }

    const kept = new Set(parsed.images.keys());
    const existing = await fs.readdir(IMAGES_DIR).catch(() => [] as string[]);
    await Promise.all(
      existing
        .filter((name) => name !== ".gitkeep" && !name.startsWith(".restore-") && !kept.has(name))
        .map((name) => fs.rm(path.join(IMAGES_DIR, name), { force: true })),
    );

    return {
      bins: bins.length,
      photos: bins.filter((bin) => bin.photo).length,
    };
  });
}
