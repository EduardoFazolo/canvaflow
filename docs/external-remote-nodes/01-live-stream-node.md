# 01 — Live Stream Node (MVP)

**Goal:** Pick a window and see it update live inside a canvas node, instead of a static screenshot.

**What you can test when done:** Select a window (e.g. your browser), see it update in real-time on the canvas as you interact with the real window outside CanvaFlow.

---

## TODO

### 0. Create the new plugin as a copy of WindowPickerNode
- [ ] Copy `src/plugins/windowpicker/` to `src/plugins/remotestream/`
- [ ] Rename the node type to `RemoteStreamNode` (component, registration, etc.)
- [ ] Register it as a separate node type in the plugin system
- [ ] Verify it works identically to WindowPickerNode before changing anything
- [ ] From here on, ALL changes happen in `remotestream/` — never touch `windowpicker/`

### 1. Replace static screenshot with a continuous capture loop
- [ ] In the new RemoteStreamNode, after a window is selected, start a capture interval
- [ ] Use `desktopCapturer.getSources()` in a loop (the copied code already has this for single captures)
- [ ] Start with a simple setInterval at ~10fps (100ms) — capture thumbnail, push to renderer
- [ ] Display the updating frames in the node's `<img>` tag (swap src each frame)
- [ ] This is intentionally dumb and inefficient — it's the "does this even feel right?" test

### 2. Upgrade to MediaStream-based capture
- [ ] Switch from repeated `desktopCapturer.getSources()` to `desktopCapturer.getSources()` + `navigator.mediaDevices.getUserMedia()` with the `chromeMediaSourceId`
- [ ] This gives you a proper `MediaStream` — hardware-accelerated, no polling
- [ ] Render stream into a `<video>` element instead of swapping `<img>` tags
- [ ] Set video element attributes: `autoplay`, `muted`, `playsInline`
- [ ] The node should now show smooth, real-time video of the target window

### 3. Handle stream lifecycle
- [ ] Stop the MediaStream when the node is deleted or the window picker is reset
- [ ] Stop the stream when the source window is closed (listen for stream `ended` event)
- [ ] Show a "Window closed" state in the node when stream ends
- [ ] Restart stream if user clicks "refresh" or picks the same window again

### 4. Size the node to match the window aspect ratio
- [ ] Read the video's native resolution from the MediaStream track settings
- [ ] Set the node dimensions to maintain aspect ratio (don't stretch/squish)
- [ ] Allow user to resize the node — video scales to fit

---

## Key Technical Notes

- This is a **new node type** (`RemoteStreamNode`) copied from `WindowPickerNode`. The original is untouched.
- `desktopCapturer` is Electron-only (main process). The `chromeMediaSourceId` it returns can be used in the renderer's `getUserMedia` call.
- On macOS, Screen Recording permission is already required (same as WindowPickerNode) — no new permissions needed.
- The `<video>` element is much cheaper than swapping images. The GPU handles the decode and compositing.
- Don't worry about frame rate control yet — that's milestone 04.

## Done When
- You can pick any window on your Mac and see it streaming live inside a RemoteStreamNode at a smooth frame rate. The original WindowPickerNode still works exactly as before.
