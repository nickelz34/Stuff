import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { copyPayloadPreservingUserFiles } from "../installer/install.mjs";
import { listPayloadFiles, shouldPack } from "../installer/payload.mjs";

export const UPDATE_MANIFEST = "stuff-update.json";
export const MAX_UPDATE_BYTES = 80 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 120 * 1024 * 1024;

export class UpdateError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "UpdateError";
    this.status = status;
  }
}

type ZipEntries = Record<string, Uint8Array>;

export async function buildUpdateZip(root: string): Promise<Uint8Array> {
  const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as {
    version?: unknown;
  };
  if (typeof pkg.version !== "string" || pkg.version.trim() === "") {
    throw new UpdateError("package.json is missing a version.");
  }

  const listed = (await listPayloadFiles(root)) as string[];
  const files: Record<string, [Uint8Array, { level: 0 | 6 }]> = {};
  for (const rel of listed) {
    if (rel === UPDATE_MANIFEST) continue;
    const data = await readFile(path.join(root, rel));
    files[rel] = [new Uint8Array(data), { level: 6 }];
  }
  files[UPDATE_MANIFEST] = [
    strToU8(JSON.stringify({ app: "stuff", version: pkg.version })),
    { level: 6 },
  ];
  return zipSync(files);
}

export function parseUpdateArchive(bytes: Uint8Array): { version: string; entries: ZipEntries } {
  if (bytes.byteLength === 0) {
    throw new UpdateError("That file is empty.");
  }
  if (bytes.byteLength > MAX_UPDATE_BYTES) {
    throw new UpdateError("That update is too large.");
  }

  let unpacked: ZipEntries;
  try {
    unpacked = unzipSync(bytes);
  } catch {
    throw new UpdateError("That file is not a valid zip.");
  }

  let total = 0;
  const entries: ZipEntries = {};
  for (const [rawName, data] of Object.entries(unpacked)) {
    total += data.byteLength;
    if (total > MAX_UNCOMPRESSED_BYTES) {
      throw new UpdateError("That update is too large.");
    }
    const rel = normalizeEntry(rawName);
    if (rel === null) continue;
    if (!shouldPack(rel)) continue;
    entries[rel] = data;
  }

  return { version: readManifest(entries[UPDATE_MANIFEST]), entries };
}

export async function applyUpdateArchive(
  bytes: Uint8Array,
  cwd: string,
  options?: { install?: boolean },
): Promise<{ version: string }> {
  const { version, entries } = parseUpdateArchive(bytes);
  const stage = await mkdtemp(path.join(os.tmpdir(), "stuff-update-"));
  try {
    const root = path.resolve(stage);
    for (const [rel, data] of Object.entries(entries)) {
      const dest = path.resolve(root, rel);
      if (dest !== root && !dest.startsWith(`${root}${path.sep}`)) {
        throw new UpdateError("This zip is not a Stuff update.");
      }
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, data);
    }
    await copyPayloadPreservingUserFiles(path.resolve(cwd), stage);
  } finally {
    await rm(stage, { recursive: true, force: true });
  }

  if (options?.install !== false) {
    await installAndBuild(path.resolve(cwd));
  }
  return { version };
}

export async function npmBinary(cwd: string): Promise<string> {
  const local = path.join(cwd, ".node", "bin", "npm");
  try {
    await access(local, constants.F_OK);
    return local;
  } catch {
    return "npm";
  }
}

export async function restartInstalledApp(cwd: string): Promise<void> {
  const resolved = path.resolve(cwd);
  const mode = await installedServiceMode(resolved);
  if (mode && (await trySystemctlRestart(mode))) return;

  if (mode && process.env.INVOCATION_ID) {
    setTimeout(() => {
      process.exit(1);
    }, 400).unref();
    return;
  }

  const npm = await npmBinary(resolved);
  startDetached(resolved, npm);
  setTimeout(() => {
    process.exit(0);
  }, 400).unref();
}

