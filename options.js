// Utility functions for chrome.storage.sync
function getStorage(key, defaultVal) {
    return new Promise((resolve, reject) => {
        chrome.storage.sync.get({ [key]: defaultVal }, (result) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve(result[key]);
            }
        });
    });
}

function setStorage(key, val) {
    return new Promise((resolve, reject) => {
        chrome.storage.sync.set({ [key]: val }, () => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve();
            }
        });
    });
}

// DOMContentLoaded = initialize options page
document.addEventListener('DOMContentLoaded', async function () {
    // Elements
    const workInput = document.getElementById('work-minutes');
    const breakInput = document.getElementById('break-minutes');
    const saveBtn = document.getElementById('save-btn');
    const blockedInput = document.getElementById('blocked-site');
    const addBlockedBtn = document.getElementById('add-blocked');
    const blockedList = document.getElementById('blocked-list');
    const messageEl = document.getElementById('message');

    // Render blocked sites list
    async function renderBlockedList(sites) {
        blockedList.innerHTML = '';
        sites.forEach((site, idx) => {
            const li = document.createElement('li');
            li.textContent = site;
            // Remove button
            const btn = document.createElement('button');
            btn.textContent = 'Remove';
            btn.onclick = async () => {
                sites.splice(idx, 1);
                await setStorage('blockedSites', sites);
                renderBlockedList(sites);
                notifyBackground();
            };
            li.appendChild(btn);
            blockedList.appendChild(li);
        });
    }

    // Show feedback message
    function showMsg(msg, isErr) {
        messageEl.textContent = msg;
        messageEl.style.color = isErr ? '#e55353' : '#248624';
        setTimeout(() => {
            messageEl.textContent = '';
        }, 1700);
    }

    // Notify background script of changes
    function notifyBackground() {
        chrome.runtime.sendMessage({ type: 'settings_updated' });
    }

    // Load saved settings
    try {
        const [work, brk, sites] = await Promise.all([
            getStorage('workMinutes', 25),
            getStorage('breakMinutes', 5),
            getStorage('blockedSites', [])
        ]);
        workInput.value = work;
        breakInput.value = brk;
        renderBlockedList(sites);
    } catch (e) {
        showMsg('Error loading settings.', true);
    }

    // Add blocked site event
    addBlockedBtn.onclick = async () => {
        const val = blockedInput.value.trim();
        if (!val) return;
        let sites = await getStorage('blockedSites', []);
        if (!sites.includes(val)) {
            sites.push(val);
            await setStorage('blockedSites', sites);
            renderBlockedList(sites);
            blockedInput.value = '';
            notifyBackground();
        }
    };

    // Save work/break minutes
    saveBtn.onclick = async () => {
        const work = parseInt(workInput.value, 10);
        const brk = parseInt(breakInput.value, 10);
        if (isNaN(work) || work <= 0 || isNaN(brk) || brk <= 0) {
            showMsg('Please enter valid minutes for work and break.', true);
            return;
        }
        try {
            await setStorage('workMinutes', work);
            await setStorage('breakMinutes', brk);
            showMsg('Settings saved!');
            notifyBackground();
        } catch (e) {
            showMsg('Failed to save settings.', true);
        }
    };
});
// Utility functions for chrome.storage.sync
function getStorage(key, defaultVal) {
    return new Promise((resolve, reject) => {
        chrome.storage.sync.get({ [key]: defaultVal }, result => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve(result[key]);
            }
        });
    });
}

function setStorage(key, val) {
    return new Promise((resolve, reject) => {
        chrome.storage.sync.set({ [key]: val }, () => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve();
            }
        });
    });
}

// DOMContentLoaded = initialize options page
document.addEventListener('DOMContentLoaded', async function () {
    // Elements
    const workInput = document.getElementById('work-minutes');
    const breakInput = document.getElementById('break-minutes');
    const saveBtn = document.getElementById('save-btn');
    const blockedInput = document.getElementById('blocked-site');
    const addBlockedBtn = document.getElementById('add-blocked');
    const blockedList = document.getElementById('blocked-list');
    const messageEl = document.getElementById('message');

    // Render blocked sites list
    async function renderBlockedList(sites) {
        blockedList.innerHTML = '';
        sites.forEach((site, idx) => {
            const li = document.createElement('li');
            li.textContent = site;
            // Remove button
            const btn = document.createElement('button');
            btn.textContent = 'Remove';
            btn.onclick = async () => {
                sites.splice(idx, 1);
                await setStorage('blockedSites', sites);
                renderBlockedList(sites);
                notifyBackground();
            };
            li.appendChild(btn);
            blockedList.appendChild(li);
        });
    }

    // Show feedback message
    function showMsg(msg, isErr) {
        messageEl.textContent = msg;
        messageEl.style.color = isErr ? '#e55353' : '#248624';
        setTimeout(() => { messageEl.textContent = ''; }, 1700);
    }

    // Notify background script of changes
    function notifyBackground() {
        chrome.runtime.sendMessage({ type: "settings_updated" });
    }

    // Load saved settings
    try {
        const [work, brk, sites] = await Promise.all([
            getStorage('workMinutes', 25),
            getStorage('breakMinutes', 5),
            getStorage('blockedSites', [])
        ]);
        workInput.value = work;
        breakInput.value = brk;
        renderBlockedList(sites);
    } catch (e) {
        showMsg("Error loading settings.", true);
    }

    // Add blocked site event
    addBlockedBtn.onclick = async () => {
        const val = blockedInput.value.trim();
        if (!val) return;
        let sites = await getStorage('blockedSites', []);
        if (!sites.includes(val)) {
            sites.push(val);
            await setStorage('blockedSites', sites);
            renderBlockedList(sites);
            blockedInput.value = '';
            notifyBackground();
        }
    };

    // Save work/break minutes
    saveBtn.onclick = async () => {
        const work = parseInt(workInput.value, 10);
        const brk = parseInt(breakInput.value, 10);
        if (isNaN(work) || work <= 0 || isNaN(brk) || brk <= 0) {
            showMsg("Please enter valid minutes for work and break.", true);
            return;
        }
        try {
            await setStorage('workMinutes', work);
            await setStorage('breakMinutes', brk);
            showMsg("Settings saved!");
            notifyBackground();
        } catch (e) {
            showMsg("Failed to save settings.", true);
        }
    };
});