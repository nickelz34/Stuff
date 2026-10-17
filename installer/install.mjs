import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, cp, mkdir, mkdtemp, readFile, readlink, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { shouldPack } from "./payload.mjs";

export function parseNodeVersion(text) {
  const match = String(text).match(/v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function nodeIsAtLeast(version, major = 22, minor = 13) {
  if (!version) return false;
  if (version[0] !== major) return version[0] > major;
  return version[1] >= minor;
}

export function defaultInstallDir(isRoot = typeof process.getuid === "function" && process.getuid() === 0) {
  return isRoot ? "/opt/stuff" : path.join(os.homedir(), "Stuff");
}

export function renderServiceUnit({ installDir, port, runAsStuff, userUnit }) {
  const lines = [
    "[Unit]",
    "Description=Stuff",
    "After=network-online.target",
    "Wants=network-online.target",
    "",
    "[Service]",
    "Type=simple",
  ];
  if (runAsStuff) {
    lines.push("User=stuff", "Group=stuff");
  }
  lines.push(
    `WorkingDirectory=${installDir}`,
    `Environment=PORT=${port}`,
    "Environment=HOSTNAME=0.0.0.0",
    `ExecStart=${installDir}/.node/bin/npm run start`,
    "Restart=on-failure",
    "RestartSec=3",
    "",
    "[Install]",
    userUnit ? "WantedBy=default.target" : "WantedBy=multi-user.target",
    "",
  );
  return lines.join("\n");
}

export async function copyPayloadPreservingUserFiles(installDir, payloadDir) {
  const hold = await mkdtemp(path.join(os.tmpdir(), "stuff-keep-"));
  const dataDir = path.join(installDir, "data");
  const imagesDir = path.join(installDir, "public", "images");
  let keptData = false;
  let keptImages = false;
  try {
    if (await exists(dataDir)) {
      await cp(dataDir, path.join(hold, "data"), { recursive: true });
      keptData = true;
    }
    if (await exists(imagesDir)) {
      await cp(imagesDir, path.join(hold, "images"), { recursive: true });
      keptImages = true;
    }

    await mkdir(installDir, { recursive: true });
    await copyFiltered(payloadDir, installDir, "");

    if (keptData) {
      await rm(dataDir, { recursive: true, force: true });
      await cp(path.join(hold, "data"), dataDir, { recursive: true });
    } else {
      await rm(dataDir, { recursive: true, force: true });
    }

    if (keptImages) {
      await rm(imagesDir, { recursive: true, force: true });
      await mkdir(path.join(installDir, "public"), { recursive: true });
      await cp(path.join(hold, "images"), imagesDir, { recursive: true });
    } else {
      await rm(imagesDir, { recursive: true, force: true });
    }
  } finally {
    await rm(hold, { recursive: true, force: true });
  }
}

async function copyFiltered(sourceRoot, destRoot, relative) {
  const entries = await readdir(path.join(sourceRoot, relative), { withFileTypes: true });
  for (const entry of entries) {
    const rel = relative ? `${relative}/${entry.name}` : entry.name;
    if (!shouldPack(rel)) continue;
    const from = path.join(sourceRoot, rel);
    const to = path.join(destRoot, rel);
    if (entry.isDirectory()) {
      await mkdir(to, { recursive: true });
      await copyFiltered(sourceRoot, destRoot, rel);
    } else if (entry.isFile()) {
      await mkdir(path.dirname(to), { recursive: true });
      await cp(from, to);
    }
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], ...options });
    let output = "";
    child.stdout?.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", (error) => {
      error.output = output;
      reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) resolve(output);
      else {
        const error = new Error(`${command} ${args.join(" ")} exited ${code}\n${output}`.trim());
        error.output = output;
        reject(error);
      }
    });
  });
}

