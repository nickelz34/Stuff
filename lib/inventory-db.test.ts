import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { Bin } from "../types";

const root = mkdtempSync(path.join(tmpdir(), "stuff-db-"));
process.chdir(root);
const { DATA_PATH, enqueue, readBins, writeBins } = await import("./inventory-db.ts");

test.after(() => rmSync(root, { recursive: true, force: true }));

function bin(n: number): Bin {
  return {
    id: `bin-${n}`,
    bin_number: String(n).padStart(2, "0"),
    notes: "x".repeat(n * 1000),
    items: [],
    photo: null,
    updatedAt: "2026-10-07T00:00:00.000Z",
  };
}

test("a missing inventory file reads as an empty inventory", async () => {
  assert.equal(DATA_PATH, path.join(root, "data", "inventory.json"));
  assert.deepEqual(await readBins(), []);
});

test("writes round-trip and leave no temp files behind", async () => {
  await writeBins([bin(1), bin(2)]);
  assert.deepEqual(
    (await readBins()).map((b) => b.id),
    ["bin-1", "bin-2"],
  );
  assert.deepEqual(readdirSync(path.dirname(DATA_PATH)), ["inventory.json"]);
});

test("queued concurrent writes always leave valid JSON with the last write", async () => {
  await Promise.all(Array.from({ length: 25 }, (_, i) => enqueue(() => writeBins([bin(i + 1)]))));
  const bins = await readBins();
  assert.equal(bins.length, 1);
  assert.equal(bins[0].id, "bin-25");
  assert.deepEqual(readdirSync(path.dirname(DATA_PATH)), ["inventory.json"]);
});

test("a corrupt inventory file is reported, not silently replaced", async () => {
  mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  writeFileSync(DATA_PATH, "[{ truncated");
  await assert.rejects(readBins(), SyntaxError);
});
