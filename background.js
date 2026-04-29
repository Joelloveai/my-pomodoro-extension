// ==================== FOCUS ANALYTICS ====================
const ANALYTICS_STORAGE_KEY = "pomodoroAnalytics";

async function getAnalytics() {
  const result = await chrome.storage.local.get(ANALYTICS_STORAGE_KEY);
  return result[ANALYTICS_STORAGE_KEY] || { sessions: [] };
}

async function saveAnalytics(data) {
  await chrome.storage.local.set({ [ANALYTICS_STORAGE_KEY]: data });
}

async function logSession(isWorkSession, taskName, completed = true) {
  const analytics = await getAnalytics();
  analytics.sessions.push({
    timestamp: new Date().toISOString(),
    type: isWorkSession ? "work" : "break",
    task: taskName || "",
    completed: Boolean(completed)
  });
  if (analytics.sessions.length > 2000) analytics.sessions = analytics.sessions.slice(-2000);
  await saveAnalytics(analytics);
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function computeLongestStreak(workSessions) {
  if (!workSessions.length) return 0;
  const uniqueDays = new Set(workSessions.map(s => startOfDay(s.timestamp).toISOString()));
  const sorted = Array.from(uniqueDays).map(d => new Date(d)).sort((a, b) => a - b);
  let longest = 1, current = 1;
  for (let i = 1; i < sorted.length; i++) {
    const diff = Math.round((sorted[i] - sorted[i - 1]) / 86400000);
    if (diff === 1) {
      current++;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }
  return longest;
}

function computeTaskCompletionRate(workSessions) {
  const withTasks = workSessions.filter(s => s.task && s.task.trim().length > 0);
  if (!withTasks.length) return 0;
  const completed = withTasks.filter(s => s.completed).length;
  return completed / withTasks.length;
}

async function calculateFocusScore() {
  const analytics = await getAnalytics();
  const workSessions = analytics.sessions.filter(s => s.type === "work");
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  const recentCompleted = workSessions.filter(s => s.completed && new Date(s.timestamp) >= thirtyDaysAgo).length;
  const countScore = Math.min(50, Math.round((recentCompleted / 60) * 50));
  const streakScore = Math.min(30, computeLongestStreak(workSessions.filter(s => s.completed)) * 3);
  const completionRate = computeTaskCompletionRate(workSessions);
  const completionScore = Math.round(completionRate * 20);
  return Math.min(100, countScore + streakScore + completionScore);
}

// ==================== TIMER STATE ====================
const DEFAULT_WORK = 25 * 60;
const DEFAULT_BREAK = 5 * 60;
const ALARM_TICK = "pomodoro_tick";

async function getState() {
  const data = await chrome.storage.local.get([
    "workDuration", "breakDuration", "isWorkSession",
    "timeLeft", "isRunning", "currentTask"
  ]);
  return {
    workDuration: data.workDuration ?? DEFAULT_WORK,
    breakDuration: data.breakDuration ?? DEFAULT_BREAK,
    isWorkSession: data.isWorkSession ?? true,
    timeLeft: data.timeLeft ?? DEFAULT_WORK,
    isRunning: data.isRunning ?? false,
    currentTask: data.currentTask ?? ""
  };
}

async function setState(partial) {
  await chrome.storage.local.set(partial);
}

async function notifyPopup() {
  const state = await getState();
  chrome.runtime.sendMessage({ type: "state_update", state }).catch(() => {});
}

function startTicking() {
  // Chrome alarms do not reliably support very small periodic intervals.
  // Use a one-shot tick and re-schedule on each alarm callback.
  chrome.alarms.create(ALARM_TICK, { when: Date.now() + 1000 });
}

function stopTicking() {
  chrome.alarms.clear(ALARM_TICK);
}

// ==================== DYNAMIC RULES ====================
async function updateDynamicRules() {
  const { blockedSites = [] } = await chrome.storage.sync.get("blockedSites");
  const rules = blockedSites.map((site, idx) => ({
    id: idx + 1,
    priority: 1,
    action: { type: "block" },
    condition: {
      urlFilter: `||${site}`,
      resourceTypes: ["main_frame"]
    }
  }));
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const oldIds = existingRules.map(r => r.id);
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: oldIds,
    addRules: rules
  });
}

