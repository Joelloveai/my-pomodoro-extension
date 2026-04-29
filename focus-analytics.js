// focus-analytics.js - plain script, no exports

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