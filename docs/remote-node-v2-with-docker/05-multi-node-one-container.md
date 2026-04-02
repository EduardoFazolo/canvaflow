# 05 — Multiple Nodes, One Container

**Goal:** Connect multiple stream nodes to the same container, each showing a different region or app within the desktop.

**What you can test when done:** One container running a browser and a terminal. Two stream nodes on the canvas — one showing the browser, one showing the terminal. Interact with each independently.

---

## TODO

### 1. Viewport cropping per node
- [ ] noVNC renders the full desktop by default. We need each node to show a different region.
- [ ] Approach A: **CSS clip/scroll** — render the full noVNC canvas but clip to a specific rectangle
  - Each node stores a viewport: `{ x, y, width, height }` within the remote desktop
  - CSS `overflow: hidden` + `transform: translate(-x, -y)` on the noVNC canvas
  - Input coordinates need to be offset by the viewport position
- [ ] Approach B: **Multiple VNC connections** — each node connects separately to the same VNC server
  - x11vnc supports multiple simultaneous clients (`-shared` flag, already set)
  - Each node is an independent VNC client with its own viewport
  - Simpler input handling (noVNC does it), but more connections = more bandwidth

### 2. Window-aware cropping (stretch goal)
- [ ] Install `wmctrl` or `xdotool` in the container
- [ ] Agent endpoint: `GET /x11/windows` — list X11 windows with their positions and sizes
- [ ] When picking "which app to show", fetch the window list and let the user pick
- [ ] Auto-set the viewport crop to that window's bounds
- [ ] Update the crop if the window moves/resizes (poll every few seconds)

### 3. Shared container state
- [ ] Multiple nodes pointing at the same container should share the container lifecycle
- [ ] If one node deletes the container, other nodes show "Container stopped"
- [ ] Container list (milestone 03) shows how many nodes are connected to each container

### 4. Independent input routing
- [ ] With Approach A: offset mouse coordinates by the viewport before sending to VNC
  - Click at (100, 50) in a node with viewport (500, 200) → VNC click at (600, 250)
- [ ] With Approach B: noVNC handles it natively since each connection is independent
- [ ] Keyboard goes to whichever node is focused — only one node should send keyboard at a time

---

## Key Technical Notes

- Approach B (multiple VNC connections) is simpler to implement and more robust. The bandwidth cost is manageable on localhost — VNC only sends changed regions, so if two clients are looking at different parts of the screen, each only receives updates for their region.
- x11vnc with `-shared` allows unlimited simultaneous clients. No config change needed from milestone 01.
- For window-aware cropping, `xdotool getactivewindow getwindowgeometry` gives position and size. `wmctrl -l -G` lists all windows with geometry. Both are lightweight.
- The remote desktop resolution should be large enough to tile multiple apps. Default 1920x1080 is fine for 2-3 apps side by side. For more, bump to 2560x1440 or 3840x2160.

## Done When
- Two stream nodes on the canvas connected to the same container. One shows the top-left quadrant (browser), the other shows the bottom half (terminal). You can interact with each independently. Clicking in one node doesn't affect the other.
