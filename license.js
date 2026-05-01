const LICENSE_STORAGE_KEY = "proLicense";
const PREMIUM_STATE_KEY = "premiumState";
const PUBLIC_KEY_HINT = "FOCUS_POMODORO_PUBLIC_KEY_V1";

function normalizeLicenseKey(key) {
  return String(key || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");
}

function checksum(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33 + input.charCodeAt(i)) % 100000;
  }
  return String(hash).padStart(5, "0");
}

function validateLicenseLocally(licenseKey) {
  const normalized = normalizeLicenseKey(licenseKey);
  const parts = normalized.split("-");
  if (parts.length !== 4 || parts[0] !== "FPRO") {
    return { valid: false, reason: "Invalid format" };
  }
  const payload = `${parts[0]}-${parts[1]}-${parts[2]}-${PUBLIC_KEY_HINT}`;
  const expected = checksum(payload);
  const valid = expected === parts[3];
  return {
    valid,
    reason: valid ? "ok" : "Checksum mismatch",
    tier: valid ? "pro" : "free"
  };
}

async function getPremiumState() {
  const data = await chrome.storage.sync.get({
    [PREMIUM_STATE_KEY]: {
      isPremium: false,
      tier: "free",
      source: "none",
      updatedAt: null
    }
  });
  return data[PREMIUM_STATE_KEY];
}

async function setPremiumState(nextState) {
  await chrome.storage.sync.set({ [PREMIUM_STATE_KEY]: nextState });
}

async function activateLicense(licenseKey) {
  const validation = validateLicenseLocally(licenseKey);
  if (!validation.valid) return validation;

  const nextState = {
    isPremium: true,
    tier: validation.tier,
    source: "license_key",
    updatedAt: new Date().toISOString()
  };
  await chrome.storage.sync.set({ [LICENSE_STORAGE_KEY]: normalizeLicenseKey(licenseKey) });
  await setPremiumState(nextState);
  return { valid: true, tier: "pro" };
}

async function deactivateLicense() {
  await chrome.storage.sync.remove([LICENSE_STORAGE_KEY]);
  await setPremiumState({
    isPremium: false,
    tier: "free",
    source: "none",
    updatedAt: new Date().toISOString()
  });
}

