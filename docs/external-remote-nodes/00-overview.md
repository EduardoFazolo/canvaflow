# External Remote Nodes — Implementation Plan

Turn any window/process into a live, interactive streaming node on the canvas.

**This is a NEW node type** — `RemoteStreamNode` — created as a copy of the existing WindowPickerNode plugin (`src/plugins/windowpicker/`). The original WindowPickerNode stays untouched. Copy its structure (renderer, main handlers, plugin entry) into a new `src/plugins/remotestream/` plugin and evolve from there.

## Milestone Order

1. **[01-live-stream-node.md](01-live-stream-node.md)** — MVP: live video stream of a picked window inside a node
2. **[02-input-forwarding.md](02-input-forwarding.md)** — Mouse and keyboard input routed back to the streamed window
3. **[03-idle-detection.md](03-idle-detection.md)** — Freeze to screenshot when nothing changes, wake on change
4. **[04-adaptive-quality.md](04-adaptive-quality.md)** — Resolution/FPS scales with zoom level and visibility
5. **[05-multi-stream.md](05-multi-stream.md)** — Run many streams at once, resource budgeting
6. **[06-remote-machines.md](06-remote-machines.md)** — Stream from other machines over the network, not just localhost

Each milestone is testable on its own. Don't start the next until the current one feels solid.
