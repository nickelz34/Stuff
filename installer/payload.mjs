import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "data"]);

export function shouldPack(relativePath) {
  const parts = relativePath.split("/").filter(Boolean);
  if (parts.length === 0) return false;
  if (parts.some((part) => SKIP_DIRS.has(part))) return false;
  if (parts[0] === "public" && parts[1] === "images") return false;
  if (parts.some((part) => part === ".env" || part.startsWith(".env."))) return false;
  return true;
}

export async function listPayloadFiles(root) {
  const files = [];

  async function walk(directory, relative) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      if (!shouldPack(rel)) continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(full, rel);
      } else if (entry.isFile()) {
        files.push(rel);
      }
    }
  }

  await walk(root, "");
  files.sort();
  return files;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rootFlag = process.argv.indexOf("--root");
  const root = rootFlag === -1 ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..") : process.argv[rootFlag + 1];
  const files = await listPayloadFiles(root);
  process.stdout.write(`${files.join("\n")}\n`);
}
