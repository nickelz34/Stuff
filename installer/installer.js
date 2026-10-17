const STEPS = ["Welcome", "Folder", "Network", "Startup", "Review", "Install", "Done"];

const panel = document.querySelector("#panel");
const stepPills = document.querySelector("#step-pills");
const pills = document.querySelector("#pills");

let info = null;
let step = 0;
let installDir = "";
let port = 1234;
let enableFirewall = true;
let enableStartup = true;
let result = null;
let opened = false;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function pill(text) {
  const span = document.createElement("span");
  span.className = "pill";
  span.textContent = text;
  return span;
}

function renderPills() {
  pills.replaceChildren();
  if (!info) return;
  pills.append(pill(info.os || "Linux"));
  pills.append(pill(info.root ? "Administrator rights" : "Limited permissions"));
  pills.append(pill(info.node_ready ? "Node.js is ready" : "Node.js will be installed"));
}

function renderStepPills() {
  stepPills.replaceChildren();
  STEPS.forEach((name, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "step";
    button.textContent = name;
    button.disabled = true;
    if (index === step) button.setAttribute("aria-current", "step");
    stepPills.append(button);
  });
}

function field(label, input) {
  const wrap = document.createElement("label");
  wrap.textContent = label;
  wrap.append(input);
  return wrap;
}

function help(text) {
  const p = document.createElement("p");
  p.className = "help";
  p.textContent = text;
  return p;
}

function actions(buttons) {
  const row = document.createElement("div");
  row.className = "actions";
  buttons.forEach((button) => row.append(button));
  return row;
}

function button(label, className, onClick) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  element.textContent = label;
  element.addEventListener("click", onClick);
  return element;
}

function render() {
  renderStepPills();
  panel.replaceChildren();
  if (!info) {
    panel.append(help("Could not load installer info"));
    return;
  }
  if (step === 0) welcome();
  else if (step === 1) folder();
  else if (step === 2) network();
  else if (step === 3) startup();
  else if (step === 4) review();
  else if (step === 5) installing();
  else done();
}

function welcome() {
  panel.append(
    help("Stuff will be placed in one folder. Node.js will be installed if this computer does not already have 22.13 or newer. The user’s bins and photos stay in that folder. There is no account."),
    actions([button("Next", "primary", () => { step = 1; render(); })]),
  );
}

function folder() {
  const input = document.createElement("input");
  input.type = "text";
  input.value = installDir;
  input.addEventListener("input", () => { installDir = input.value; });
  panel.append(
    field("Install folder", input),
    help("This folder holds the app, the inventory, and the photos. Leave the default unless you want another disk."),
    actions([
      button("Back", "secondary", () => { step = 0; render(); }),
      button("Next", "primary", () => { step = 2; render(); }),
    ]),
  );
}

function network() {
  const input = document.createElement("input");
  input.type = "number";
  input.min = "1";
  input.max = "65535";
  input.value = String(port);
  input.addEventListener("input", () => { port = Number(input.value); });
  const lan = info.lan_ipv4
    ? `Other devices on the home network use http://${info.lan_ipv4}:${port || 1234}.`
    : "No LAN address was detected. Other devices can connect only if this computer has a home-network address.";
  panel.append(
    field("Port", input),
    help("Leave it unless that port is already in use."),
    help(lan),
    actions([
      button("Back", "secondary", () => { step = 1; render(); }),
      button("Next", "primary", () => {
        if (!Number.isInteger(port) || port < 1 || port > 65535) return;
        step = 3;
        render();
      }),
    ]),
  );
}

function startup() {
  const firewall = checkbox("Allow home-network connections through the firewall (Stuff LAN on the chosen TCP port).", enableFirewall, (value) => { enableFirewall = value; });
  const boot = checkbox("Start Stuff when this computer boots (stuff.service).", enableStartup, (value) => { enableStartup = value; });
  panel.append(firewall, boot);
  if (!info.root) panel.append(help("Firewall and boot startup need sudo. This installer is not running as root."));
  panel.append(actions([
    button("Back", "secondary", () => { step = 2; render(); }),
    button("Next", "primary", () => { step = 4; render(); }),
  ]));
}

