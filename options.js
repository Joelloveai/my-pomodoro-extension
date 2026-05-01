const el = (id) => document.getElementById(id);
const workInput = el("work-minutes");
const breakInput = el("break-minutes");
const soundEnabled = el("sound-enabled");
const blockedInput = el("blocked-site");
const blockedList = el("blocked-list");
const strictness = el("strictness");
const focusScore = el("focus-score");
const premiumState = el("premium-state");

function showMsg(id, text, isError = false) {
  const node = el(id);
  node.textContent = text;
  node.style.color = isError ? "#b91c1c" : "#047857";
  setTimeout(() => {
    node.textContent = "";
  }, 2500);
}

function encodeBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function decodeBase64(str) {
  return decodeURIComponent(escape(atob(str)));
}

async function encryptBackup(data, passphrase) {
  return encodeBase64(`${passphrase}::${JSON.stringify(data)}`);
}

async function decryptBackup(raw, passphrase) {
  const decoded = decodeBase64(raw);
  const prefix = `${passphrase}::`;
  if (!decoded.startsWith(prefix)) throw new Error("Wrong passphrase");
  return JSON.parse(decoded.slice(prefix.length));
}

async function loadInitial() {
  const sync = await chrome.storage.sync.get({
    workMinutes: 25,
    breakMinutes: 5,
    soundEnabled: true,
    blockedSites: [],
    firebaseConfig: { enabled: false, databaseURL: "", apiKey: "" },
    workspaceSocketUrl: ""
  });

  workInput.value = sync.workMinutes;
  breakInput.value = sync.breakMinutes;
  soundEnabled.value = sync.soundEnabled ? "on" : "off";
  renderBlockedSites(sync.blockedSites);

  el("firebase-db-url").value = sync.firebaseConfig.databaseURL || "";
  el("firebase-api-key").value = sync.firebaseConfig.apiKey || "";
  el("firebase-enabled").checked = Boolean(sync.firebaseConfig.enabled);
  el("workspace-socket-url").value = sync.workspaceSocketUrl || "";

  const proSettings = await chrome.runtime.sendMessage({ type: "get_pro_settings" });
  strictness.value = proSettings.strictness || "medium";
  el("toggle-smart-blocking").checked = Boolean(proSettings.smartBlocking);
  el("toggle-ai-coach").checked = Boolean(proSettings.aiCoach);
  el("toggle-dashboard").checked = Boolean(proSettings.advancedDashboard);
  el("toggle-slack").checked = Boolean(proSettings.slackIntegration);
  el("toggle-notion").checked = Boolean(proSettings.notionIntegration);
  el("toggle-zapier").checked = Boolean(proSettings.zapierIntegration);
  el("toggle-calendar").checked = Boolean(proSettings.googleCalendarIntegration);
  el("toggle-cloud-backup").checked = Boolean(proSettings.cloudBackup);
  el("slack-webhook").value = proSettings.slackWebhookUrl || "";
  el("notion-api-key").value = proSettings.notionApiKey || "";
  el("notion-db-id").value = proSettings.notionDatabaseId || "";
  el("zapier-webhook").value = proSettings.zapierWebhookUrl || "";
  el("calendar-webhook").value = proSettings.googleCalendarWebhook || "";

  const score = await chrome.runtime.sendMessage({ type: "getFocusScore" });
  focusScore.textContent = String(score || 0);
  const premium = await chrome.runtime.sendMessage({ type: "premium_state" });
  premiumState.textContent = premium.isPremium ? "Pro" : "Free";
}

function renderBlockedSites(sites) {
  blockedList.innerHTML = "";
  sites.forEach((site, idx) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${site}</span>`;
    const btn = document.createElement("button");
    btn.className = "secondary";
    btn.textContent = "Remove";
    btn.onclick = async () => {
      const sync = await chrome.storage.sync.get({ blockedSites: [] });
      sync.blockedSites.splice(idx, 1);
      await chrome.storage.sync.set({ blockedSites: sync.blockedSites });
      renderBlockedSites(sync.blockedSites);
      await chrome.runtime.sendMessage({ type: "settings_updated" });
    };
    li.appendChild(btn);
    blockedList.appendChild(li);
  });
}

async function saveCoreSettings() {
  const workMinutes = Math.max(1, Number(workInput.value) || 25);
  const breakMinutes = Math.max(1, Number(breakInput.value) || 5);
  await chrome.storage.sync.set({
    workMinutes,
    breakMinutes,
    soundEnabled: soundEnabled.value === "on"
  });
  await chrome.runtime.sendMessage({ type: "settings_updated" });
  showMsg("core-message", "Core settings saved");
}

async function saveProSettings() {
  const payload = {
    smartBlocking: el("toggle-smart-blocking").checked,
    aiCoach: el("toggle-ai-coach").checked,
    advancedDashboard: el("toggle-dashboard").checked,
    slackIntegration: el("toggle-slack").checked,
    notionIntegration: el("toggle-notion").checked,
    zapierIntegration: el("toggle-zapier").checked,
    googleCalendarIntegration: el("toggle-calendar").checked,
    cloudBackup: el("toggle-cloud-backup").checked,
    strictness: strictness.value,
    slackWebhookUrl: el("slack-webhook").value.trim(),
    notionApiKey: el("notion-api-key").value.trim(),
    notionDatabaseId: el("notion-db-id").value.trim(),
    zapierWebhookUrl: el("zapier-webhook").value.trim(),
    googleCalendarWebhook: el("calendar-webhook").value.trim()
  };
  await chrome.runtime.sendMessage({ type: "set_pro_settings", settings: payload });
  await chrome.storage.sync.set({
    workspaceSocketUrl: el("workspace-socket-url").value.trim(),
    firebaseConfig: {
      enabled: el("firebase-enabled").checked,
      databaseURL: el("firebase-db-url").value.trim(),
      apiKey: el("firebase-api-key").value.trim()
    }
  });
  await chrome.runtime.sendMessage({ type: "settings_updated" });
  showMsg("pro-message", "Pro settings saved");
}

async function refreshLeaderboard() {
  const data = await chrome.runtime.sendMessage({ type: "workspace_leaderboard" });
  const board = el("workspace-leaderboard");
  board.innerHTML = "";
  (data || []).forEach((row, idx) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>#${idx + 1} ${row.name}</span><strong>${row.weeklyFocusScore}</strong>`;
    board.appendChild(li);
  });
}

