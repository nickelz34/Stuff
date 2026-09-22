import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { Bin, Item } from "@/types";

const MANIFEST_NAME = "manifest.json";
const INVENTORY_NAME = "inventory.json";
const FORMAT_VERSION = 1;
const MAX_ARCHIVE_BYTES = 80 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 120 * 1024 * 1024;
const MAX_INVENTORY_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_BINS = 2000;
const MAX_ITEMS = 500;
const IMAGE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.(?:jpe?g|png|webp|gif)$/i;
const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupError";
  }
}

export function imageNameFromPhoto(photo: string | null): string | null {
  if (!photo || !photo.startsWith("/images/")) return null;
  const name = photo.slice("/images/".length).split("?")[0].split("#")[0];
  if (!name || name.includes("/") || name.includes("\\")) return null;
  if (!IMAGE_NAME.test(name)) return null;
  return name;
}

export function buildBackupArchive(
  bins: Bin[],
  images: Map<string, Uint8Array>,
): Uint8Array {
  const archivedBins = bins.map((bin) => {
    const name = imageNameFromPhoto(bin.photo);
    const photo = name && images.has(name) ? `/images/${name}` : null;
    return {
      id: bin.id,
      bin_number: bin.bin_number,
      notes: bin.notes,
      items: bin.items.map((item) => ({
        id: item.id,
        name: item.name,
        qty: item.qty,
      })),
      photo,
      updatedAt: bin.updatedAt,
    };
  });

  const files: Record<string, [Uint8Array, { level: 0 | 6 }]> = {
    [MANIFEST_NAME]: [
      strToU8(JSON.stringify({ app: "stuff", format: FORMAT_VERSION })),
      { level: 6 },
    ],
    [INVENTORY_NAME]: [strToU8(JSON.stringify(archivedBins, null, 2)), { level: 6 }],
  };

  for (const bin of archivedBins) {
    const name = imageNameFromPhoto(bin.photo);
    if (!name) continue;
    const data = images.get(name);
    if (!data || files[`images/${name}`]) continue;
    files[`images/${name}`] = [data, { level: 0 }];
  }

  return zipSync(files);
}

export function parseBackupArchive(bytes: Uint8Array): {
  bins: Bin[];
  images: Map<string, Uint8Array>;
} {
  if (bytes.byteLength === 0) {
    throw new BackupError("That file is empty.");
  }
  if (bytes.byteLength > MAX_ARCHIVE_BYTES) {
    throw new BackupError("That backup is too large.");
  }

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new BackupError("That file is not a valid zip backup.");
  }

  const total = Object.values(entries).reduce((sum, entry) => sum + entry.byteLength, 0);
  if (total > MAX_UNCOMPRESSED_BYTES) {
    throw new BackupError("That backup is too large.");
  }

  const manifestBytes = entries[MANIFEST_NAME];
  if (!manifestBytes) {
    throw new BackupError("This zip is not a Stuff backup.");
  }
  let manifest: unknown;
  try {
    manifest = JSON.parse(strFromU8(manifestBytes));
  } catch {
    throw new BackupError("This zip is not a Stuff backup.");
  }
  if (
    !manifest ||
    typeof manifest !== "object" ||
    (manifest as { app?: unknown }).app !== "stuff"
  ) {
    throw new BackupError("This zip is not a Stuff backup.");
  }
  if ((manifest as { format?: unknown }).format !== FORMAT_VERSION) {
    throw new BackupError("This backup was made by a newer version of Stuff.");
  }

  const inventoryBytes = entries[INVENTORY_NAME];
  if (!inventoryBytes) {
    throw new BackupError("This backup is missing inventory.json.");
  }
  if (inventoryBytes.byteLength > MAX_INVENTORY_BYTES) {
    throw new BackupError("inventory.json is too large.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(strFromU8(inventoryBytes));
  } catch {
    throw new BackupError("inventory.json is not valid JSON.");
  }
  if (!Array.isArray(parsed)) {
    throw new BackupError("inventory.json is not a list of bins.");
  }
  if (parsed.length > MAX_BINS) {
    throw new BackupError("That backup has too many bins.");
  }

  const images = new Map<string, Uint8Array>();
  for (const [rawName, data] of Object.entries(entries)) {
    const name = rawName.replace(/\\/g, "/");
    if (name.endsWith("/") || name.startsWith("__MACOSX/") || name.split("/").includes(".DS_Store")) {
      continue;
    }
    if (pathDirname(name) !== "images") continue;
    const base = name.slice("images/".length);
    if (base.includes("/") || base.includes("..") || !IMAGE_NAME.test(base)) continue;
    if (data.byteLength > MAX_IMAGE_BYTES) {
      throw new BackupError(`Image ${base} is too large.`);
    }
    if (data.byteLength === 0) continue;
    images.set(base, data);
  }

  const bins = parsed.map((entry, index) => normalizeBin(entry, index, images));
  const binIds = new Set<string>();
  for (const bin of bins) {
    if (binIds.has(bin.id)) {
      throw new BackupError("Backup contains duplicate bin ids.");
    }
    binIds.add(bin.id);
  }

  return { bins, images };
}

