const results = document.getElementById("results");

function row(label, status, detail) {
  const div = document.createElement("div");
  div.className = "card";
  const cls = status === "ok" ? "ok" : status === "warn" ? "warn" : "bad";
  div.innerHTML = `<strong>${label}</strong> - <span class="${cls}">${status.toUpperCase()}</span><div>${detail}</div>`;
  results.appendChild(div);
}

async function runDiagnostics() {
  results.innerHTML = "";
  try {
    const manifest = chrome.runtime.getManifest();
    row("Manifest", "ok", `v${manifest.version}, MV${manifest.manifest_version}`);
  } catch (e) {
    row("Manifest", "bad", e.message);
  }

  try {
    const state = await chrome.runtime.sendMessage({ type: "getState" });
    row("Background messaging", state?.success ? "ok" : "bad", JSON.stringify(state?.state || {}));
  } catch (e) {
    row("Background messaging", "bad", e.message);
  }

  try {
    const s = await chrome.storage.local.get(null);
    row("Storage local", "ok", `${Object.keys(s).length} keys`);
  } catch (e) {
    row("Storage local", "bad", e.message);
  }

  try {
    const alarms = await chrome.alarms.getAll();
    row("Alarms", alarms.length ? "ok" : "warn", `${alarms.length} active alarms`);
  } catch (e) {
    row("Alarms", "bad", e.message);
  }

  try {
    const online = navigator.onLine;
    row("Network", online ? "ok" : "warn", online ? "Online" : "Offline");
  } catch (e) {
    row("Network", "bad", e.message);
  }
}

document.getElementById("run").onclick = runDiagnostics;
runDiagnostics();

