import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { strToU8, unzipSync, zipSync } from "fflate";
import { UPDATE_MANIFEST, UpdateError, applyUpdateArchive, buildUpdateZip } from "./update.ts";

async function write(file: string, contents: string | Uint8Array) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, contents);
}

test("the update zip excludes node_modules, .next, data, and public/images", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "stuff-zip-"));
  await write(path.join(root, "package.json"), JSON.stringify({ name: "stuff", version: "0.9.0" }));
  await write(path.join(root, "package-lock.json"), "{\"name\":\"stuff\"}\n");
  await write(path.join(root, "app", "page.tsx"), "export default function Page(){return null}\n");
  await write(path.join(root, "node_modules", "left-pad", "index.js"), "nope");
  await write(path.join(root, ".next", "server", "pages.js"), "nope");
  await write(path.join(root, "data", "inventory.json"), "{\"secret\":true}\n");
  await write(path.join(root, "public", "images", "bin_01.jpg"), "photo");
  await write(path.join(root, "public", "stuff-mark.png"), "logo");
  await write(path.join(root, ".env"), "TOKEN=secret\n");
  await write(path.join(root, ".git", "config"), "nope");
  await write(path.join(root, "dist", "old.zip"), "nope");

  const packed = unzipSync(await buildUpdateZip(root));
  const names = Object.keys(packed).sort();
  assert.deepEqual(names, [
    "app/page.tsx",
    "package-lock.json",
    "package.json",
    "public/stuff-mark.png",
    UPDATE_MANIFEST,
  ]);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(packed[UPDATE_MANIFEST])), {
    app: "stuff",
    version: "0.9.0",
  });
});

test("applying the zip keeps inventory and photo bytes and adds app files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "stuff-apply-"));
  const installDir = path.join(root, "install");
  const sourceDir = path.join(root, "source");
  const inventory = Buffer.from('{"bins":["kept"]}\n');
  const photo = Buffer.from([0x00, 0xff, 0x10, 0x7f, 0x0a]);
  await write(path.join(installDir, "data", "inventory.json"), inventory);
  await write(path.join(installDir, "public", "images", "bin_01.jpg"), photo);
  await write(path.join(sourceDir, "package.json"), JSON.stringify({ name: "stuff", version: "0.9.0" }));
  await write(path.join(sourceDir, "app", "page.tsx"), "export default function Page(){return null}\n");
  await write(path.join(sourceDir, "data", "inventory.json"), "[]\n");
  await write(path.join(sourceDir, "public", "images", "bin_99.jpg"), "new-photo");
  await write(path.join(sourceDir, "node_modules", "left-pad", "index.js"), "nope");

  const result = await applyUpdateArchive(await buildUpdateZip(sourceDir), installDir, { install: false });

  assert.equal(result.version, "0.9.0");
  assert.deepEqual(await readFile(path.join(installDir, "data", "inventory.json")), inventory);
  assert.deepEqual(await readFile(path.join(installDir, "public", "images", "bin_01.jpg")), photo);
  assert.equal(
    await readFile(path.join(installDir, "app", "page.tsx"), "utf8"),
    "export default function Page(){return null}\n",
  );
  assert.equal(await readFile(path.join(installDir, "package.json"), "utf8"), JSON.stringify({ name: "stuff", version: "0.9.0" }));
  await assert.rejects(readFile(path.join(installDir, "public", "images", "bin_99.jpg")));
  await assert.rejects(readFile(path.join(installDir, "node_modules", "left-pad", "index.js")));
});

test("a folder with no inventory file does not gain an invented one", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "stuff-none-"));
  const installDir = path.join(root, "install");
  const sourceDir = path.join(root, "source");
  await write(path.join(installDir, "README.md"), "old\n");
  await write(path.join(sourceDir, "package.json"), JSON.stringify({ name: "stuff", version: "0.9.0" }));
  await write(path.join(sourceDir, "data", "inventory.json"), "[]\n");

  await applyUpdateArchive(await buildUpdateZip(sourceDir), installDir, { install: false });

  await assert.rejects(readFile(path.join(installDir, "data", "inventory.json")));
  assert.equal(await readFile(path.join(installDir, "package.json"), "utf8"), JSON.stringify({ name: "stuff", version: "0.9.0" }));
});

test("a zip without a valid Stuff manifest is rejected", async () => {
  const installDir = await mkdtemp(path.join(os.tmpdir(), "stuff-reject-"));
  await write(path.join(installDir, "README.md"), "keep\n");
  const cases = [
    zipSync({ "readme.txt": strToU8("hi") }),
    zipSync({ [UPDATE_MANIFEST]: strToU8("{") }),
    zipSync({ [UPDATE_MANIFEST]: strToU8(JSON.stringify({ app: "other", version: "1.0.0" })) }),
    zipSync({ [UPDATE_MANIFEST]: strToU8(JSON.stringify({ app: "stuff" })) }),
    zipSync({ [UPDATE_MANIFEST]: strToU8(JSON.stringify({ version: "0.9.0" })) }),
  ];

  for (const bytes of cases) {
    await assert.rejects(
      () => applyUpdateArchive(bytes, installDir, { install: false }),
      (error: unknown) => {
        assert.equal(error instanceof UpdateError, true);
        assert.match((error as UpdateError).message, /Stuff update/);
        return true;
      },
    );
  }
  assert.equal(await readFile(path.join(installDir, "README.md"), "utf8"), "keep\n");
});
