const PRO_SETTINGS_KEY = "proSettings";
const PRO_DEFAULTS = {
  workspaceSync: false,
  aiCoach: false,
  slackIntegration: false,
  notionIntegration: false,
  googleCalendarIntegration: false,
  zapierIntegration: false,
  advancedDashboard: false,
  smartBlocking: false,
  cloudBackup: false,
  emailDigest: false,
  strictness: "medium",
  quoteSource: "builtin",
  theme: "system",
  soundVolume: 0.4,
  proUpgradeUrl: "https://example.com/focus-pomodoro-pro",
  slackWebhookUrl: "",
  notionApiKey: "",
  notionDatabaseId: "",
  googleCalendarWebhook: "",
  zapierWebhookUrl: ""
};

const DISTRACTING_KEYWORDS = {
  low: ["reddit", "x.com", "twitter", "news", "gaming", "youtube", "facebook", "instagram"],
  medium: ["reddit", "x.com", "twitter", "news", "gaming", "youtube", "facebook", "instagram", "tiktok", "netflix"],
  high: ["reddit", "x.com", "twitter", "news", "gaming", "youtube", "facebook", "instagram", "tiktok", "netflix", "discord", "twitch"]
};

async function getProSettings() {
  const data = await chrome.storage.sync.get({ [PRO_SETTINGS_KEY]: PRO_DEFAULTS });
  return { ...PRO_DEFAULTS, ...(data[PRO_SETTINGS_KEY] || {}) };
}

async function setProSettings(settings) {
  const merged = { ...PRO_DEFAULTS, ...settings };
  await chrome.storage.sync.set({ [PRO_SETTINGS_KEY]: merged });
  return merged;
}

function classifyDomainDistractionLevel(domain, strictness = "medium") {
  const normalized = String(domain || "").toLowerCase();
  const keys = DISTRACTING_KEYWORDS[strictness] || DISTRACTING_KEYWORDS.medium;
  return keys.some((k) => normalized.includes(k)) ? "very_distracting" : "neutral";
}

async function getMotivationalQuote() {
  const settings = await getProSettings();
  if (settings.quoteSource === "builtin") {
    const quotes = [
      "Discipline is choosing what you want most over what you want now.",
      "Small focus blocks beat vague big goals.",
      "Clarity grows after action."
    ];
    return quotes[Math.floor(Math.random() * quotes.length)];
  }
  return "Today is another chance to do deep work.";
}

async function notifyIntegrations(eventName, payload) {
  const settings = await getProSettings();

  const jobs = [];
  if (settings.slackIntegration && settings.slackWebhookUrl) {
    jobs.push(
      fetch(settings.slackWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `Focus Pomodoro ${eventName}: ${payload.message || ""}`
        })
      }).catch(() => {})
    );
  }

  if (settings.zapierIntegration && settings.zapierWebhookUrl) {
    jobs.push(
      fetch(settings.zapierWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventName, payload })
      }).catch(() => {})
    );
  }

  if (settings.notionIntegration && settings.notionApiKey && settings.notionDatabaseId) {
    jobs.push(
      fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${settings.notionApiKey}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          parent: { database_id: settings.notionDatabaseId },
          properties: {
            Name: {
              title: [{ text: { content: `Pomodoro ${eventName}` } }]
            },
            Notes: {
              rich_text: [{ text: { content: payload.message || "" } }]
            }
          }
        })
      }).catch(() => {})
    );
  }

  if (settings.googleCalendarIntegration && settings.googleCalendarWebhook) {
    jobs.push(
      fetch(settings.googleCalendarWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: `Focus Pomodoro ${eventName}`,
          start: payload.startTime,
          end: payload.endTime,
          description: payload.message
        })
      }).catch(() => {})
    );
  }

  await Promise.all(jobs);
}

