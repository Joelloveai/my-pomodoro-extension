importScripts("focus-analytics.js", "license.js", "pro-services.js", "workspace-sync.js");

const DEFAULT_WORK = 25 * 60;
const DEFAULT_BREAK = 5 * 60;
const TIMER_ALARM = "pomodoro_tick";
const KEEP_ALIVE_ALARM = "fp_keepalive";

async function getTimerState() {
  const state = await chrome.storage.local.get({
    workDuration: DEFAULT_WORK,
    breakDuration: DEFAULT_BREAK,
    isWorkSession: true,
    timeLeft: DEFAULT_WORK,
    isRunning: false,
    currentTask: "",
    pomodoroIndex: 0
  });
  return state;
}

async function setTimerState(patch) {
  await chrome.storage.local.set(patch);
}

async function notifyPopup() {
  const state = await getTimerState();
  await chrome.runtime.sendMessage({ type: "state_update", state }).catch(() => {});
}

function startTicking() {
  chrome.alarms.create(TIMER_ALARM, { when: Date.now() + 1000 });
}

function stopTicking() {
  chrome.alarms.clear(TIMER_ALARM);
}

async function ensureOffscreenDocument() {
  try {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["AUDIO_PLAYBACK"],
      justification: "Session transition sounds"
    });
  } catch (_e) {
    // Already open or unavailable.
  }
}

async function applySyncDurations() {
  const sync = await chrome.storage.sync.get({ workMinutes: 25, breakMinutes: 5 });
  const timer = await getTimerState();
  const workDuration = Math.max(1, Number(sync.workMinutes) || 25) * 60;
  const breakDuration = Math.max(1, Number(sync.breakMinutes) || 5) * 60;
  const patch = { workDuration, breakDuration };
  if (!timer.isRunning) patch.timeLeft = timer.isWorkSession ? workDuration : breakDuration;
  await setTimerState(patch);
}

async function updateSmartBlockingRules(isWorkSession) {
  const settings = await chrome.storage.sync.get({ blockedSites: [] });
  const pro = await getProSettings();
  const domains = new Set((settings.blockedSites || []).map((d) => String(d).toLowerCase()));

  if (pro.smartBlocking && isWorkSession) {
    const discovered = ["youtube.com", "facebook.com", "reddit.com", "twitter.com", "x.com"];
    discovered.forEach((domain) => {
      if (classifyDomainDistractionLevel(domain, pro.strictness) === "very_distracting") {
        domains.add(domain);
      }
    });
  }

  const rules = [...domains].slice(0, 200).map((site, idx) => ({
    id: idx + 1,
    priority: 1,
    action: { type: "block" },
    condition: {
      urlFilter: `||${site}`,
      resourceTypes: ["main_frame"]
    }
  }));
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((r) => r.id),
    addRules: rules
  });
}

async function publishTeamStatus(state) {
  const score = await calculateFocusScore();
  await syncTeamSnapshot({
    status: state.isRunning ? (state.isWorkSession ? "focusing" : "break") : "idle",
    timeLeft: state.timeLeft,
    completedToday: state.pomodoroIndex,
    weeklyFocusScore: score
  }).catch(() => {});
}

async function triggerSessionCompletionWorkflows(stateBefore) {
  const score = await calculateFocusScore();
  await notifyIntegrations("session_completed", {
    message: `Completed work session for task "${stateBefore.currentTask || "Untitled"}". Score: ${score}`,
    startTime: new Date(Date.now() - stateBefore.workDuration * 1000).toISOString(),
    endTime: new Date().toISOString()
  });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === KEEP_ALIVE_ALARM) {
    const timer = await getTimerState();
    if (timer.isRunning) startTicking();
    return;
  }
  if (alarm.name !== TIMER_ALARM) return;

  const state = await getTimerState();
  if (!state.isRunning) return;

  const nextTime = state.timeLeft - 1;
  if (nextTime <= 0) {
    const nextIsWorkSession = !state.isWorkSession;
    if (state.isWorkSession) {
      await logSession(true, state.currentTask, true);
      await triggerSessionCompletionWorkflows(state);
    }
    await setTimerState({
      isWorkSession: nextIsWorkSession,
      timeLeft: nextIsWorkSession ? state.workDuration : state.breakDuration,
      pomodoroIndex: state.isWorkSession ? state.pomodoroIndex + 1 : state.pomodoroIndex
    });
    await updateSmartBlockingRules(nextIsWorkSession);
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: nextIsWorkSession ? "Work Session Started" : "Break Time",
      message: nextIsWorkSession ? "Back to deep work." : "Take a short recovery break."
    });
    const sync = await chrome.storage.sync.get({ soundEnabled: true });
    const pro = await getProSettings();
    if (sync.soundEnabled) {
      await ensureOffscreenDocument();
      chrome.runtime.sendMessage({
        type: "playBeep",
        volume: Number(pro.soundVolume || 0.4)
      }).catch(() => {});
    }
  } else {
    await setTimerState({ timeLeft: nextTime });
  }

  const updated = await getTimerState();
  await publishTeamStatus(updated);
  await notifyPopup();
  startTicking();
});