function readManifest(bytes: Uint8Array | undefined): string {
  if (!bytes) {
    throw new UpdateError("This zip is not a Stuff update.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(strFromU8(bytes));
  } catch {
    throw new UpdateError("This zip is not a Stuff update.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new UpdateError("This zip is not a Stuff update.");
  }
  const manifest = parsed as { app?: unknown; version?: unknown };
  if (manifest.app !== "stuff" || typeof manifest.version !== "string" || manifest.version.trim() === "") {
    throw new UpdateError("This zip is not a Stuff update.");
  }
  return manifest.version;
}

function normalizeEntry(rawName: string): string | null {
  const name = rawName.replace(/\\/g, "/");
  if (name.endsWith("/")) return null;
  if (name.startsWith("__MACOSX/") || name.split("/").includes(".DS_Store")) return null;
  if (name.startsWith("/") || name.includes("\0")) {
    throw new UpdateError("This zip is not a Stuff update.");
  }
  const parts = name.split("/");
  if (parts.some((part) => part === "..")) {
    throw new UpdateError("This zip is not a Stuff update.");
  }
  const cleaned = parts.filter((part) => part !== "" && part !== ".").join("/");
  if (!cleaned) return null;
  return cleaned;
}

async function installAndBuild(cwd: string) {
  const npm = await npmBinary(cwd);
  const env = npmEnv(npm);
  try {
    await run(npm, ["install"], { cwd, env });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    throw new UpdateError("Could not install packages.", 500);
  }
  try {
    await run(npm, ["run", "build"], { cwd, env });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    throw new UpdateError("Could not build Stuff.", 500);
  }
}

function npmEnv(npm: string): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (npm !== "npm") {
    env.PATH = `${path.dirname(npm)}:${env.PATH ?? ""}`;
  }
  return env;
}

function serverEnv(npm: string): NodeJS.ProcessEnv {
  const env = npmEnv(npm);
  if (!env.PORT) env.PORT = "1234";
  return env;
}

function run(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], ...options });
    let output = "";
    child.stdout?.on("data", (chunk: Uint8Array | string) => {
      output += String(chunk);
    });
    child.stderr?.on("data", (chunk: Uint8Array | string) => {
      output += String(chunk);
    });
    child.on("error", (error) => {
      reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`${command} ${args.join(" ")} exited ${code}\n${output}`.trim()));
    });
  });
}

async function systemctlText(args: string[]): Promise<string | null> {
  try {
    return await run("systemctl", args);
  } catch {
    return null;
  }
}

function workingDirectoryMatches(unit: string, cwd: string): boolean {
  const line = unit.match(/^WorkingDirectory=(.*)$/m)?.[1]?.trim();
  if (!line) return false;
  return path.resolve(line) === path.resolve(cwd);
}

async function installedServiceMode(cwd: string): Promise<"system" | "user" | null> {
  const system = await systemctlText(["cat", "stuff.service"]);
  if (system && workingDirectoryMatches(system, cwd)) return "system";
  const user = await systemctlText(["--user", "cat", "stuff.service"]);
  if (user && workingDirectoryMatches(user, cwd)) return "user";
  if (system && !/^WorkingDirectory=/m.test(system)) return "system";
  if (user && !/^WorkingDirectory=/m.test(user)) return "user";
  return null;
}

async function trySystemctlRestart(mode: "system" | "user"): Promise<boolean> {
  const args =
    mode === "user"
      ? ["--user", "--no-block", "restart", "stuff.service"]
      : ["--no-block", "restart", "stuff.service"];
  try {
    await run("systemctl", args);
    return true;
  } catch {
    if (mode !== "system") return false;
  }
  try {
    await run("sudo", ["-n", "systemctl", "--no-block", "restart", "stuff.service"]);
    return true;
  } catch {
    return false;
  }
}

function startDetached(cwd: string, npm: string) {
  const env = {
    ...serverEnv(npm),
    STUFF_OLD_PID: String(process.pid),
    STUFF_CWD: cwd,
    STUFF_NPM: npm,
  };
  const script = [
    'while kill -0 "$STUFF_OLD_PID" 2>/dev/null; do sleep 0.2; done',
    'cd "$STUFF_CWD"',
    'exec "$STUFF_NPM" run start',
  ].join("\n");
  const child = spawn("sh", ["-c", script], {
    cwd,
    env,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

async function writeZipCli() {
  const rootFlag = process.argv.indexOf("--root");
  const outFlag = process.argv.indexOf("--out");
  const root = rootFlag === -1 ? process.cwd() : path.resolve(process.argv[rootFlag + 1] ?? "");
  const out = outFlag === -1 ? "" : path.resolve(process.argv[outFlag + 1] ?? "");
  if (!out) throw new UpdateError("Pass --out for the update zip.");
  const bytes = await buildUpdateZip(root);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, bytes);
  const shown = path.relative(root, out) || out;
  console.log(`Wrote ${shown} (${bytes.byteLength} bytes)`);
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entry && entry === fileURLToPath(import.meta.url) && process.argv.includes("--out")) {
  writeZipCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
