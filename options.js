const workInput = document.getElementById("work-minutes");
const breakInput = document.getElementById("break-minutes");
const saveBtn = document.getElementById("save-btn");
const blockedInput = document.getElementById("blocked-site");
const addBlockedBtn = document.getElementById("add-blocked");
const blockedList = document.getElementById("blocked-list");
const messageEl = document.getElementById("message");
const focusScoreSpan = document.getElementById("focus-score");
const soundRadios = document.querySelectorAll('input[name="sound"]');

function showMessage(text, isError) {
  messageEl.textContent = text;
  messageEl.style.color = isError ? "#d9534f" : "#2c7a2c";
  setTimeout(() => messageEl.textContent = "", 2000);
}

async function loadSettings() {
  const data = await chrome.storage.sync.get({
    workMinutes: 25,
    breakMinutes: 5,
    blockedSites: [],
    soundEnabled: true
  });
  workInput.value = data.workMinutes;
  breakInput.value = data.breakMinutes;
  if (data.soundEnabled) {
    document.querySelector('input[name="sound"][value="on"]').checked = true;
  } else {
    document.querySelector('input[name="sound"][value="off"]').checked = true;
  }
  renderBlockedList(data.blockedSites);
}

function renderBlockedList(sites) {
  blockedList.innerHTML = "";
  sites.forEach((site, idx) => {
    const li = document.createElement("li");
    li.textContent = site;
    const delBtn = document.createElement("button");
    delBtn.textContent = "Remove";
    delBtn.style.background = "#dc3545";
    delBtn.style.marginLeft = "12px";
    delBtn.onclick = async () => {
      sites.splice(idx, 1);
      await chrome.storage.sync.set({ blockedSites: sites });
      renderBlockedList(sites);
      await chrome.runtime.sendMessage({ type: "settings_updated" });
      showMessage(`Removed ${site}`, false);
    };
    li.appendChild(delBtn);
    blockedList.appendChild(li);
  });
}

async function updateFocusScore() {
  const score = await chrome.runtime.sendMessage({ type: "getFocusScore" });
  focusScoreSpan.textContent = score ?? 0;
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadSettings();
  await updateFocusScore();

  addBlockedBtn.onclick = async () => {
    let site = blockedInput.value.trim().toLowerCase();
    if (!site) return;
    // Remove http:// or https://
    site = site.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const { blockedSites = [] } = await chrome.storage.sync.get("blockedSites");
    if (!blockedSites.includes(site)) {
      blockedSites.push(site);
      await chrome.storage.sync.set({ blockedSites });
      renderBlockedList(blockedSites);
      blockedInput.value = "";
      await chrome.runtime.sendMessage({ type: "settings_updated" });
      showMessage(`Added ${site}`, false);
    } else {
      showMessage("Site already blocked", true);
    }
  };

  saveBtn.onclick = async () => {
    const work = parseInt(workInput.value, 10);
    const brk = parseInt(breakInput.value, 10);
    if (isNaN(work) || work <= 0 || isNaN(brk) || brk <= 0) {
      showMessage("Enter valid minutes > 0", true);
      return;
    }
    const soundEnabled = document.querySelector('input[name="sound"]:checked').value === "on";
    await chrome.storage.sync.set({ workMinutes: work, breakMinutes: brk, soundEnabled });
    await chrome.runtime.sendMessage({ type: "settings_updated" });
    showMessage("✅ Settings saved", false);
    await updateFocusScore();
  };
});