let workspaceSocket = null;
let workspaceSocketRetryAt = 0;

async function refreshWorkspaceSocket() {
  const workspace = await getWorkspaceState();
  if (!workspace.enabled) {
    if (workspaceSocket) workspaceSocket.close();
    workspaceSocket = null;
    return;
  }
  const syncConfig = await chrome.storage.sync.get({ workspaceSocketUrl: "" });
  const url = syncConfig.workspaceSocketUrl;
  if (!url) return;
  if (workspaceSocket && workspaceSocket.readyState === WebSocket.OPEN) return;
  if (Date.now() < workspaceSocketRetryAt) return;

  try {
    workspaceSocket = new WebSocket(url);
    workspaceSocket.onopen = () => {
      workspaceSocket.send(
        JSON.stringify({ type: "join", workspaceCode: workspace.workspaceCode, displayName: workspace.displayName })
      );
    };
    workspaceSocket.onmessage = async (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === "leaderboard_update") {
          await chrome.storage.local.set({ workspaceLeaderboard: payload.data || [] });
        }
      } catch (_e) {}
    };
    workspaceSocket.onclose = () => {
      workspaceSocketRetryAt = Date.now() + 5000;
    };
  } catch (_e) {
    workspaceSocketRetryAt = Date.now() + 10000;
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case "start": {
        const state = await getTimerState();
        if (!state.isRunning) {
          await setTimerState({ isRunning: true });
          await updateSmartBlockingRules(true);
          startTicking();
        }
        sendResponse({ success: true });
        break;
      }
      case "stop":
        await setTimerState({ isRunning: false });
        stopTicking();
        sendResponse({ success: true });
        break;
      case "reset": {
        const state = await getTimerState();
        await setTimerState({
          isRunning: false,
          timeLeft: state.isWorkSession ? state.workDuration : state.breakDuration
        });
        stopTicking();
        sendResponse({ success: true });
        break;
      }
      case "getState":
        sendResponse({ success: true, state: await getTimerState() });
        break;
      case "setDurations":
        await setTimerState({
          workDuration: Number(msg.workDuration) || DEFAULT_WORK,
          breakDuration: Number(msg.breakDuration) || DEFAULT_BREAK
        });
        sendResponse({ success: true });
        break;
      case "settings_updated":
        await applySyncDurations();
        await updateSmartBlockingRules((await getTimerState()).isWorkSession);
        await refreshWorkspaceSocket();
        sendResponse({ success: true });
        break;
      case "getAnalytics":
        sendResponse(await getAnalytics());
        break;
      case "getFocusScore":
        sendResponse(await calculateFocusScore());
        break;
      case "record_focus_feedback":
        await recordFocusFeedback(msg.payload || {});
        sendResponse({ success: true });
        break;
      case "get_ai_summary":
        sendResponse(await generateAiSummary());
        break;
      case "activate_license":
        sendResponse(await activateLicense(msg.licenseKey));
        break;
      case "deactivate_license":
        await deactivateLicense();
        sendResponse({ success: true });
        break;
      case "premium_state":
        sendResponse(await getPremiumState());
        break;
      case "workspace_create":
        sendResponse(await createWorkspace(msg.displayName));
        break;
      case "workspace_join":
        sendResponse(await joinWorkspace(msg.workspaceCode, msg.displayName));
        break;
      case "workspace_leave":
        await leaveWorkspace();
        sendResponse({ success: true });
        break;
      case "workspace_leaderboard":
        sendResponse(await fetchWorkspaceLeaderboard());
        break;
      case "get_pro_settings":
        sendResponse(await getProSettings());
        break;
      case "set_pro_settings":
        sendResponse(await setProSettings(msg.settings || {}));
        break;
      case "export_backup":
        sendResponse(await chrome.storage.local.get(null));
        break;
      case "import_backup":
        if (msg.payload && typeof msg.payload === "object") {
          await chrome.storage.local.set(msg.payload);
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: "Invalid payload" });
        }
        break;
      default:
        sendResponse({ success: false, error: "Unknown message type" });
    }
    await notifyPopup();
  })();
  return true;
});

async function init() {
  await applySyncDurations();
  await updateSmartBlockingRules((await getTimerState()).isWorkSession);
  await refreshWorkspaceSocket();
  chrome.alarms.create(KEEP_ALIVE_ALARM, { periodInMinutes: 0.5 });
  const timer = await getTimerState();
  if (timer.isRunning) startTicking();
}

chrome.runtime.onInstalled.addListener(init);
init();