# CanvaFlow Performance Architecture

How CanvaFlow stays smooth with dozens of browser views, terminals, and plugin nodes on a single canvas.

---

## Core Principle: Canvas Interaction is King

Everything else yields to zoom and pan. The main thread must never be blocked by node initialization, IPC calls, or heavy rendering while the user is interacting with the canvas.

---

## 1. Staggered Activation Queue

**Problem:** Loading a workspace with 10+ browser nodes and terminals would create all WebContentsViews and spawn all PTYs simultaneously, freezing the app for 1-3 seconds.

**Solution:** Nodes activate one at a time through a queue in `activationStore.ts`.

### How it works

- On workspace load, `useWorkspaceInit.ts` calls `queueActivation(nodeIds, priorityIds)`
- Priority = nodes currently visible in the viewport (computed from camera + node positions)
- The queue processes one node every **150ms**
- Each activation triggers the node's heavy initialization (WebContentsView creation, PTY spawn)

### Canvas interaction pauses the queue

- `canvasInteractionStart` event fires -> queue **freezes** immediately (no more activations)
- `canvasInteractionEnd` event fires -> queue waits **300ms** for the canvas to settle, then resumes
- This means zooming/panning is always buttery smooth regardless of how many nodes are still loading

### User clicks cut the queue

- `activateNow(nodeId)` bypasses the queue entirely — the clicked node activates instantly
- The node is removed from the queue so it doesn't double-activate later
- All click handlers in `BaseNode`, `TerminalNode`, `BrowserNode`, `BrowserNodeV2` use `activateNow`

### Key files

- `src/renderer/src/stores/activationStore.ts` — Queue logic, pause/resume, priority ordering
- `src/renderer/src/hooks/useWorkspaceInit.ts` — `activateNodesAfterMount()` computes visible priority set
- `src/renderer/src/utils/canvasInteraction.ts` — Start/end events that control queue pause

---

## 2. Activation-Gated Resource Creation

**Problem:** `BrowserNodeV2` created its `WebContentsView` on component mount (`useEffect([], [])`) regardless of activation state. This meant all browser views were created the instant React mounted them.

**Solution:** Gate heavy resource creation on `isActivated`.

### Browser nodes

```tsx
// BrowserNodeV2.tsx — only creates WebContentsView when queue activates this node
useEffect(() => {
  if (!isActivated) return
  window.browser.create(node.id, partition, url, bounds).then(() => setViewCreated(true))
  return () => window.browser.destroy(node.id)
}, [isActivated])
```

### Terminal nodes

Terminal nodes already gated PTY creation on `isActivated` — no change needed:

```tsx
useEffect(() => {
  if (!isActivated || !termRef.current) return
  const term = new Terminal({ ... })
  window.terminal.create(node.id, ...)
}, [isActivated])
```

### What shows before activation

Before a node is activated, it shows a lightweight `NodePlaceholder` component — just an SVG icon and "Click to start" text on a dark background. No heavy resources, no IPC.

---

## 3. Smooth Activation Transitions

**Problem:** Nodes would flash from placeholder to content — jarring and made the staggered loading feel broken.

**Solution:** `ActivationFade` component in `NodePlaceholder.tsx`.

### Terminal nodes — ActivationFade wrapper

- Placeholder stays as a base layer
- When activated, real content renders on top at `opacity: 0`
- Next frame: opacity transitions to `1` over 400ms with `ease-out`
- After 500ms the placeholder unmounts

### Browser nodes — BrowserPlaceholderFade overlay

Browser nodes are special because the native Electron `WebContentsView` appears behind the DOM, not inside it.

- Placeholder renders as an opaque overlay at `z-index: 2`
- Once activated, waits 200ms for the native view to load underneath
- Then fades out the overlay over 400ms
- After 700ms total, overlay unmounts and pointer events pass through

---

## 4. Zoom Gesture Tracking

**Problem:** In mouse mode, releasing Cmd mid-scroll would cause trackpad inertia events to suddenly pan instead of zoom, creating an jarring camera jump.

**Solution:** Latch-based gesture tracking in `Canvas.tsx`.

```
Cmd pressed + scroll → wasZooming = true → zoom
Cmd released → wasZooming stays true for 60ms
No wheel events for 60ms → wasZooming resets to false
Next scroll without Cmd → pans normally
```

The 60ms window bridges the gap between rapid inertia events (~16ms apart) but is short enough that releasing Cmd feels immediate.

---

## 5. Canvas Interaction Events

The `canvasInteraction` event system (`canvasInteraction.ts`) is the coordination backbone. It fires on:

- Wheel zoom/pan (every event fires `start`, end is scheduled 180ms after last event)
- Pointer drag pan (fires on pointerdown, ends on pointerup + 120ms)
- Keyboard zoom shortcuts

Consumers:
- **Activation queue** — pauses/resumes node loading
- **BrowserNodeV2** — freezes browser views (shows screenshot) during interaction
- Future consumers can hook in via `onCanvasInteractionStart` / `onCanvasInteractionEnd`

---

## Guidelines for Future Work

### Adding a new heavy node type

1. Gate resource creation on `isActivated` from `useActivationStore`
2. Use `activateNow` in click handlers so user clicks are instant
3. Wrap content in `ActivationFade` for smooth transition
4. If the node has a native view (like BrowserNodeV2), use the overlay fade pattern instead

### Performance rules of thumb

- **Never** do heavy work synchronously during a zoom/pan event
- **Never** create WebContentsViews, spawn processes, or make blocking IPC calls in a batch
- **Always** check if canvas interaction is active before doing deferred heavy work
- **Always** prioritize visible nodes over off-screen ones
- Keep placeholder components lightweight — no subscriptions, no effects, just static SVG

### Testing performance

- Load a workspace with 8+ browser nodes and 4+ terminals
- Zoom in and out rapidly while nodes are still loading — should be smooth
- Click an unactivated node — should activate instantly
- Switch workspaces — returning workspace should use cached nodes (no re-creation)
