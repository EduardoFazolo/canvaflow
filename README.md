# CanvaFlow

An infinite canvas workspace for developers. Arrange terminals, browsers, code editors, notes, and external tools freely on a 2D canvas — zoom, pan, and build your own layout.


https://github.com/user-attachments/assets/7299ce7f-9f99-4211-a5c1-25d354e1d70f



---

## Features

### Infinite Canvas

Pan and zoom across an unbounded 2D workspace. Every node lives at a precise position and size you control. Double-tap a node to zoom-fit it; double-tap again to zoom back out. The canvas state persists across sessions via SQLite.

### Built-in Node Types

| Node | Description |
|------|-------------|
| **Terminal** | Full terminal emulation via xterm.js. Sessions survive app restarts using tmux (auto-detected). Mouse support works correctly at any zoom level. |
| **Browser** | Chromium webview with per-workspace session isolation. Named sessions, private sessions, and OAuth flows all work. Cookie state is persisted per workspace. |
| **Code Editor** | Monaco Editor with Shiki syntax highlighting and full Git integration — branch picker, diff view, staging, commits, logs, and clone support. |
| **Notes** | Rich text editor (Tiptap) with bold, italic, lists, and image embeds. |
| **Files** | Directory browser with color-coded file types and syntax-highlighted previews. |

### Plugin Nodes

Plugins extend the canvas with self-contained embeds:

- **Notion** — Embed any Notion page. Drag blocks from Notion onto the canvas. Export Notion content to rich text notes.
- **Claude** — Persistent Claude AI chat panel (Cmd+Shift+C).
- **Codex** — Persistent Codex AI chat panel (Cmd+Shift+X).
- **Trello** — Browse boards and cards with checklist support.
- **Browser** — Reusable webview wrapper for custom integrations.

### Multiple Workspaces

Create isolated workspaces for different projects. Each workspace has its own set of nodes, canvas state, browser sessions, and layout. Switching workspaces is instant.

### Performance

- Viewport culling: only nodes visible on screen are rendered.
- Keep-alive: terminals, browsers, and plugins with long-running state stay mounted off-screen.
- WAL mode SQLite for fast, non-blocking saves.
- Synchronous canvas save on app close — no data loss.

---

## Installation

**Prerequisites**

