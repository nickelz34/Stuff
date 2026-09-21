import assert from "node:assert/strict";
import test from "node:test";
import { unzipSync, zipSync, strToU8 } from "fflate";
import type { Bin } from "../types";
import { BackupError, buildBackupArchive, imageNameFromPhoto, parseBackupArchive } from "./backup";

const photo = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

function sampleBin(overrides: Partial<Bin> = {}): Bin {
  return {
    id: "bin-01",
    bin_number: "01",
    notes: "Hand tools",
    items: [{ id: "item-hammer", name: "Hammer", qty: 1 }],
    photo: "/images/bin_01.jpg?t=123",
    updatedAt: "2026-09-21T00:00:00.000Z",
    ...overrides,
  };
}

test("image names come from /images paths only", () => {
  assert.equal(imageNameFromPhoto("/images/bin_01.jpg?t=1"), "bin_01.jpg");
  assert.equal(imageNameFromPhoto("/images/../secret.jpg"), null);
  assert.equal(imageNameFromPhoto("https://example.com/images/bin_01.jpg"), null);
  assert.equal(imageNameFromPhoto(null), null);
});

test("backup zip round-trips inventory and photos", () => {
  const images = new Map<string, Uint8Array>([["bin_01.jpg", photo]]);
  const archive = buildBackupArchive([sampleBin()], images);
  const restored = parseBackupArchive(archive);

  assert.equal(restored.bins.length, 1);
  assert.equal(restored.bins[0].bin_number, "01");
  assert.equal(restored.bins[0].notes, "Hand tools");
  assert.deepEqual(restored.bins[0].items, [{ id: "item-hammer", name: "Hammer", qty: 1 }]);
  assert.equal(restored.bins[0].photo, "/images/bin_01.jpg");
  assert.deepEqual(restored.images.get("bin_01.jpg"), photo);

  const packed = unzipSync(archive);
  const manifest = JSON.parse(new TextDecoder().decode(packed["manifest.json"]));
  assert.deepEqual(manifest, { app: "stuff", format: 1 });
});

test("a photo missing from the archive is cleared on restore", () => {
  const archive = buildBackupArchive([sampleBin()], new Map());
  const restored = parseBackupArchive(archive);
  assert.equal(restored.bins[0].photo, null);
  assert.equal(restored.images.size, 0);
});

test("restore rejects zip files that are not Stuff backups", () => {
  const archive = zipSync({
    "inventory.json": strToU8("[]"),
  });
  assert.throws(() => parseBackupArchive(archive), (error: unknown) => {
    assert.ok(error instanceof BackupError);
    assert.match(error.message, /not a Stuff backup/);
    return true;
  });
});

test("restore ignores archive junk and path traversal entries", () => {
  const good = buildBackupArchive([sampleBin({ photo: null })], new Map());
  const entries = unzipSync(good);
  entries["__MACOSX/._inventory.json"] = strToU8("junk");
  entries["images/.DS_Store"] = strToU8("junk");
  entries["images/../../secret.jpg"] = photo;
  entries["notes.txt"] = strToU8("hi");
  const restored = parseBackupArchive(zipSync(entries));
  assert.equal(restored.images.size, 0);
  assert.equal(restored.bins[0].photo, null);
});

test("restore rejects duplicate bin ids", () => {
  const archive = buildBackupArchive(
    [sampleBin({ photo: null }), sampleBin({ id: "bin-01", bin_number: "02", photo: null })],
    new Map(),
  );
  assert.throws(() => parseBackupArchive(archive), /duplicate bin ids/);
});