async function activateLicense() {
  const result = await chrome.runtime.sendMessage({
    type: "activate_license",
    licenseKey: el("license-key").value
  });
  if (result.valid) {
    premiumState.textContent = "Pro";
    showMsg("license-message", "License activated");
  } else {
    showMsg("license-message", result.reason || "License invalid", true);
  }
}

async function exportBackup() {
  const passphrase = el("backup-passphrase").value.trim();
  if (!passphrase) return showMsg("backup-message", "Enter backup passphrase", true);
  const payload = await chrome.runtime.sendMessage({ type: "export_backup" });
  const encrypted = await encryptBackup(payload, passphrase);
  const blob = new Blob([JSON.stringify({ encrypted }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  await chrome.downloads.download({ url, filename: `focus-pomodoro-backup-${Date.now()}.json` });
  URL.revokeObjectURL(url);
  showMsg("backup-message", "Encrypted backup exported");
}

async function importBackupFromFile(file) {
  const passphrase = el("backup-passphrase").value.trim();
  if (!passphrase) return showMsg("backup-message", "Enter backup passphrase", true);
  const text = await file.text();
  const parsed = JSON.parse(text);
  const payload = await decryptBackup(parsed.encrypted, passphrase);
  await chrome.runtime.sendMessage({ type: "import_backup", payload });
  showMsg("backup-message", "Backup imported");
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadInitial();

  el("save-core").onclick = saveCoreSettings;
  el("save-pro").onclick = saveProSettings;
  el("open-dashboard").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
  el("open-diagnostics").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("diagnostics.html") });
  el("upgrade-btn").onclick = async () => {
    const settings = await chrome.runtime.sendMessage({ type: "get_pro_settings" });
    chrome.tabs.create({ url: settings.proUpgradeUrl || "https://example.com/focus-pomodoro-pro" });
  };
  el("activate-license").onclick = activateLicense;
  el("deactivate-license").onclick = async () => {
    await chrome.runtime.sendMessage({ type: "deactivate_license" });
    premiumState.textContent = "Free";
    showMsg("license-message", "License deactivated");
  };

  el("add-blocked").onclick = async () => {
    const site = blockedInput.value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!site) return;
    const sync = await chrome.storage.sync.get({ blockedSites: [] });
    if (!sync.blockedSites.includes(site)) sync.blockedSites.push(site);
    await chrome.storage.sync.set({ blockedSites: sync.blockedSites });
    await chrome.runtime.sendMessage({ type: "settings_updated" });
    blockedInput.value = "";
    renderBlockedSites(sync.blockedSites);
  };

  el("workspace-create").onclick = async () => {
    const res = await chrome.runtime.sendMessage({
      type: "workspace_create",
      displayName: el("workspace-name").value.trim() || "Manager"
    });
    el("workspace-code").value = res.workspaceCode || "";
    showMsg("pro-message", `Workspace created: ${res.workspaceCode}`);
  };
  el("workspace-join").onclick = async () => {
    await chrome.runtime.sendMessage({
      type: "workspace_join",
      workspaceCode: el("workspace-code").value.trim(),
      displayName: el("workspace-name").value.trim() || "Member"
    });
    showMsg("pro-message", "Joined workspace");
  };
  el("workspace-leave").onclick = async () => {
    await chrome.runtime.sendMessage({ type: "workspace_leave" });
    showMsg("pro-message", "Left workspace");
  };
  el("workspace-refresh").onclick = refreshLeaderboard;

  el("export-backup").onclick = exportBackup;
  el("import-backup").onclick = () => el("backup-file").click();
  el("backup-file").onchange = async (e) => {
    if (e.target.files && e.target.files[0]) {
      await importBackupFromFile(e.target.files[0]).catch((err) =>
        showMsg("backup-message", err.message || "Import failed", true)
      );
    }
  };
});