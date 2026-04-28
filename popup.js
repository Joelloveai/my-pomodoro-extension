// Pomodoro Timer UI and Logic

// DOM Elements
const timerEl = document.getElementById('timer');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');

const taskInput = document.getElementById('taskInput');
const addTaskBtn = document.getElementById('addTaskBtn');
const taskListEl = document.getElementById('taskList');

// --- Pomodoro Timer Logic ---

let timerInterval = null;
let currentState = {
    workDuration: 25 * 60,
    breakDuration: 5 * 60,
    isWorkSession: true,
    timeLeft: 25 * 60,
    isRunning: false
};

// Format seconds as mm:ss
function formatTime(secs) {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

function updateTimerDisplay() {
    if (timerEl) {
        timerEl.textContent = formatTime(currentState.timeLeft);
        // Optionally, change color for break/work session
        timerEl.style.color = currentState.isWorkSession ? '' : 'var(--accent)';
    }
    updateControls();
}

function updateControls() {
    if (!startBtn || !pauseBtn || !resetBtn) return;
    startBtn.disabled = currentState.isRunning;
    pauseBtn.disabled = !currentState.isRunning;
}

function fetchAndUpdateState() {
    chrome.runtime.sendMessage({ type: 'getState' }, (resp) => {
        if (resp && resp.success && resp.state) {
            Object.assign(currentState, resp.state);
            updateTimerDisplay();
        }
    });
}

// Button event handlers
if (startBtn) {
    startBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'start' }, () => fetchAndUpdateState());
    });
}
if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'stop' }, () => fetchAndUpdateState());
    });
}
if (resetBtn) {
    resetBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'reset' }, () => fetchAndUpdateState());
    });
}

// Listen for background state updates
chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === 'state_update' && message.state) {
        Object.assign(currentState, message.state);
        updateTimerDisplay();
    }
});

// Polling fallback: update display every second
function startLocalInterval() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        // Display ticks every second, even if not always receiving updates
        currentState.timeLeft = Math.max(0, currentState.timeLeft - (currentState.isRunning ? 1 : 0));
        updateTimerDisplay();
    }, 1000);
}
startLocalInterval();
fetchAndUpdateState();

// ------ Task List Logic ------

function saveTasks(tasks) {
    chrome.storage.local.set({ pomodoroTasks: tasks });
}

function loadTasks(cb) {
    chrome.storage.local.get(['pomodoroTasks'], (result) => {
        cb(Array.isArray(result.pomodoroTasks) ? result.pomodoroTasks : []);
    });
}

function renderTasks(tasks) {
    if (!taskListEl) return;
    taskListEl.innerHTML = '';
    tasks.forEach((task, idx) => {
        const li = document.createElement('li');
        li.className = 'task-item';
        li.textContent = task;

        // Delete button
        const delBtn = document.createElement('button');
        delBtn.className = 'delete-task';
        delBtn.title = 'Delete';
        delBtn.innerHTML = '&times;';
        delBtn.addEventListener('click', () => {
            tasks.splice(idx, 1);
            saveTasks(tasks);
            renderTasks(tasks);
        });
        li.appendChild(delBtn);
        taskListEl.appendChild(li);
    });
}

function addTask(task) {
    loadTasks((tasks) => {
        tasks.push(task);
        saveTasks(tasks);
        renderTasks(tasks);
    });
}

if (addTaskBtn && taskInput) {
    addTaskBtn.addEventListener('click', () => {
        const val = taskInput.value.trim();
        if (val) {
            addTask(val);
            taskInput.value = '';
        }
    });
    taskInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            addTaskBtn.click();
        }
    });
}

// Load tasks on popup open
loadTasks(renderTasks);