// ==================== IDLE DETECTION (only if permission exists) ====================
if (chrome.idle) {
  let wasRunningBeforeIdle = false;
  chrome.idle.setDetectionInterval(15);
  chrome.idle.onStateChanged.addListener(async (newState) => {
    const state = await getState();
    if (newState === "idle" && state.isRunning) {
      wasRunningBeforeIdle = true;
      await setState({ isRunning: false });
      stopTicking();
      notifyPopup();
      chrome.notifications.create("idlePause", {
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: "Timer paused due to inactivity",
        message: "You were away. Resume when you're back?",
        buttons: [{ title: "Resume" }, { title: "Reset" }]
      });
    } else if (newState === "active" && wasRunningBeforeIdle) {
      wasRunningBeforeIdle = false;
    }
  });

  chrome.notifications.onButtonClicked.addListener(async (notifId, btnIndex) => {
    if (notifId === "idlePause") {
      if (btnIndex === 0) {
        const state = await getState();
        if (!state.isRunning && state.timeLeft > 0) {
          await setState({ isRunning: true });
          startTicking();
          notifyPopup();
        }
      } else if (btnIndex === 1) {
        const state = await getState();
        const newTime = state.isWorkSession ? state.workDuration : state.breakDuration;
        await setState({ timeLeft: newTime, isRunning: false });
        stopTicking();
        notifyPopup();
      }
      chrome.notifications.clear(notifId);
    }
  });
}

// ==================== ALARM ====================
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_TICK) return;
  const state = await getState();
  if (!state.isRunning) {
    stopTicking();
    return;
  }

  let { timeLeft, isWorkSession, workDuration, breakDuration, currentTask } = state;
  if (timeLeft <= 1) {
    if (isWorkSession) {
      await logSession(true, currentTask, true);
    }
    const nextIsWork = !isWorkSession;
    const nextTime = nextIsWork ? workDuration : breakDuration;
    await setState({ isWorkSession: nextIsWork, timeLeft: nextTime });
    notifyPopup();
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: nextIsWork ? "Work session started" : "Break time!",
      message: nextIsWork ? "Back to focus." : "Stand up, stretch, hydrate."
    });
    // Attempt sound only if offscreen API exists (permission)
    if (chrome.offscreen) {
      try {
        await chrome.offscreen.createDocument({
          url: "offscreen.html",
          reasons: ["AUDIO_PLAYBACK"],
          justification: "Play notification sound"
        });
        chrome.runtime.sendMessage({ type: "playBeep" });
      } catch(e) {}
    }
  } else {
    await setState({ timeLeft: timeLeft - 1 });
    notifyPopup();
  }

  // Re-schedule the next 1-second tick while still running.
  startTicking();
});

// ==================== APPLY SYNCED DURATIONS ====================
async function applySyncDurations() {
  const { workMinutes = 25, breakMinutes = 5 } = await chrome.storage.sync.get(["workMinutes", "breakMinutes"]);
  const workDuration = Math.max(1, workMinutes) * 60;
  const breakDuration = Math.max(1, breakMinutes) * 60;
  const state = await getState();
  const update = { workDuration, breakDuration };
  if (!state.isRunning) {
    update.timeLeft = state.isWorkSession ? workDuration : breakDuration;
  }
  await setState(update);
}

// ==================== MESSAGE HANDLING ====================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case "start":
        {
          const state = await getState();
          if (!state.isRunning) {
            await setState({ isRunning: true });
            startTicking();
          }
          sendResponse({ success: true });
        }
        break;
      case "stop":
        await setState({ isRunning: false });
        stopTicking();
        sendResponse({ success: true });
        break;
      case "reset":
        {
          const state = await getState();
          const newTime = state.isWorkSession ? state.workDuration : state.breakDuration;
          await setState({ timeLeft: newTime, isRunning: false });
          stopTicking();
          sendResponse({ success: true });
        }
        break;
      case "getState":
        {
          const state = await getState();
          sendResponse({ success: true, state });
        }
        break;
      case "settings_updated":
        await applySyncDurations();
        await updateDynamicRules();
        sendResponse({ success: true });
        break;
      case "getAnalytics":
        {
          const analytics = await getAnalytics();
          sendResponse(analytics);
        }
        break;
      case "getFocusScore":
        {
          const score = await calculateFocusScore();
          sendResponse(score);
        }
        break;
      default:
        sendResponse({ success: false, error: "Unknown type" });
    }
    notifyPopup();
  })();
  return true;
});

// ==================== INIT ====================
async function init() {
  await applySyncDurations();
  await updateDynamicRules();
  const state = await getState();
  if (state.isRunning) startTicking();
}
chrome.runtime.onInstalled.addListener(init);
init();