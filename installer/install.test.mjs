import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { copyPayloadPreservingUserFiles, renderServiceUnit } from "./install.mjs";
import { listPayloadFiles } from "./payload.mjs";

async function write(file, contents) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, contents);
}

test("packing the payload excludes node_modules, .next, data, and public/images", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "stuff-pack-"));
  await write(path.join(root, "package.json"), "{}\n");
  await write(path.join(root, "node_modules", "left-pad", "index.js"), "nope");
  await write(path.join(root, ".next", "server", "pages.js"), "nope");
  await write(path.join(root, "data", "inventory.json"), "{\"secret\":true}\n");
  await write(path.join(root, "public", "images", "bin_01.jpg"), "photo");
  await write(path.join(root, "public", "stuff-mark.png"), "logo");
  await write(path.join(root, ".env"), "TOKEN=secret\n");

  const files = await listPayloadFiles(root);
  assert.deepEqual(files, ["package.json", "public/stuff-mark.png"]);
});

test("a fake upgrade keeps the inventory file and photo", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "stuff-upgrade-"));
  const installDir = path.join(root, "install");
  const payloadDir = path.join(root, "payload");
  const inventory = "{\"bins\":[\"kept\"]}\n";
  const photo = "photo-bytes";
  await write(path.join(installDir, "data", "inventory.json"), inventory);
  await write(path.join(installDir, "public", "images", "bin_01.jpg"), photo);
  await write(path.join(payloadDir, "package.json"), "{\"name\":\"stuff\"}\n");
  await write(path.join(payloadDir, "app", "page.tsx"), "export default function Page(){return null}\n");
  await write(path.join(payloadDir, "public", "images", "bin_99.jpg"), "new-photo");
  await write(path.join(payloadDir, "data", "inventory.json"), "[]\n");

  await copyPayloadPreservingUserFiles(installDir, payloadDir);

  assert.equal(await readFile(path.join(installDir, "data", "inventory.json"), "utf8"), inventory);
  assert.equal(await readFile(path.join(installDir, "public", "images", "bin_01.jpg"), "utf8"), photo);
  assert.equal(await readFile(path.join(installDir, "package.json"), "utf8"), "{\"name\":\"stuff\"}\n");
  assert.equal(await readFile(path.join(installDir, "app", "page.tsx"), "utf8"), "export default function Page(){return null}\n");
  await assert.rejects(readFile(path.join(installDir, "public", "images", "bin_99.jpg")));
});

test("a folder with no inventory file does not gain an invented one", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "stuff-empty-"));
  const installDir = path.join(root, "install");
  const payloadDir = path.join(root, "payload");
  await write(path.join(installDir, "README.md"), "old\n");
  await write(path.join(payloadDir, "package.json"), "{\"name\":\"stuff\"}\n");
  await write(path.join(payloadDir, "data", "inventory.json"), "[]\n");

  await copyPayloadPreservingUserFiles(installDir, payloadDir);

  await assert.rejects(readFile(path.join(installDir, "data", "inventory.json")));
  assert.equal(await readFile(path.join(installDir, "package.json"), "utf8"), "{\"name\":\"stuff\"}\n");
});

test("the generated unit starts the production server in the install folder", () => {
  const unit = renderServiceUnit({
    installDir: "/opt/stuff",
    port: 1234,
    runAsStuff: true,
    userUnit: false,
  });
  assert.match(unit, /^WorkingDirectory=\/opt\/stuff$/m);
  assert.match(unit, /^Environment=PORT=1234$/m);
  assert.match(unit, /^ExecStart=.*npm run start$/m);
  assert.equal(unit.includes("npm run dev"), false);
});
