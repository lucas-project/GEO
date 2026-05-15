# GEO AI OS — Chrome Extension

MV3 side-panel extension that lets you analyze any open webpage for AI search visibility.

## Install (development)

1. Run the GEO backend locally: `npm run dev` from the project root.
2. Open `chrome://extensions/` in Chrome.
3. Toggle **Developer mode** (top-right).
4. Click **Load unpacked** and select this folder (`clients/chrome-extension`).
5. Pin the extension and click the icon — the side panel opens.

## Usage

1. Navigate to any webpage you want to audit.
2. Click the extension icon.
3. Click **Analyze this page for AI visibility**.
4. The audit runs against the GEO backend (~30–60s) and the result renders in the side panel.

## Configuration

By default the extension targets `http://localhost:3000`. Change this in
**Right-click extension → Options** (or `chrome://extensions/?id=...` →
Extension options).

## File layout

```
chrome-extension/
├── manifest.json          # MV3 manifest
├── background.js          # Service worker (opens side panel on click)
├── panel/
│   ├── index.html         # Side panel UI
│   ├── panel.css
│   └── panel.js           # POSTs current tab URL → /api/geo-audit
├── options/
│   ├── index.html         # API URL settings
│   └── options.js
└── icons/                 # SVG source + README for PNG generation
```

## Permissions

- `activeTab` — read the current tab's URL when the user clicks the action.
- `sidePanel` — open the side panel.
- `storage` — persist the API URL.
- `host_permissions` — allow the panel to call the GEO API across origins.

This extension is intentionally open source — the moat is the GEO Knowledge
Graph and the scoring engine, not the extension surface itself.
