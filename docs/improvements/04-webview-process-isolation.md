# Webview Process Isolation

## Problem

Browser webview crashes or heavy pages can affect other webviews or the main renderer. Session isolation exists, but process-level isolation could be stronger.

## Proposal

Ensure each browser webview runs in its own renderer process with full sandboxing.

### Steps

1. **Unique partitions per node** — already done via session isolation, but verify each webview uses `partition: persist:node-<nodeId>` so Chromium allocates separate renderer processes.

2. **Enable sandbox mode** — set `webPreferences.sandbox = true` on all webview tags where possible. This restricts what a compromised renderer can do.

3. **Set process-per-site** — Electron inherits Chromium's process model. Ensure `--site-per-process` is not disabled. Each origin gets its own process, preventing one crashed site from taking down another.

4. **Memory limits** — use `webContents.setBackgroundThrottling(true)` and consider `app.commandLine.appendSwitch('js-flags', '--max-old-space-size=256')` per webview to cap memory usage of individual browser nodes.

### Plugin Webviews

For plugin nodes that use webviews (Notion, Trello, Lovable), apply the same isolation. Each should get a unique partition and sandbox mode.

## Impact

- One crashed browser tab doesn't affect others
- Prevents malicious or heavy pages from destabilizing the app
- Better memory accounting per node

## Complexity

Low. Mostly configuration changes to existing webview setup.