async function exists(file) {
  try {
    await access(file, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function commandExists(name) {
  try {
    await run("sh", ["-c", `command -v ${name}`]);
    return true;
  } catch {
    return false;
  }
}

export async function privateNodeVersion(installDir) {
  const bin = path.join(installDir, ".node", "bin", "node");
  if (!(await exists(bin))) return null;
  try {
    const output = await run(bin, ["-v"]);
    return parseNodeVersion(output);
  } catch {
    return null;
  }
}

async function latestNode22Version() {
  const sums = await run("curl", ["-fsSL", "https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt"]);
  const line = sums.split("\n").find((entry) => /node-v22\.\d+\.\d+-linux-x64\.tar\.xz$/.test(entry.trim().split(/\s+/)[1] ?? ""));
  const name = line?.trim().split(/\s+/)[1];
  const version = name?.match(/node-v(22\.\d+\.\d+)-linux-x64\.tar\.xz/)?.[1];
  if (!version || !nodeIsAtLeast(parseNodeVersion(version))) {
    throw new Error(`Could not find a Node.js 22.13 or newer linux-x64 tarball (got ${version ?? "nothing"}).`);
  }
  return version;
}

export async function ensurePrivateNode(installDir) {
  const current = await privateNodeVersion(installDir);
  if (nodeIsAtLeast(current)) return current;
  const version = await latestNode22Version();
  const archiveDir = await mkdtemp(path.join(os.tmpdir(), "stuff-node-"));
  const archive = path.join(archiveDir, "node.tar.xz");
  try {
    await run("curl", ["-fsSL", "-o", archive, `https://nodejs.org/dist/v${version}/node-v${version}-linux-x64.tar.xz`]);
    const dest = path.join(installDir, ".node");
    await mkdir(dest, { recursive: true });
    await run("tar", ["-xJf", archive, "-C", dest, "--strip-components=1"]);
  } finally {
    await rm(archiveDir, { recursive: true, force: true });
  }
  const installed = await privateNodeVersion(installDir);
  if (!nodeIsAtLeast(installed)) {
    throw new Error("The private Node.js install is still older than 22.13.");
  }
  return installed;
}

async function stopExistingServer(installDir) {
  try {
    const active = await run("systemctl", ["is-active", "stuff.service"]);
    if (active.trim() === "active") await run("systemctl", ["stop", "stuff.service"]);
  } catch {
    // No systemd unit, or it is already stopped.
  }

  let entries;
  try {
    entries = await readdir("/proc");
  } catch {
    return;
  }
  const target = path.resolve(installDir);
  const self = String(process.pid);
  for (const entry of entries) {
    if (!/^\d+$/.test(entry) || entry === self) continue;
    let cwd;
    let command;
    try {
      cwd = await readlink(path.join("/proc", entry, "cwd"));
      command = (await readFile(path.join("/proc", entry, "comm"), "utf8")).trim();
    } catch {
      continue;
    }
    if (path.resolve(cwd) !== target) continue;
    if (command !== "node" && command !== "npm" && command !== "next-server") continue;
    try {
      process.kill(Number(entry), "SIGTERM");
    } catch {
      // Already gone.
    }
  }
}

function recoveryText(port) {
  return [
    "sudo systemctl status stuff.service",
    "sudo journalctl -u stuff.service -n 50 --no-pager",
    "sudo systemctl restart stuff.service",
    `curl -I http://127.0.0.1:${port}`,
  ].join("\n");
}

function waitForPort(port) {
  const started = Date.now();
  return new Promise((resolve) => {
    const tryOnce = () => {
      const socket = net.connect({ host: "127.0.0.1", port });
      const done = (ok) => {
        socket.removeAllListeners();
        socket.destroy();
        if (ok) {
          resolve(true);
          return;
        }
        if (Date.now() - started >= 30000) {
          resolve(false);
          return;
        }
        setTimeout(tryOnce, 200);
      };
      socket.once("connect", () => done(true));
      socket.once("error", () => done(false));
    };
    tryOnce();
  });
}

async function startDetached(installDir, port) {
  const npm = path.join(installDir, ".node", "bin", "npm");
  const child = spawn(npm, ["run", "start"], {
    cwd: installDir,
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: "0.0.0.0",
      PATH: `${path.dirname(npm)}:${process.env.PATH ?? ""}`,
    },
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

async function lanAddress() {
  const nets = os.networkInterfaces();
  for (const entries of Object.values(nets)) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) return entry.address;
    }
  }
  return null;
}

export async function systemNodeReady() {
  try {
    const output = await run("node", ["-v"]);
    return nodeIsAtLeast(parseNodeVersion(output));
  } catch {
    return false;
  }
}

export async function runInstall({
  installDir,
  port,
  enableFirewall,
  enableStartup,
  payloadDir,
}) {
  const steps = [];
  const record = (name, ok, message, detail) => {
    steps.push({ name, ok, message, ...(detail ? { detail } : {}) });
  };
  const fail = (name, error) => {
    record(name, false, error instanceof Error ? error.message : String(error));
    return result(false, `${name} failed.`);
  };
  const result = (ok, message) => ({
    ok,
    message,
    install_dir: installDir,
    port,
    app_url: `http://127.0.0.1:${port}`,
    lan_url: null,
    steps,
  });

  if (!installDir || !String(installDir).trim()) {
    return fail("Check the folder", new Error("Choose an install folder."));
  }
  installDir = path.resolve(String(installDir));

  try {
    await mkdir(installDir, { recursive: true });
    record("Check the folder", true, installDir);
  } catch (error) {
    return fail("Check the folder", error);
  }

  try {
    await stopExistingServer(installDir);
    record("Stop the old server", true, "Stopped any Stuff server for this folder.");
  } catch (error) {
    return fail("Stop the old server", error);
  }

  try {
    await copyPayloadPreservingUserFiles(installDir, payloadDir);
    const inventory = path.join(installDir, "data", "inventory.json");
    record(
      "Copy the app",
      true,
      (await exists(inventory))
        ? "App files are in place. Existing bins and photos were kept."
        : "App files are in place. No inventory file was created.",
    );
  } catch (error) {
    return fail("Copy the app", error);
  }

  try {
    const version = await ensurePrivateNode(installDir);
    record("Install Node", true, `Node.js ${version.join(".")} is in ${installDir}/.node`);
  } catch (error) {
    return fail("Install Node", error);
  }

  const npm = path.join(installDir, ".node", "bin", "npm");
  const npmEnv = {
    ...process.env,
    PATH: `${path.dirname(npm)}:${process.env.PATH ?? ""}`,
  };
  try {
    await run(npm, ["install"], { cwd: installDir, env: npmEnv });
    record("Install packages", true, "npm install finished.");
  } catch (error) {
    return fail("Install packages", error);
  }

  try {
    await run(npm, ["run", "build"], { cwd: installDir, env: npmEnv });
    record("Build", true, "npm run build finished.");
  } catch (error) {
    return fail("Build", error);
  }

  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
  let runAsStuff = false;
  if (isRoot) {
    try {
      try {
        await run("id", ["stuff"]);
      } catch {
        await run("useradd", ["--system", "--home-dir", installDir, "--no-create-home", "--shell", "/usr/sbin/nologin", "stuff"]);
      }
      await run("chown", ["-R", "stuff:stuff", installDir]);
      runAsStuff = true;
      record("Create the Linux user", true, "The stuff account owns the install folder.");
    } catch (error) {
      return fail("Create the Linux user", error);
    }
  } else {
    record("Create the Linux user", true, "Not root, so Stuff will run as the current user.");
  }

  if (enableFirewall) {
    try {
      if (await commandExists("ufw")) {
        await run("ufw", ["allow", `${port}/tcp`, "comment", "Stuff LAN"]);
        record("Firewall", true, `Allowed TCP ${port} with the comment Stuff LAN.`);
      } else if (await commandExists("firewall-cmd")) {
        await run("firewall-cmd", ["--permanent", `--add-port=${port}/tcp`]);
        await run("firewall-cmd", ["--reload"]);
        record("Firewall", true, `Allowed TCP ${port} through firewalld.`);
      } else {
        record("Firewall", false, "Neither ufw nor firewall-cmd is installed.");
      }
    } catch (error) {
      record("Firewall", false, error instanceof Error ? error.message : String(error));
    }
  } else {
    record("Firewall", true, "Firewall rule skipped.");
  }

  let startedBySystemd = false;
  if (enableStartup) {
    try {
      const unit = renderServiceUnit({ installDir, port, runAsStuff, userUnit: !isRoot });
      if (isRoot) {
        await writeFile("/etc/systemd/system/stuff.service", unit);
        await writeFile(path.join(installDir, "stuff.service"), unit);
        await run("systemctl", ["daemon-reload"]);
        await run("systemctl", ["enable", "--now", "stuff.service"]);
      } else {
        const userDir = path.join(os.homedir(), ".config", "systemd", "user");
        await mkdir(userDir, { recursive: true });
        await writeFile(path.join(userDir, "stuff.service"), unit);
        await writeFile(path.join(installDir, "stuff.service"), unit);
        await run("systemctl", ["--user", "daemon-reload"]);
        await run("systemctl", ["--user", "enable", "--now", "stuff.service"]);
        await run("loginctl", ["enable-linger", os.userInfo().username]);
      }
      startedBySystemd = true;
      record("Start at boot", true, "stuff.service is enabled.");
    } catch (error) {
      record("Start at boot", false, error instanceof Error ? error.message : String(error));
    }
  } else {
    record("Start at boot", true, "Start at boot skipped.");
  }

  if (!startedBySystemd) {
    try {
      await startDetached(installDir, port);
      record("Start Stuff", true, "Started one server from the install folder.");
    } catch (error) {
      return fail("Start Stuff", error);
    }
  }

  const listening = await waitForPort(port);
  const lan = await lanAddress();
  if (!listening) {
    record("Confirm it is listening", false, `Nothing accepted a connection on 127.0.0.1:${port}.`, recoveryText(port));
    return {
      ...result(false, `Stuff did not open port ${port}.`),
      lan_url: lan ? `http://${lan}:${port}` : null,
    };
  }
  record("Confirm it is listening", true, `Stuff is running at http://127.0.0.1:${port}`);
  return {
    ...result(true, `Stuff is running at http://127.0.0.1:${port}`),
    lan_url: lan ? `http://${lan}:${port}` : null,
  };
}
