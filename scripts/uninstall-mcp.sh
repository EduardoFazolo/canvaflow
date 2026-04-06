#!/usr/bin/env bash
# Remove the canvaflow MCP server from ~/.claude.json
set -euo pipefail

CLAUDE_CONFIG="$HOME/.claude.json"

if [ ! -f "$CLAUDE_CONFIG" ]; then
  echo "[canvaflow-mcp] No ~/.claude.json found, nothing to uninstall"
  exit 0
fi

node -e "
  const fs = require('fs');
  const path = '$CLAUDE_CONFIG';
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(path, 'utf8')); } catch {}
  if (cfg.mcpServers && cfg.mcpServers.canvaflow) {
    delete cfg.mcpServers.canvaflow;
    fs.writeFileSync(path, JSON.stringify(cfg, null, 2));
    console.log('[canvaflow-mcp] Removed from ' + path);
  } else {
    console.log('[canvaflow-mcp] Not found in ' + path + ', nothing to remove');
  }
"
