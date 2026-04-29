// DOM elements
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
const breakSuggestionDiv = document.getElementById("breakSuggestion");
const suggestionTextSpan = document.getElementById("suggestionText");
const exportBtn = document.getElementById("exportBtn");
const optionsLink = document.getElementById("optionsLink");

let currentState = {
  workDuration: 25 * 60,
  breakDuration: 5 * 60,
  isWorkSession: true,
  timeLeft: 25 * 60,
  isRunning: false,
  currentTask: ""
};

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function updateTimerDisplay() {
  timerEl.textContent = formatTime(Math.max(0, currentState.timeLeft));
  startBtn.disabled = currentState.isRunning;
  pauseBtn.disabled = !currentState.isRunning;
}

// ---------- Daily tasks (persisted per day) ----------
function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function getDailyTasks() {
  const res = await chrome.storage.local.get({ pomodoroTasks: {} });
  const all = res.pomodoroTasks || {};
  return all[getTodayKey()] || [];
}

async function setDailyTasks(tasks) {
  const res = await chrome.storage.local.get({ pomodoroTasks: {} });
  const all = res.pomodoroTasks || {};
  all[getTodayKey()] = tasks;
  await chrome.storage.local.set({ pomodoroTasks: all });
}

async function renderTasks() {
  const tasks = await getDailyTasks();
  taskListEl.innerHTML = "";
  tasks.forEach((task, idx) => {
    const li = document.createElement("li");
    li.className = `task-item${task.completed ? " completed" : ""}`;
    const span = document.createElement("span");
    span.textContent = task.text;
    span.style.cursor = "pointer";
    span.onclick = () => {
      taskInput.value = task.text;
      saveCurrentTask(task.text);
    };
    const btnDiv = document.createElement("div");
    btnDiv.className = "task-buttons";
    const doneBtn = document.createElement("button");
    doneBtn.textContent = task.completed ? "Undo" : "Done";
    doneBtn.className = "task-btn";
    doneBtn.onclick = async () => {
      tasks[idx].completed = !tasks[idx].completed;
      await setDailyTasks(tasks);
      renderTasks();
      updateDailyStats();
    };
    const delBtn = document.createElement("button");
    delBtn.textContent = "✖";
    delBtn.className = "task-btn";
    delBtn.onclick = async () => {
      tasks.splice(idx, 1);
      await setDailyTasks(tasks);
      renderTasks();
      updateDailyStats();
    };
    btnDiv.appendChild(doneBtn);
    btnDiv.appendChild(delBtn);
    li.appendChild(span);
    li.appendChild(btnDiv);
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
  renderTasks();
  updateDailyStats();
}

async function saveCurrentTask(task) {
  await chrome.storage.local.set({ currentTask: task });
  currentState.currentTask = task;
}

// ---------- Dashboard stats ----------
async function updateDailyStats() {
  const analytics = await chrome.runtime.sendMessage({ type: "getAnalytics" }) || { sessions: [] };
  const today = new Date().toDateString();
  const todaySessions = analytics.sessions.filter(s => s.type === "work" && new Date(s.timestamp).toDateString() === today);
  const completed = todaySessions.filter(s => s.completed).length;
  const totalMinutes = completed * 25;
  sessionsTodaySpan.innerText = completed;
  focusMinutesSpan.innerText = totalMinutes;
  let msg = "";
  if (completed === 0) msg = "✨ Start your first Pomodoro";
  else if (completed < 4) msg = `🌱 ${completed}/4 sessions`;
  else if (completed < 8) msg = "🔥 Keep burning!";
  else msg = "🏆 Legendary focus!";
  motivationSpan.innerText = msg;
}

// ---------- Break suggestions ----------
const exercises = [
  "Look away from screen for 20 sec.",
  "Roll your shoulders 10 times.",
  "Take 3 deep belly breaths.",
  "Stretch your arms upward.",
  "Massage your temples.",
  "Hydrate – drink water."
];
function showBreakSuggestion() {
  const random = exercises[Math.floor(Math.random() * exercises.length)];
  suggestionTextSpan.innerText = random;
  breakSuggestionDiv.style.display = "block";
  setTimeout(() => breakSuggestionDiv.style.display = "none", 8000);
}

// ---------- CSV export ----------
async function exportCSV() {
  const analytics = await chrome.runtime.sendMessage({ type: "getAnalytics" });
  const sessions = analytics.sessions || [];
  let csv = "Timestamp,Type,Task,Completed\n";
  sessions.forEach(s => {
    csv += `"${s.timestamp}",${s.type},"${s.task.replace(/"/g, '""')}",${s.completed}\n`;
  });
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  await chrome.downloads.download({ url, filename: `pomodoro_export_${Date.now()}.csv` });
  URL.revokeObjectURL(url);
}

// ---------- State sync with background ----------
async function fetchState() {
  const resp = await chrome.runtime.sendMessage({ type: "getState" });
  if (resp && resp.success) {
    currentState = { ...currentState, ...resp.state };
    updateTimerDisplay();
    taskInput.value = currentState.currentTask || "";
  }
}

function send(type, extra = {}) {
  return chrome.runtime.sendMessage({ type, ...extra });
}

// ---------- Event listeners ----------
startBtn.onclick = async () => {
  await saveCurrentTask(taskInput.value.trim());
  await send("start");
  fetchState();
};
pauseBtn.onclick = async () => { await send("stop"); fetchState(); };
resetBtn.onclick = async () => { await send("reset"); fetchState(); };
addTaskBtn.onclick = addTask;
taskInput.onkeydown = (e) => { if (e.key === "Enter") addTask(); };
taskInput.onblur = () => saveCurrentTask(taskInput.value.trim());
exportBtn.onclick = exportCSV;
optionsLink.onclick = () => chrome.runtime.openOptionsPage();

// Listen for background updates
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "state_update") {
    currentState = { ...currentState, ...msg.state };
    updateTimerDisplay();
    if (!currentState.isWorkSession && currentState.isRunning && currentState.timeLeft === currentState.breakDuration) {
      showBreakSuggestion();
    }
    updateDailyStats();
  }
});

// Local fallback tick (every second for smooth UI)
setInterval(() => {
  if (currentState.isRunning && currentState.timeLeft > 0) {
    currentState.timeLeft -= 1;
    updateTimerDisplay();
  }
}, 1000);

// Initial load
(async () => {
  await fetchState();
  await renderTasks();
  await updateDailyStats();
})();