import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultInstallDir, runInstall, systemNodeReady } from "./install.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAX_BODY = 64 * 1024;
const FILES = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
  "/installer.css": { file: "installer.css", type: "text/css; charset=utf-8" },
  "/installer.js": { file: "installer.js", type: "text/javascript; charset=utf-8" },
};

function parseArgs(argv) {
  const options = {
    cli: false,
    payloadDir: path.resolve(HERE, ".."),
    installDir: "",
    port: 1234,
    enableFirewall: true,
    enableStartup: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--cli") options.cli = true;
    else if (arg === "--no-firewall") options.enableFirewall = false;
    else if (arg === "--no-startup") options.enableStartup = false;
    else if (arg === "--payload") options.payloadDir = path.resolve(argv[++index] ?? "");
    else if (arg === "--install-dir") options.installDir = argv[++index] ?? "";
    else if (arg === "--port") options.port = Number(argv[++index]);
    else if (arg === "--no-elevate") {
      // Handled by the shell wrapper.
    }
  }
  return options;
}

function lanAddress() {
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) return entry.address;
    }
  }
  return null;
}

function sendJson(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  response.end(payload);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error("Request body is larger than 64 KiB."), { status: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function printBanner(port) {
  process.stdout.write(
    `Stuff Setup\n===========\nOpening the graphical installer at http://127.0.0.1:${port}/\nKeep this window open until setup finishes.\n`,
  );
}

async function startWizard(options) {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    try {
      if (request.method === "GET" && FILES[url.pathname]) {
        const item = FILES[url.pathname];
        response.writeHead(200, { "Content-Type": item.type, "Cache-Control": "no-store" });
        createReadStream(path.join(HERE, item.file)).pipe(response);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/info") {
        const root = typeof process.getuid === "function" && process.getuid() === 0;
        sendJson(response, 200, {
          os: `${os.type()} ${os.release()} ${os.arch()}`,
          root,
          default_install_dir: defaultInstallDir(root),
          port: 1234,
          node_ready: await systemNodeReady(),
          lan_ipv4: lanAddress(),
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/install") {
        const raw = await readBody(request);
        const body = JSON.parse(raw || "{}");
        const port = Number(body.port);
        if (!body.install_dir || !Number.isInteger(port) || port < 1 || port > 65535) {
          sendJson(response, 400, { ok: false, message: "Check the folder and port." });
          return;
        }
        const result = await runInstall({
          installDir: String(body.install_dir),
          port,
          enableFirewall: Boolean(body.enable_firewall),
          enableStartup: Boolean(body.enable_startup),
          payloadDir: options.payloadDir,
        });
        sendJson(response, result.ok ? 200 : 500, result);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/shutdown") {
        response.writeHead(204);
        response.end();
        setTimeout(() => process.exit(0), 250);
        return;
      }
      response.writeHead(404);
      response.end("Not found");
    } catch (error) {
      const status = error && error.status ? error.status : 500;
      if (!response.headersSent) sendJson(response, status, { ok: false, message: error instanceof Error ? error.message : "Installer error" });
    }
  });
  server.requestTimeout = 0;
  server.headersTimeout = 0;
  server.timeout = 0;

  const port = await new Promise((resolve, reject) => {
    const onError = (error) => {
      if (error.code !== "EADDRINUSE") {
        reject(error);
        return;
      }
      server.listen(0, "127.0.0.1", () => resolve(server.address().port));
    };
    server.once("error", onError);
    server.listen(12345, "127.0.0.1", () => {
      server.off("error", onError);
      resolve(12345);
    });
  });

  printBanner(port);
  const url = `http://127.0.0.1:${port}/`;
  const opener = spawn("sh", ["-c", "command -v xdg-open || command -v x-www-browser || command -v www-browser"], { stdio: ["ignore", "pipe", "ignore"] });
  let openerName = "";
  opener.stdout.on("data", (chunk) => {
    openerName += chunk;
  });
  opener.on("close", (code) => {
    const command = openerName.trim().split("\n").pop();
    if (code !== 0 || !command) {
      process.stdout.write(`Open this address in a browser on this computer: ${url}\n`);
      return;
    }
    const child = spawn(command, [url], { stdio: "ignore", detached: true });
    child.on("error", () => {
      process.stdout.write(`Open this address in a browser on this computer: ${url}\n`);
    });
    child.unref();
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.cli) {
    const root = typeof process.getuid === "function" && process.getuid() === 0;
    const result = await runInstall({
      installDir: options.installDir || defaultInstallDir(root),
      port: options.port,
      enableFirewall: options.enableFirewall,
      enableStartup: options.enableStartup,
      payloadDir: options.payloadDir,
    });
    process.stdout.write(`${result.message}\n`);
    if (result.lan_url) process.stdout.write(`${result.lan_url}\n`);
    process.exit(result.ok ? 0 : 1);
  }
  await startWizard(options);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.join(HERE, "server.mjs")) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
    process.exit(1);
  });
}