function normalizeBin(entry: unknown, index: number, images: Map<string, Uint8Array>): Bin {
  if (!entry || typeof entry !== "object") {
    throw new BackupError(`Bin ${index + 1} is not valid.`);
  }
  const bin = entry as Partial<Bin>;
  if (typeof bin.id !== "string" || !SAFE_ID.test(bin.id)) {
    throw new BackupError(`Bin ${index + 1} has an invalid id.`);
  }
  if (typeof bin.bin_number !== "string" || bin.bin_number.trim() === "" || bin.bin_number.length > 20) {
    throw new BackupError(`Bin ${bin.id} has an invalid bin number.`);
  }
  if (typeof bin.notes !== "string" || bin.notes.length > 5000) {
    throw new BackupError(`Bin ${bin.bin_number} has invalid notes.`);
  }
  if (!Array.isArray(bin.items) || bin.items.length > MAX_ITEMS) {
    throw new BackupError(`Bin ${bin.bin_number} has an invalid item list.`);
  }
  if (typeof bin.updatedAt !== "string" || bin.updatedAt.length === 0 || bin.updatedAt.length > 40) {
    throw new BackupError(`Bin ${bin.bin_number} has an invalid updated time.`);
  }

  const items = bin.items.map((item, itemIndex) => normalizeItem(item, bin.bin_number ?? "", itemIndex));
  const itemIds = new Set<string>();
  for (const item of items) {
    if (itemIds.has(item.id)) {
      throw new BackupError(`Bin ${bin.bin_number} contains duplicate item ids.`);
    }
    itemIds.add(item.id);
  }

  if (bin.photo !== null && typeof bin.photo !== "string") {
    throw new BackupError(`Bin ${bin.bin_number} has an invalid photo.`);
  }
  const storedName = imageNameFromPhoto(typeof bin.photo === "string" ? bin.photo : null);
  const photoName = storedName && images.has(storedName) ? storedName : null;

  return {
    id: bin.id,
    bin_number: bin.bin_number,
    notes: bin.notes,
    items,
    photo: photoName ? `/images/${photoName}` : null,
    updatedAt: bin.updatedAt,
  };
}

function normalizeItem(entry: unknown, binNumber: string, index: number): Item {
  if (!entry || typeof entry !== "object") {
    throw new BackupError(`Bin ${binNumber} item ${index + 1} is not valid.`);
  }
  const item = entry as Partial<Item>;
  if (typeof item.id !== "string" || !SAFE_ID.test(item.id)) {
    throw new BackupError(`Bin ${binNumber} has an item with an invalid id.`);
  }
  if (typeof item.name !== "string" || item.name.trim() === "" || item.name.length > 200) {
    throw new BackupError(`Bin ${binNumber} has an item with an invalid name.`);
  }
  if (typeof item.qty !== "number" || !Number.isInteger(item.qty) || item.qty < 0 || item.qty > 1_000_000) {
    throw new BackupError(`Bin ${binNumber} has an item with an invalid quantity.`);
  }
  return { id: item.id, name: item.name, qty: item.qty };
}

function pathDirname(name: string): string {
  const index = name.lastIndexOf("/");
  return index === -1 ? "" : name.slice(0, index);
}
