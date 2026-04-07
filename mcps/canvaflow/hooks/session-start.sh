#!/usr/bin/env bash
#
# CanvaFlow SessionStart hook for Claude Code.
#
# Claude Code invokes this script every time a session starts (new or
# resumed) and pipes session metadata to it via stdin as JSON. We extract
# the session_id and POST it back to the CanvaFlow bridge so the app can
# persist the mapping nodeId → sessionId and resume the session later.
#
# Required environment variable:
#   CANVAFLOW_NODE_ID — set by the PTY spawner in the main process.
#
# This script is intentionally minimal and dependency-free (no jq), so it
# starts fast and never blocks Claude. All errors are silently ignored —
# a failed report should never break the user's session.

set -e

# If we don't know which CanvaFlow node we belong to, exit silently.
# This handles the case of a user running `claude` directly outside CanvaFlow
# in a directory where our settings happen to be installed.
if [ -z "${CANVAFLOW_NODE_ID:-}" ]; then
  exit 0
fi

# Read the JSON payload from stdin (Claude Code provides session_id, etc.)
INPUT=$(cat)

# Extract session_id with a regex — avoids the jq dependency.
# Looks for "session_id":"<value>" and captures the value.
SESSION_ID=$(printf '%s' "$INPUT" | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)

if [ -z "$SESSION_ID" ]; then
  exit 0
fi

# Fire-and-forget POST. -m 1 caps the request at 1s so a stalled bridge
# never delays Claude startup.
curl -sS -m 1 -X POST 'http://127.0.0.1:7824/agent/session' \
  -H 'Content-Type: application/json' \
  -d "{\"nodeId\":\"${CANVAFLOW_NODE_ID}\",\"sessionId\":\"${SESSION_ID}\"}" \
  > /dev/null 2>&1 || true

exit 0