function checkbox(text, checked, onChange) {
  const label = document.createElement("label");
  label.className = "choice";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  const span = document.createElement("span");
  span.textContent = text;
  label.append(input, span);
  return label;
}

function review() {
  const list = document.createElement("div");
  list.innerHTML = [
    `<p>Folder: ${escapeHtml(installDir)}</p>`,
    `<p>Port: ${escapeHtml(port)}</p>`,
    `<p>Firewall: ${enableFirewall ? "Stuff LAN" : "skip"}</p>`,
    `<p>Start at boot: ${enableStartup ? "stuff.service" : "skip"}</p>`,
  ].join("");
  panel.append(
    list,
    help("Nothing changes until Install. An upgrade keeps existing bins and photos."),
    actions([
      button("Back", "secondary", () => { step = 3; render(); }),
      button("Install", "primary", () => { step = 5; render(); }),
    ]),
  );
}

function installing() {
  const status = help("Installing Node and building Stuff can take several minutes. Leave this page open.");
  const list = document.createElement("div");
  panel.append(status, list);
  const controls = actions([]);
  panel.append(controls);
  controls.querySelectorAll("button").forEach((item) => { item.disabled = true; });
  fetch("/api/install", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      install_dir: installDir,
      port,
      enable_firewall: enableFirewall,
      enable_startup: enableStartup,
    }),
  })
    .then(async (response) => {
      result = await response.json();
      showSteps(list, result.steps || []);
      if (result.ok) {
        step = 6;
        render();
        return;
      }
      const retry = button("Retry install", "primary", () => render());
      controls.append(retry);
    })
    .catch(() => {
      list.innerHTML = `<p class="bad">${escapeHtml("Could not reach the installer.")}</p>`;
      controls.append(button("Retry install", "primary", () => render()));
    });
}

function showSteps(list, steps) {
  list.replaceChildren();
  for (const item of steps) {
    const p = document.createElement("p");
    p.className = `step-result ${item.ok ? "ok" : "bad"}`;
    p.textContent = `${item.ok ? "OK" : "Failed"}: ${item.name}. ${item.message || ""}`;
    list.append(p);
    if (item.detail) {
      const pre = document.createElement("pre");
      pre.textContent = item.detail;
      list.append(pre);
    }
  }
}

function done() {
  const local = result?.app_url || `http://127.0.0.1:${port}`;
  const lines = [help(`Stuff is on this computer at ${local}`)];
  if (result?.lan_url) lines.push(help(`Other devices on the home network can use ${result.lan_url}`));
  const open = document.createElement("a");
  open.href = local;
  open.textContent = "Open Stuff";
  open.className = "primary";
  const close = button("Close installer", "secondary", () => {
    fetch("/api/shutdown", { method: "POST" }).finally(() => {
      document.body.textContent = "Installer closed. You can close this browser tab.";
    });
  });
  const recovery = document.createElement("pre");
  recovery.textContent = [
    "sudo systemctl status stuff.service",
    "sudo journalctl -u stuff.service -n 50 --no-pager",
    "sudo systemctl restart stuff.service",
    `curl -I http://127.0.0.1:${port}`,
  ].join("\n");
  panel.append(...lines, actions([open, close]), help("If the page does not load, run:"), recovery);
  if (!opened) {
    opened = true;
    window.open(local, "_blank");
  }
}

fetch("/api/info")
  .then((response) => {
    if (!response.ok) throw new Error("info");
    return response.json();
  })
  .then((body) => {
    info = body;
    installDir = body.default_install_dir || "";
    port = Number(body.port) || 1234;
    renderPills();
    render();
  })
  .catch(() => {
    panel.textContent = "Could not load installer info";
  });
