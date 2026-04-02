# 04 — Adaptive Quality (Zoom-Aware)

**Goal:** Streams automatically adjust resolution and FPS based on how big they appear on screen. Zoomed-out nodes get potato quality. Zoomed-in focused node gets full quality.

**What you can test when done:** Zoom all the way out on a canvas with 15 stream nodes. They should all be rendering at tiny resolution and low FPS. Zoom into one — it should ramp up to full quality within a second.

---

## TODO

### 1. Calculate apparent size of each stream node
- [ ] On each render/zoom/pan, calculate each stream node's pixel size on screen
- [ ] `apparentWidth = nodeWidth * currentZoomLevel`
- [ ] This tells you how many physical pixels the node occupies on the user's display
- [ ] Expose this as a value the stream node can read (via ReactFlow's viewport or a custom hook)

### 2. Define quality tiers
- [ ] **Full** (apparent width > 600px): native resolution, 30fps
- [ ] **Medium** (apparent width 200-600px): 720p max, 20fps
- [ ] **Low** (apparent width 50-200px): 480p, 10fps
- [ ] **Thumbnail** (apparent width < 50px): 240p, 5fps
- [ ] **Off-screen**: freeze entirely (same as idle detection from milestone 03)

### 3. Apply resolution scaling
- [ ] Use MediaStream track constraints to change resolution: `track.applyConstraints({ width, height })`
- [ ] If `applyConstraints` doesn't work well with desktopCapturer, scale via CSS on the video element (GPU handles the downscale for free)
- [ ] For the capture side: if using repeated captures (fallback path), request smaller thumbnails at lower tiers

### 4. Apply FPS throttling
- [ ] At lower tiers, you don't need every frame from the MediaStream
- [ ] Option A: Use `requestVideoFrameCallback` and skip frames based on a target interval
- [ ] Option B: Pause/resume the video element on a timer (crude but effective)
- [ ] Option C: If re-capturing at intervals, just adjust the interval duration

### 5. Smooth tier transitions
- [ ] Don't thrash between tiers on small zoom changes — add hysteresis
- [ ] When zooming in: upgrade quality immediately (user wants to see it)
- [ ] When zooming out: downgrade after a short delay (~500ms) to avoid flicker during scroll
- [ ] Transition between resolutions using a brief crossfade or just let the video element handle it

### 6. Viewport culling
- [ ] Nodes completely outside the visible viewport should have their streams fully paused
- [ ] Use ReactFlow's `onViewportChange` or intersection observer to detect visibility
- [ ] This stacks with idle detection — an off-screen idle node costs literally zero

---

## Key Technical Notes

- CSS scaling is the cheapest approach: keep the capture at native res but let the browser downsample via the video element's rendered size. The GPU does this for free. The downside is you're still decoding full-res frames.
- True resolution reduction at the capture level saves decode cost but is harder to implement with desktopCapturer. Worth it only if you're hitting decode bottlenecks with many active streams.
- The big win here is viewport culling + zoom-based FPS reduction combined. At 20% zoom with 30 nodes visible, if each is running at 5fps 240p, total decode budget is tiny.
- Test with Activity Monitor open — you should see CPU usage drop noticeably as you zoom out.

## Done When
- Zooming out on 15+ active stream nodes keeps CPU usage reasonable. Zooming into any single node makes it crisp and smooth. Performance scales linearly with visible-and-zoomed-in node count, not total node count.