- [Bun](https://bun.sh) (package manager)
- macOS or Linux
- tmux (optional, recommended — enables terminal session persistence)

**Clone and install**

```bash
git clone <repo-url>
cd canvaflow
bun install
```

**Run in development**

```bash
bun run dev
```

**Build for production**

```bash
bun run build
```

Produces a `.dmg` on macOS or `.AppImage` on Linux (configured in `package.json` under `build`).

**Run tests**

```bash
bun run test
bun run test:watch   # watch mode
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop | Electron 33 |
| Build | electron-vite + Vite 5 |
| UI | React 18 + TypeScript 5 |
| Styling | Tailwind CSS 4 |
| State | Zustand 5 |
| Persistence | better-sqlite3 (WAL mode) |
| Terminal | node-pty + xterm.js 5 |
| Code editor | Monaco Editor + Shiki |
| Rich text | Tiptap 3 |
| Git | simple-git |

---

## Plugin Development

Plugins are compile-time TypeScript modules. Adding one requires editing two import lines. There is no dynamic loading.

### Concepts

Every plugin implements the `CanvaFlowPlugin` interface:

```ts
interface CanvaFlowPlugin {
  id: string                              // unique, URL-safe
  nodeType: string                        // stored in SQLite
  defaultSize: { width: number; height: number }
  defaultTitle: string
  component: React.ComponentType<{ node: NodeData }>
  keepAlive?: boolean                     // stay mounted when off-screen
  sidebarLabel?: string
  shortcut?: string                       // e.g. 'Meta+Shift+M'
  registerMainHandlers?(ipc: IpcMainLike): void
  preloadScripts?: string[]
}
```

### File Structure

```
src/plugins/<id>/
  index.ts                 ← renderer manifest (no Node.js imports)
  renderer/
    <Id>Node.tsx           ← React component
  main/
    handlers.ts            ← IPC handlers (optional, main process only)
  preload/
    <id>Webview.ts         ← webview preload script (optional)
```

### Step 1 — Create the manifest

`src/plugins/myplugin/index.ts`:

```ts
import { MyPluginNode } from './renderer/MyPluginNode'
import type { CanvaFlowPlugin } from '../types'

export const myPlugin: CanvaFlowPlugin = {
  id: 'myplugin',
  nodeType: 'myplugin',
  defaultSize: { width: 600, height: 400 },
  defaultTitle: 'My Plugin',
  component: MyPluginNode,
  sidebarLabel: 'My Plugin',
  shortcut: 'Meta+Shift+M',
}
```

> `index.ts` must not import anything from `main/` or any Node.js/Electron module — it is bundled by the renderer Vite build.

### Step 2 — Build the React component

`src/plugins/myplugin/renderer/MyPluginNode.tsx`:

```tsx
import React from 'react'
import { NodeData } from '../../../renderer/src/stores/nodeStore'
import { BaseNode } from '../../../renderer/src/components/BaseNode'

interface Props {
  node: NodeData
}

export function MyPluginNode({ node }: Props): React.ReactElement {
  return (
    <BaseNode node={node}>
      <div style={{ padding: 16 }}>Hello from {node.title}</div>
    </BaseNode>
  )
}
```

`BaseNode` provides the title bar, resize handles, and focus ring. Always use relative imports — the `@renderer` alias does not resolve inside `src/plugins/`.

**Useful hooks and stores:**

| Import | What it gives you |
|--------|-------------------|
| `useNodeStore` | Add, remove, update nodes; get the focused node |
| `useCameraStore` | Camera state; `screenToWorld` / `worldToScreen` transforms |
| `useCanvasDrag` | Drag-and-drop ghost UI for cross-webview drags |
| `useSessionStore` | Browser session management |

### Step 3 — Register in the renderer

`src/renderer/src/main.tsx`:

```ts
import { myPlugin } from '../../plugins/myplugin'
pluginRegistry.register(myPlugin)
```

`NodeLayer.tsx` calls `pluginRegistry.get(node.type)` for every canvas node automatically.

### Step 4 — Add IPC handlers (optional)

`src/plugins/myplugin/main/handlers.ts`:

```ts
import type { IpcMainLike } from '../../types'

export function registerMyPluginHandlers(ipc: IpcMainLike): void {
  ipc.handle('myplugin:doSomething', async (_event, arg: string) => {
    return `result for ${arg}`
  })
}
```

Wire it in `src/main/index.ts`:

```ts
import { registerMyPluginHandlers } from '../plugins/myplugin/main/handlers'
registerMyPluginHandlers(ipcMain)
```

Expose it through the preload bridge (`src/preload/index.ts`):

```ts
myplugin: {
  doSomething: (arg: string): Promise<string> =>
    ipcRenderer.invoke('myplugin:doSomething', arg),
},
```

Add the type to `src/renderer/src/types/window.d.ts`:

```ts
myplugin: {
  doSomething: (arg: string) => Promise<string>
}
```

Call it from your component:

```ts
const result = await window.api.myplugin.doSomething('hello')
```

### Step 5 — Add a webview preload script (optional)

For plugins that embed a `<webview>` and need to inject a script:

1. Create `src/plugins/myplugin/preload/mypluginWebview.ts`.

2. Register the entry in `electron.vite.config.ts`:

```ts
preload: {
  build: {
    rollupOptions: {
      input: {
        index: 'src/preload/index.ts',
        mypluginWebview: 'src/plugins/myplugin/preload/mypluginWebview.ts',
      }
    }
  }
}
```

3. Resolve the compiled path from your main handler:

```ts
import { join } from 'path'
// __dirname is out/main at runtime
const preloadPath = join(__dirname, '../preload/mypluginWebview.js')
```

4. Return the path to the renderer via an IPC call so the component can set it on the `<webview preload="...">` attribute.

### Drag-and-drop across webviews

Use `useCanvasDrag` when items need to be dragged from inside a webview onto the canvas:

```tsx
import { useCanvasDrag } from '../../../renderer/src/hooks/useCanvasDrag'
import { createPortal } from 'react-dom'

const { isDragging, ghostX, ghostY, startDrag, nudge, cancel } = useCanvasDrag({
  onDrop(clientX, clientY) {
    const { camera } = useCameraStore.getState()
    const worldX = (clientX - camera.x) / camera.zoom
    const worldY = (clientY - camera.y) / camera.zoom
    // create a node at (worldX, worldY)
  },
})

// In JSX:
{isDragging && createPortal(
  <div style={{
    position: 'fixed',
    left: ghostX - 60,
    top: ghostY - 16,
    pointerEvents: 'none',
  }}>
    Dragging…
  </div>,
  document.body,
)}
```

The webview preload script sends cursor deltas via `ipcRenderer.sendToHost` and your component calls `nudge(dx, dy)` in the `ipc-message` handler.

### Plugin checklist

- [ ] `src/plugins/<id>/index.ts` — implements `CanvaFlowPlugin`, no Node.js imports
- [ ] `src/plugins/<id>/renderer/<Id>Node.tsx` — React component using `BaseNode`
- [ ] `src/renderer/src/main.tsx` — `pluginRegistry.register(myPlugin)`
- [ ] `src/main/index.ts` — `registerMyPluginHandlers(ipcMain)` (if IPC needed)
- [ ] `src/preload/index.ts` + `window.d.ts` — preload bridge (if IPC needed)
- [ ] `electron.vite.config.ts` — preload entry (if webview preload needed)
- [ ] `bun run build` passes with no renderer-bundle errors

---

## Project Structure

```
src/
  main/              Electron main process (window, IPC, SQLite, pty, tmux)
  preload/           Context bridge — exposes safe APIs to renderer
  renderer/src/      React application
    components/      Node components, canvas UI, BaseNode
    stores/          Zustand stores (nodes, camera, workspace, sessions…)
    hooks/           Canvas drag, visible nodes, resize…
    views/           Canvas view, settings
  plugins/
    types.ts         CanvaFlowPlugin interface + PluginRegistry singleton
    notion/          Notion embed (webview, drag, export)
    claude/          Claude AI chat
    monaco/          Code editor + Git
    trello/          Trello boards
    browser/         Generic browser preload
```
