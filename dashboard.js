const scoreEl = document.getElementById("focusScore");
const sessionCountEl = document.getElementById("sessionCount");
const completionRateEl = document.getElementById("completionRate");
const bestHourEl = document.getElementById("bestHour");
const aiSummaryEl = document.getElementById("aiSummary");
const aiTipsEl = document.getElementById("aiTips");
const leaderboardEl = document.getElementById("leaderboard");

function drawLineChart(canvas, points, color) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!points.length) return;
  const max = Math.max(...points, 1);
  const w = canvas.width;
  const h = canvas.height;
  const step = w / Math.max(points.length - 1, 1);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = i * step;
    const y = h - (p / max) * (h - 20) - 10;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function drawHeatmap(canvas, values) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const cellW = canvas.width / 24;
  const max = Math.max(...values, 1);
  values.forEach((v, i) => {
    const alpha = 0.15 + (v / max) * 0.8;
    ctx.fillStyle = `rgba(102,255,153,${alpha})`;
    ctx.fillRect(i * cellW + 1, 20, cellW - 2, 120);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px sans-serif";
    if (i % 3 === 0) ctx.fillText(String(i), i * cellW + 3, 12);
  });
}

async function loadDashboard() {
  const analytics = (await chrome.runtime.sendMessage({ type: "getAnalytics" })) || { sessions: [] };
  const score = await chrome.runtime.sendMessage({ type: "getFocusScore" });
  const ai = await chrome.runtime.sendMessage({ type: "get_ai_summary" });
  const leaderboard = await chrome.runtime.sendMessage({ type: "workspace_leaderboard" });

  const work = analytics.sessions.filter((s) => s.type === "work");
  const complete = work.filter((s) => s.completed);
  scoreEl.textContent = String(score || 0);
  sessionCountEl.textContent = String(work.length);
  completionRateEl.textContent = `${work.length ? Math.round((complete.length / work.length) * 100) : 0}%`;

  const hourly = Array.from({ length: 24 }, () => 0);
  complete.forEach((s) => {
    hourly[new Date(s.timestamp).getHours()] += 1;
  });
  const bestHourIndex = hourly.indexOf(Math.max(...hourly));
  bestHourEl.textContent = `${bestHourIndex}:00`;

  const byDay = {};
  complete.forEach((s) => {
    const day = new Date(s.timestamp).toISOString().slice(0, 10);
    byDay[day] = (byDay[day] || 0) + 1;
  });
  const weeklyPoints = Object.entries(byDay)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-14)
    .map((x) => x[1]);

  drawLineChart(document.getElementById("weeklyChart"), weeklyPoints, "#66ff99");
  drawHeatmap(document.getElementById("hourlyChart"), hourly);

  aiSummaryEl.textContent = ai.summary || "No AI summary yet.";
  aiTipsEl.innerHTML = "";
  (ai.tips || []).forEach((tip) => {
    const li = document.createElement("li");
    li.textContent = tip;
    aiTipsEl.appendChild(li);
  });

  leaderboardEl.innerHTML = "";
  (leaderboard || []).forEach((row, idx) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>#${idx + 1} ${row.name}</span><strong>${row.weeklyFocusScore}</strong>`;
    leaderboardEl.appendChild(li);
  });
}

document.getElementById("refreshBtn").onclick = loadDashboard;
document.getElementById("downloadPdfBtn").onclick = () => window.print();
loadDashboard();

