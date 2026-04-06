#!/usr/bin/env bash
# Install the canvaflow MCP server into ~/.claude.json
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MCP_INDEX="$(cd "$SCRIPT_DIR/../mcps/canvaflow" && pwd)/index.ts"
CLAUDE_CONFIG="$HOME/.claude.json"

# Ensure deps are installed
(cd "$SCRIPT_DIR/../mcps/canvaflow" && bun install --frozen-lockfile 2>/dev/null || bun install)

# Create config if it doesn't exist
if [ ! -f "$CLAUDE_CONFIG" ]; then
  echo '{}' > "$CLAUDE_CONFIG"
fi

# Use node to safely merge into the JSON config
node -e "
  const fs = require('fs');
  const path = '$CLAUDE_CONFIG';
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(path, 'utf8')); } catch {}
  if (!cfg.mcpServers || typeof cfg.mcpServers !== 'object') cfg.mcpServers = {};
  cfg.mcpServers.canvaflow = { command: 'bun', args: ['run', '$MCP_INDEX'] };
  fs.writeFileSync(path, JSON.stringify(cfg, null, 2));
"

echo "[canvaflow-mcp] Installed into $CLAUDE_CONFIG"
