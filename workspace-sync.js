const WORKSPACE_STATE_KEY = "workspaceState";
const TEAM_STATUS_KEY = "teamStatusCache";

function makeWorkspaceCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

async function getWorkspaceState() {
  const data = await chrome.storage.sync.get({
    [WORKSPACE_STATE_KEY]: {
      enabled: false,
      workspaceCode: "",
      displayName: "",
      role: "member"
    }
  });
  return data[WORKSPACE_STATE_KEY];
}

async function setWorkspaceState(nextState) {
  await chrome.storage.sync.set({ [WORKSPACE_STATE_KEY]: nextState });
}

async function createWorkspace(displayName) {
  const workspaceCode = makeWorkspaceCode();
  const state = {
    enabled: true,
    workspaceCode,
    displayName: displayName || "Anonymous",
    role: "manager"
  };
  await setWorkspaceState(state);
  return state;
}

async function joinWorkspace(workspaceCode, displayName) {
  const state = {
    enabled: true,
    workspaceCode: String(workspaceCode || "").trim().toUpperCase(),
    displayName: displayName || "Anonymous",
    role: "member"
  };
  await setWorkspaceState(state);
  return state;
}

async function leaveWorkspace() {
  await setWorkspaceState({
    enabled: false,
    workspaceCode: "",
    displayName: "",
    role: "member"
  });
}

async function getFirebaseConfig() {
  const data = await chrome.storage.sync.get({
    firebaseConfig: {
      enabled: false,
      databaseURL: "",
      apiKey: ""
    }
  });
  return data.firebaseConfig;
}

async function syncTeamSnapshot(snapshot) {
  const workspace = await getWorkspaceState();
  const firebase = await getFirebaseConfig();
  if (!workspace.enabled || !firebase.enabled || !firebase.databaseURL) return { synced: false };

  const userId = (await chrome.storage.local.get({ localUserId: crypto.randomUUID() })).localUserId;
  await chrome.storage.local.set({ localUserId: userId });

  const url = `${firebase.databaseURL.replace(/\/$/, "")}/workspaces/${workspace.workspaceCode}/members/${userId}.json`;
  const payload = {
    ...snapshot,
    displayName: workspace.displayName,
    role: workspace.role,
    updatedAt: new Date().toISOString()
  };
  await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return { synced: true };
}

async function fetchWorkspaceLeaderboard() {
  const workspace = await getWorkspaceState();
  const firebase = await getFirebaseConfig();
  if (!workspace.enabled || !firebase.enabled || !firebase.databaseURL) return [];
  const url = `${firebase.databaseURL.replace(/\/$/, "")}/workspaces/${workspace.workspaceCode}/members.json`;
  const response = await fetch(url);
  if (!response.ok) return [];
  const payload = (await response.json()) || {};
  const members = Object.values(payload);
  const sorted = members
    .map((x) => ({
      name: x.displayName || "Unknown",
      weeklyFocusScore: Number(x.weeklyFocusScore || 0),
      status: x.status || "offline"
    }))
    .sort((a, b) => b.weeklyFocusScore - a.weeklyFocusScore);
  await chrome.storage.local.set({ [TEAM_STATUS_KEY]: sorted });
  return sorted;
}

