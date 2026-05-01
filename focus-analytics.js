const ANALYTICS_STORAGE_KEY = "pomodoroAnalytics";
const SESSION_FEEDBACK_KEY = "sessionFeedback";

async function getAnalytics() {
  const result = await chrome.storage.local.get({
    [ANALYTICS_STORAGE_KEY]: {
      sessions: []
    }
  });
  return result[ANALYTICS_STORAGE_KEY];
}

async function saveAnalytics(data) {
  await chrome.storage.local.set({ [ANALYTICS_STORAGE_KEY]: data });
}

async function logSession(isWorkSession, taskName, completed = true, meta = {}) {
  const analytics = await getAnalytics();
  analytics.sessions.push({
    timestamp: new Date().toISOString(),
    type: isWorkSession ? "work" : "break",
    task: taskName || "",
    completed: Boolean(completed),
    distractions: Number(meta.distractions || 0),
    rating: typeof meta.rating === "number" ? meta.rating : null
  });
  if (analytics.sessions.length > 4000) {
    analytics.sessions = analytics.sessions.slice(-4000);
  }
  await saveAnalytics(analytics);
}

function dayKey(dateInput) {
  const d = new Date(dateInput);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function computeLongestStreak(workSessions) {
  const byDay = [...new Set(workSessions.map((s) => dayKey(s.timestamp)))].sort();
  if (!byDay.length) return 0;
  let longest = 1;
  let current = 1;
  for (let i = 1; i < byDay.length; i += 1) {
    const prev = new Date(byDay[i - 1]);
    const next = new Date(byDay[i]);
    const diff = Math.round((next - prev) / 86400000);
    if (diff === 1) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }
  return longest;
}

function computeTaskCompletionRate(workSessions) {
  const withTask = workSessions.filter((s) => s.task && s.task.trim().length > 0);
  if (!withTask.length) return 0;
  return withTask.filter((s) => s.completed).length / withTask.length;
}

async function calculateFocusScore() {
  const analytics = await getAnalytics();
  const workSessions = analytics.sessions.filter((s) => s.type === "work");
  const windowStart = new Date(Date.now() - 30 * 86400000);
  const recentCompleted = workSessions.filter(
    (s) => s.completed && new Date(s.timestamp) >= windowStart
  ).length;
  const countScore = Math.min(50, Math.round((recentCompleted / 60) * 50));
  const streakScore = Math.min(30, computeLongestStreak(workSessions.filter((s) => s.completed)) * 3);
  const completionScore = Math.round(computeTaskCompletionRate(workSessions) * 20);
  return Math.max(0, Math.min(100, countScore + streakScore + completionScore));
}

async function recordFocusFeedback(payload) {
  const feedbackStore = await chrome.storage.local.get({ [SESSION_FEEDBACK_KEY]: [] });
  const list = feedbackStore[SESSION_FEEDBACK_KEY];
  list.push({
    timestamp: new Date().toISOString(),
    rating: Number(payload.rating || 0),
    taskType: payload.taskType || "general",
    distractions: Number(payload.distractions || 0),
    pomodoroIndex: Number(payload.pomodoroIndex || 0)
  });
  await chrome.storage.local.set({ [SESSION_FEEDBACK_KEY]: list.slice(-2000) });
}

async function generateAiSummary() {
  const feedbackStore = await chrome.storage.local.get({ [SESSION_FEEDBACK_KEY]: [] });
  const feedback = feedbackStore[SESSION_FEEDBACK_KEY];
  if (!feedback.length) {
    return {
      summary: "Not enough data yet. Rate your focus after sessions to unlock coaching insights.",
      tips: ["Track at least 5 sessions this week."]
    };
  }

  const hourMap = new Map();
  let breakEveryTwoBoost = 0;
  feedback.forEach((item) => {
    const hour = new Date(item.timestamp).getHours();
    if (!hourMap.has(hour)) hourMap.set(hour, []);
    hourMap.get(hour).push(item.rating);
    if (item.pomodoroIndex > 0 && item.pomodoroIndex % 2 === 0 && item.rating >= 4) {
      breakEveryTwoBoost += 1;
    }
  });

  const bestHour = [...hourMap.entries()]
    .map(([hour, values]) => ({
      hour,
      avg: values.reduce((a, b) => a + b, 0) / values.length
    }))
    .sort((a, b) => b.avg - a.avg)[0];

  const tips = [];
  if (bestHour) {
    tips.push(`You focus best around ${bestHour.hour}:00-${(bestHour.hour + 1) % 24}:00.`);
  }
  if (breakEveryTwoBoost >= 2) {
    tips.push("Taking a longer break every 2 Pomodoros appears to improve your ratings.");
  }
  const avgDistractions =
    feedback.reduce((sum, x) => sum + (x.distractions || 0), 0) / feedback.length;
  if (avgDistractions > 2) {
    tips.push("Distractions are high; increase smart blocking strictness during work blocks.");
  }

  return {
    summary: "Weekly AI coaching plan generated from your session ratings and behavior patterns.",
    tips: tips.length ? tips : ["Maintain your current cadence; trends are stable."]
  };
}

async function resetAnalytics() {
  await chrome.storage.local.set({
    [ANALYTICS_STORAGE_KEY]: { sessions: [] },
    [SESSION_FEEDBACK_KEY]: []
  });
}