# Kanban + Git Worktree Integration — Overview

## Summary

When a kanban card is dragged to the "In Progress" column, show the TaskDropModal. Instead of creating nodes on the current canvas, this creates a **new canvas tab** backed by a **git worktree** with a dedicated branch. A Claude agent is spawned autonomously (`--dangerously-skip-permissions`) in the worktree canvas. The kanban board tracks agent status via the existing agentic signal system and auto-moves cards to "Review" when the agent finishes.

## Dependency Order

```
01-git-worktree-backend
  └── 02-worktree-canvas-views
        └── 03-kanban-in-progress-modal
              └── 04-agent-spawning
                    └── 05-status-bridge
                          └── 06-ux-polish
```

## Key Decisions

- **Worktree path**: `.worktrees/<branch-name>/` relative to workspace root
- **Branch base**: default is current HEAD, toggle to branch from `main`
- **Agent mode**: `--dangerously-skip-permissions` flag always on
- **Status tracking**: reuse existing agentic signal server on port 39847
- **Card→Agent mapping**: persisted to `app_state` table as `kanban_agent_map_${workspaceId}`
