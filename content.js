(async function () {
  const sync = await chrome.storage.sync.get({ proSettings: { smartBlocking: false } });
  const state = await chrome.storage.local.get({
    isRunning: false,
    isWorkSession: true
  });
  const pro = sync.proSettings || {};

  if (!pro.smartBlocking || !state.isRunning || !state.isWorkSession) return;
  const blocked = await chrome.storage.sync.get({ blockedSites: [] });
  const domain = location.hostname.toLowerCase();
  const shouldFade = (blocked.blockedSites || []).some((site) => domain.includes(site.toLowerCase()));
  if (!shouldFade) return;

  const quoteList = [
    "Deep work compounds faster than distraction.",
    "Protect your attention, protect your results.",
    "One focused hour beats a scattered day."
  ];
  const quote = quoteList[Math.floor(Math.random() * quoteList.length)];

  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.backdropFilter = "grayscale(1) blur(2px)";
  overlay.style.background = "rgba(20,20,30,0.88)";
  overlay.style.color = "#fff";
  overlay.style.zIndex = "2147483647";
  overlay.style.display = "flex";
  overlay.style.flexDirection = "column";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.innerHTML = `
    <h1 style="margin:0 0 8px;font:600 28px system-ui;">Focus Mode Active</h1>
    <p style="margin:0 0 20px;font:16px system-ui;max-width:560px;text-align:center;">${quote}</p>
    <button id="fp-close-overlay" style="padding:10px 14px;border-radius:8px;border:1px solid #66ff99;background:transparent;color:#66ff99;cursor:pointer;">I need this site for work (2 min)</button>
  `;
  document.documentElement.appendChild(overlay);
  overlay.querySelector("#fp-close-overlay").onclick = () => {
    overlay.remove();
    setTimeout(() => {
      if (overlay.isConnected) overlay.remove();
    }, 120000);
  };
})();

