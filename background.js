const DEFAULT_WORK_DURATION = 25 * 60;   // 25 minutes in seconds
const DEFAULT_BREAK_DURATION = 5 * 60;   // 5 minutes in seconds

// Helper to set state in storage
function setState(state) {
    return new Promise((resolve) => {
        chrome.storage.local.set(state, resolve);
    });
}

// Helper to get full state from storage
function getState() {
    return new Promise((resolve) => {
        chrome.storage.local.get([
            'workDuration',
            'breakDuration',
            'isWorkSession',
            'timeLeft',
            'isRunning'
        ], (result) => {
            resolve(result);
        });
    });
}

// Helper to read settings configured in options page
function getSyncSettings() {
    return new Promise((resolve) => {
        chrome.storage.sync.get(
            {
                workMinutes: 25,
                breakMinutes: 5
            },
            (result) => resolve(result)
        );
    });
}

async function applySyncDurations() {
    const { workMinutes, breakMinutes } = await getSyncSettings();
    const workDuration = Number(workMinutes) > 0 ? Number(workMinutes) * 60 : DEFAULT_WORK_DURATION;
    const breakDuration = Number(breakMinutes) > 0 ? Number(breakMinutes) * 60 : DEFAULT_BREAK_DURATION;

    const state = await getState();
    const stateUpdate = { workDuration, breakDuration };

    // Keep currently running session uninterrupted; otherwise update visible countdown.
    if (!state.isRunning) {
        stateUpdate.timeLeft = state.isWorkSession ? workDuration : breakDuration;
    }

    await setState(stateUpdate);
}

// Initialize state if not present
async function initializeState() {
    const state = await getState();
    const newState = {};
    if (typeof state.workDuration !== 'number') newState.workDuration = DEFAULT_WORK_DURATION;
    if (typeof state.breakDuration !== 'number') newState.breakDuration = DEFAULT_BREAK_DURATION;
    if (typeof state.isWorkSession !== 'boolean') newState.isWorkSession = true;
    if (typeof state.timeLeft !== 'number') newState.timeLeft = newState.workDuration || state.workDuration || DEFAULT_WORK_DURATION;
    if (typeof state.isRunning !== 'boolean') newState.isRunning = false;
    if (Object.keys(newState).length > 0) await setState(newState);
    await applySyncDurations();
}
initializeState();

// Create or clear the tick alarm
function startTicking() {
    chrome.alarms.create('pomodoro_tick', { periodInMinutes: 1 / 60 }); // 1 second
}
function stopTicking() {
    chrome.alarms.clear('pomodoro_tick');
}

// Send state update to popup
async function notifyPopup() {
    const state = await getState();
    chrome.runtime.sendMessage({ type: 'state_update', state });
}

// Show notification
function showSessionNotification(isWorkSession) {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: isWorkSession ? 'Work session started!' : 'Break time!',
        message: isWorkSession
            ? "Time to focus! Let's get to work."
            : 'Take a break, relax your mind!'
    });
}

// Alarm handler
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== 'pomodoro_tick') return;
    const state = await getState();
    if (!state.isRunning) {
        stopTicking();
        return;
    }
    let { timeLeft, isWorkSession, workDuration, breakDuration } = state;
    timeLeft = typeof timeLeft === 'number' ? timeLeft : (isWorkSession ? workDuration : breakDuration);

    timeLeft -= 1;
    if (timeLeft <= 0) {
        isWorkSession = !isWorkSession;
        timeLeft = isWorkSession
            ? (typeof workDuration === 'number' ? workDuration : DEFAULT_WORK_DURATION)
            : (typeof breakDuration === 'number' ? breakDuration : DEFAULT_BREAK_DURATION);
        showSessionNotification(isWorkSession);
    }
    await setState({ timeLeft, isWorkSession });
    notifyPopup();
});

// Message listener for popup control
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
        switch (message.type) {
            case 'start': {
                const state = await getState();
                if (!state.isRunning) {
                    await setState({ isRunning: true });
                    startTicking();
                }
                sendResponse({ success: true });
                notifyPopup();
                break;
            }
            case 'stop': {
                await setState({ isRunning: false });
                stopTicking();
                sendResponse({ success: true });
                notifyPopup();
                break;
            }
            case 'reset': {
                const state = await getState();
                const timeLeft = state.isWorkSession
                    ? (typeof state.workDuration === 'number' ? state.workDuration : DEFAULT_WORK_DURATION)
                    : (typeof state.breakDuration === 'number' ? state.breakDuration : DEFAULT_BREAK_DURATION);
                await setState({ timeLeft, isRunning: false });
                stopTicking();
                sendResponse({ success: true });
                notifyPopup();
                break;
            }
            case 'getState': {
                const state = await getState();
                sendResponse({ success: true, state });
                break;
            }
            case 'setDurations': {
                let { workDuration, breakDuration } = message;
                if (typeof workDuration !== 'number' || workDuration <= 0) workDuration = DEFAULT_WORK_DURATION;
                if (typeof breakDuration !== 'number' || breakDuration <= 0) breakDuration = DEFAULT_BREAK_DURATION;
                const state = await getState();
                // If stopped: reset timeLeft for next session. If running: do not interrupt.
                let newTimeLeft = state.isWorkSession ? workDuration : breakDuration;
                let stateUpdate = {
                    workDuration,
                    breakDuration
                };
                if (!state.isRunning) {
                    stateUpdate.timeLeft = newTimeLeft;
                }
                await setState(stateUpdate);
                sendResponse({ success: true });
                notifyPopup();
                break;
            }
            case 'settings_updated': {
                await applySyncDurations();
                sendResponse({ success: true });
                notifyPopup();
                break;
            }
            default:
                sendResponse({ success: false, error: 'Unknown message type' });
        }
    })();
    // Indicate async response
    return true;
});

// On install, set default state if missing.
chrome.runtime.onInstalled.addListener(() => {
    initializeState();
});