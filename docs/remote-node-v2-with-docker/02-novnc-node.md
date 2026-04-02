# 02 — noVNC Embedded in Stream Node

**Goal:** The RemoteStreamNode connects to a running container's VNC and lets you fully interact with it from the canvas.

**What you can test when done:** Create a Remote Stream node, point it at a running container, see the Linux desktop live, click and type and it all works — without leaving CanvaFlow.

---

## TODO

### 1. Add noVNC as a dependency
- [ ] `bun add @novnc/novnc` OR vendor the noVNC JS library into the project
- [ ] noVNC's core is just a few JS files — the key one is `RFB` (the VNC client class)
- [ ] Import `RFB` from `@novnc/novnc/core/rfb` in the renderer

### 2. Replace the current stream rendering with noVNC
- [ ] In the stream phase of RemoteStreamNode, instead of an `<img>` with JPEG frames:
  - Create a container `<div>` for noVNC to render into
  - Instantiate `new RFB(container, wsUrl)` where `wsUrl` is `ws://host:6080/websockify`
  - noVNC creates its own `<canvas>` element inside the container
- [ ] noVNC handles EVERYTHING: frame rendering, mouse capture, keyboard capture, clipboard
- [ ] Remove all custom frame streaming code (WebSocket JPEG, imgRef, frameUrlRef)
- [ ] Remove all custom input injection code (KEY_MAP, handleMouseDown, handleKeyDown, etc.)

### 3. Update the connect flow
- [ ] "Connect to Agent" phase becomes "Connect to Container"
- [ ] User enters `hostname:6080` (the websockify port)
- [ ] Health check: try to connect via WebSocket to verify it's reachable
- [ ] On success, store the URL and move to stream phase
- [ ] No window picker needed — the entire container desktop is one "window"

### 4. Handle noVNC lifecycle
- [ ] On mount: create RFB connection
- [ ] On unmount: disconnect cleanly (`rfb.disconnect()`)
- [ ] On connection lost: show reconnecting state, auto-retry after 2 seconds
- [ ] On resize: call `rfb.scaleViewport = true` so it fits the node
- [ ] `rfb.resizeSession = true` to resize the remote display to match the node size (optional)

### 5. Interactive mode (simplified)
- [ ] noVNC captures input by default when focused — no custom interactive toggle needed
- [ ] When the node is focused (clicked), noVNC gets keyboard/mouse
- [ ] When the node loses focus, noVNC releases input
- [ ] This is built into noVNC — just wire up focus/blur events
- [ ] Consider: `rfb.focusOnClick = true` (default behavior)

### 6. Styling
- [ ] noVNC's canvas should fill the node's content area
- [ ] Dark background behind the canvas for letterboxing
- [ ] Bottom bar: show connection status (connected/disconnected), container address
- [ ] Green dot when connected, red when disconnected

---

## Key Technical Notes

- noVNC's `RFB` class is the entire VNC client. It handles encoding negotiation, frame updates, mouse events, keyboard events, clipboard sync. We don't need to implement any of that.
- The WebSocket URL format: `ws://hostname:6080/websockify` (websockify's default path).
- `rfb.scaleViewport = true` makes noVNC scale the remote display to fit the container. This is what you want on a canvas where nodes can be any size.
- `rfb.viewOnly = false` (default) enables input. Set to `true` if you just want to watch.
- noVNC supports clipboard sharing: `rfb.clipboardPasteFrom(text)` and `rfb.addEventListener('clipboard', ...)`.
- The noVNC canvas respects the container's size. When the node is resized, the canvas auto-scales.

## Done When
- Create a Remote Stream node, enter a container's address, see the Linux desktop streaming live inside the node on the canvas. Click buttons, type in terminals, drag windows — all from within CanvaFlow. No lag, no cursor sync issues, input works perfectly.
