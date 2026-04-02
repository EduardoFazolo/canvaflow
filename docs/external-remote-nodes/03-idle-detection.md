# 03 — Idle Detection (Freeze & Wake)

**Goal:** Stop wasting resources on windows that aren't changing. Freeze to a screenshot when idle, wake instantly when something changes.

**What you can test when done:** Open 10+ stream nodes. The ones you're not using should show 0% CPU usage. The moment something changes in one of them (a notification, a build finishing), it wakes up and streams again.

---

## TODO

### 1. Frame diffing to detect idle
- [ ] Every N frames (e.g. every 1 second), compare the current frame to the previous one
- [ ] Use an offscreen `<canvas>` to draw the video frame and call `getImageData()`
- [ ] Don't compare every pixel — sample a grid (e.g. 20x20 points across the image)
- [ ] If sampled pixels are identical (within a small threshold for compression artifacts), mark as "idle"
- [ ] After X consecutive idle checks (e.g. 3 seconds of no change), freeze the stream

### 2. Freeze behavior
- [ ] When idle detected: capture one last high-quality frame as a screenshot
- [ ] Pause the `<video>` element (`video.pause()`)
- [ ] Optionally stop the MediaStream tracks entirely to free the capture pipeline
- [ ] Display the frozen screenshot in an `<img>` tag (swap video for image)
- [ ] Show a subtle visual indicator that the stream is frozen (e.g. small "paused" badge, slightly dimmed)

### 3. Wake detection
- [ ] Even while "frozen", keep a low-frequency check running (~1fps or even 0.5fps)
- [ ] Use a lightweight capture method for the check — small thumbnail (160x120) is enough
- [ ] Compare against the frozen screenshot's sampled pixels
- [ ] If change detected: immediately resume the full MediaStream
- [ ] Swap back from `<img>` to `<video>`, remove frozen indicator
- [ ] The frozen screenshot stays visible during the ~100ms it takes to resume — no flicker

### 4. Manual wake/freeze
- [ ] Add a play/pause toggle button on the node toolbar
- [ ] Clicking inside the node (for input forwarding) should auto-wake the stream
- [ ] User hovering over a frozen node could optionally trigger a wake (nice-to-have)

### 5. Tune thresholds
- [ ] Make idle timeout configurable (default: 3 seconds of no change)
- [ ] Make pixel diff threshold configurable (some apps have subtle animations like cursor blinks — you may want to ignore those)
- [ ] Terminal cursor blinks should NOT keep a stream awake — set threshold high enough to ignore single-point changes

---

## Key Technical Notes

- The 1fps idle-check while frozen is the most important optimization. A paused MediaStream + a single low-res capture per second is almost zero CPU.
- `getImageData()` on a canvas is synchronous and blocks the main thread. For the idle check, do it on sampled points only (400 pixels instead of 2M pixels). Or use an OffscreenCanvas in a Web Worker if it becomes a bottleneck.
- When many nodes are frozen, memory is the cost: one JPEG screenshot per frozen node. At 1080p JPEG quality 80, that's ~200-400KB each. 50 frozen nodes = ~20MB. Trivial.
- The wake latency (time from actual window change to stream resuming) will be 1-2 seconds due to the low-frequency check. This is fine — the user isn't looking at it anyway. If they are, they'll click it and it wakes instantly.

## Done When
- 10+ stream nodes open, only the ones with active content are actually using CPU. Frozen nodes show a static screenshot. Any change (notification, build output, message received) wakes the stream within 1-2 seconds.
