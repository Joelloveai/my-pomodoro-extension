# Focus Pomodoro (Pro Architecture)

Production-ready Chrome extension foundation with offline timer, premium gating, workspace sync, AI coaching summaries, integrations, dashboard analytics, and diagnostics.

## Features Implemented

- Core timer + tasks + site blocking
- Pro feature toggles (`options.html`)
- Local premium license validator (`license.js`)
- Team workspace state + Firebase REST sync scaffolding (`workspace-sync.js`)
- AI coaching insights from focus ratings (`focus-analytics.js`)
- Integrations hooks for Slack, Notion, Google Calendar, Zapier (`pro-services.js`)
- Smart blocking strictness with motivational focus mode overlay (`content.js`)
- Dashboard (`dashboard.html`) and diagnostics (`diagnostics.html`)
- Encrypted backup export/import with passphrase
- Keep-alive + crash recovery timer bootstrap in background

## File Tree (Key Files)

- `manifest.json`
- `background.js`
- `focus-analytics.js`
- `license.js`
- `pro-services.js`
- `workspace-sync.js`
- `popup.html`
- `popup.css`
- `popup.js`
- `options.html`
- `options.js`
- `dashboard.html`
- `dashboard.css`
- `dashboard.js`
- `diagnostics.html`
- `diagnostics.js`
- `content.js`
- `offscreen.html`
- `offscreen.js`
- `site-blocklist.json`
- `firebase-config.example.js`
- `package.json`
- `build.mjs`

## Setup

### 1) Load extension

1. Open `chrome://extensions`
2. Enable Developer Mode
3. Click **Load unpacked**
4. Select this project folder

### 2) Firebase (workspace sync)

1. Create Firebase project.
2. Enable Realtime Database.
3. Copy `databaseURL` and `apiKey`.
4. Open extension Options > **Cloud & Backup** and fill:
   - Firebase database URL
   - Firebase API key
   - Enable Firebase sync

### 3) Premium

- In Options > **Premium & Licensing**, enter a license key.
- Current validator is local checksum-based for demo/offline workflow.
- Upgrade button opens configured checkout URL in Pro settings.

### 4) Integrations

Set optional values in Options > **Pro Integrations**:

- Slack webhook URL
- Notion API key + database ID
- Google Calendar webhook endpoint
- Zapier webhook URL

## Build

```bash
npm install
npm run build
```

## Test Checklist

1. Start/pause/reset timer works in popup.
2. Session transition triggers notification + optional beep.
3. Focus rating prompt appears after work session.
4. Smart blocking updates dynamic DNR rules.
5. License activation toggles Free/Pro state.
6. Workspace create/join/leaderboard refresh works.
7. Dashboard loads charts and AI summary.
8. Diagnostics page reports all checks.
9. Backup export/import works with passphrase.

## Security Notes

- Keep API secrets out of source control.
- Use restricted webhooks and rotate credentials.
- Consider moving license verification to backend for production-grade anti-tamper protection.

