const timerEl = document.getElementById("timer");
const startBtn = document.getElementById("startBtn");
const pauseBtn = document.getElementById("pauseBtn");
const resetBtn = document.getElementById("resetBtn");
const taskInput = document.getElementById("taskInput");
const addTaskBtn = document.getElementById("addTaskBtn");
const taskListEl = document.getElementById("taskList");
const sessionsTodaySpan = document.getElementById("sessionsToday");
const focusMinutesSpan = document.getElementById("focusMinutes");
const motivationSpan = document.getElementById("motivationMsg");
const suggestionTextSpan = document.getElementById("suggestionText");
const breakSuggestionDiv = document.getElementById("breakSuggestion");
const exportBtn = document.getElementById("exportBtn");
const optionsLink = document.getElementById("optionsLink");
const openDashboardBtn = document.getElementById("openDashboardBtn");
const feedbackPrompt = document.getElementById("feedbackPrompt");
const ratingButtons = document.getElementById("ratingButtons");
const proBadge = document.getElementById("proBadge");

let previousState = null;
let currentState = {
  workDuration: 1500,
  breakDuration: 300,
  isWorkSession: true,
  timeLeft: 1500,
  isRunning: false,
  currentTask: "",
  pomodoroIndex: 0
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(seconds) {
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

async function send(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

function updateTimerDisplay() {
  timerEl.textContent = formatTime(Math.max(0, currentState.timeLeft));
  startBtn.disabled = currentState.isRunning;
  pauseBtn.disabled = !currentState.isRunning;
}

async function getDailyTasks() {
  const data = await chrome.storage.local.get({ pomodoroTasks: {} });
  return data.pomodoroTasks[todayKey()] || [];
}

async function setDailyTasks(tasks) {
  const data = await chrome.storage.local.get({ pomodoroTasks: {} });
  data.pomodoroTasks[todayKey()] = tasks;
  await chrome.storage.local.set({ pomodoroTasks: data.pomodoroTasks });
}

async function saveCurrentTask(task) {
  await chrome.storage.local.set({ currentTask: task });
  currentState.currentTask = task;
}

async function renderTasks() {
  const tasks = await getDailyTasks();
  taskListEl.innerHTML = "";
  tasks.forEach((task, idx) => {
    const li = document.createElement("li");
    li.className = `task-item${task.completed ? " completed" : ""}`;

    const label = document.createElement("span");
    label.textContent = task.text;
    label.onclick = async () => {
      taskInput.value = task.text;
      await saveCurrentTask(task.text);
    };

    const actions = document.createElement("div");
    actions.className = "task-buttons";
    const done = document.createElement("button");
    done.className = "task-btn";
    done.textContent = task.completed ? "Undo" : "Done";
    done.onclick = async () => {
      tasks[idx].completed = !tasks[idx].completed;
      await setDailyTasks(tasks);
      await renderTasks();
      await updateDailyStats();
    };
    const del = document.createElement("button");
    del.className = "task-btn";
    del.textContent = "X";
    del.onclick = async () => {
      tasks.splice(idx, 1);
      await setDailyTasks(tasks);
      await renderTasks();
      await updateDailyStats();
    };
    actions.append(done, del);
    li.append(label, actions);
    taskListEl.appendChild(li);
  });
}

async function addTask() {
  const text = taskInput.value.trim();
  if (!text) return;
  const tasks = await getDailyTasks();
  tasks.push({ text, completed: false });
  await setDailyTasks(tasks);
  await saveCurrentTask(text);
  taskInput.value = "";
  await renderTasks();
}

async function updateDailyStats() {
  const analytics = (await send("getAnalytics")) || { sessions: [] };
  const today = new Date().toDateString();
  const sessions = analytics.sessions.filter(
    (x) => x.type === "work" && new Date(x.timestamp).toDateString() === today && x.completed
  );
  sessionsTodaySpan.textContent = String(sessions.length);
  focusMinutesSpan.textContent = String(sessions.length * 25);
  if (sessions.length === 0) motivationSpan.textContent = "Start your first focus block";
  else if (sessions.length < 4) motivationSpan.textContent = `${sessions.length}/4 target`;
  else motivationSpan.textContent = "Great momentum";
}

async function exportCSV() {
  const analytics = (await send("getAnalytics")) || { sessions: [] };
  const header = "Timestamp,Type,Task,Completed,Distractions,Rating\n";
  const body = analytics.sessions
    .map(
      (s) =>
        `"${s.timestamp}",${s.type},"${String(s.task || "").replace(/"/g, '""')}",${Boolean(s.completed)},${Number(
          s.distractions || 0
        )},${s.rating ?? ""}`
    )
    .join("\n");
  const blob = new Blob([header + body], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  await chrome.downloads.download({ url, filename: `focus-pomodoro-${Date.now()}.csv` });
  URL.revokeObjectURL(url);
}

async function loadPremiumBadge() {
  const premium = await send("premium_state");
  proBadge.textContent = premium && premium.isPremium ? "Pro" : "Free";
}

function showBreakSuggestion() {
  const list = [
    "Look 20 feet away for 20 seconds.",
    "Take 3 deep breaths.",
    "Stand and stretch shoulders."
  ];
  suggestionTextSpan.textContent = list[Math.floor(Math.random() * list.length)];
  breakSuggestionDiv.style.display = "block";
  setTimeout(() => {
    breakSuggestionDiv.style.display = "none";
  }, 6000);
}

async function showFocusRatingPrompt() {
  feedbackPrompt.classList.remove("hidden");
  ratingButtons.innerHTML = "";
  for (let i = 1; i <= 5; i += 1) {
    const btn = document.createElement("button");
    btn.textContent = String(i);
    btn.onclick = async () => {
      feedbackPrompt.classList.add("hidden");
      await send("record_focus_feedback", {
        payload: {
          rating: i,
          taskType: currentState.currentTask ? "task" : "general",
          distractions: 0,
          pomodoroIndex: currentState.pomodoroIndex
        }
      });
    };
    ratingButtons.appendChild(btn);
  }
}

async function fetchState() {
  const resp = await send("getState");
  if (resp && resp.success) {
    previousState = { ...currentState };
    currentState = { ...currentState, ...resp.state };
    taskInput.value = currentState.currentTask || "";
    updateTimerDisplay();
  }
}

startBtn.onclick = async () => {
  await saveCurrentTask(taskInput.value.trim());
  await send("start");
  await fetchState();
};
pauseBtn.onclick = async () => {
  await send("stop");
  await fetchState();
};
resetBtn.onclick = async () => {
  await send("reset");
  await fetchState();
};
addTaskBtn.onclick = addTask;
taskInput.onkeydown = (e) => {
  if (e.key === "Enter") addTask();
};
taskInput.onblur = async () => {
  await saveCurrentTask(taskInput.value.trim());
};
exportBtn.onclick = exportCSV;
optionsLink.onclick = () => chrome.runtime.openOptionsPage();
openDashboardBtn.onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });

chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg.type !== "state_update") return;
  previousState = { ...currentState };
  currentState = { ...currentState, ...msg.state };
  updateTimerDisplay();
  await updateDailyStats();
  if (previousState && previousState.isWorkSession && !currentState.isWorkSession) {
    showBreakSuggestion();
    await showFocusRatingPrompt();
  }
});

setInterval(() => {
  if (currentState.isRunning && currentState.timeLeft > 0) {
    currentState.timeLeft -= 1;
    updateTimerDisplay();
  }
}, 1000);

(async () => {
  await fetchState();
  await renderTasks();
  await updateDailyStats();
  await loadPremiumBadge();
})();