# 05 — Multi-Stream Resource Budgeting

**Goal:** Intelligently manage resources when many streams are active at once. The system should never let itself choke — it should gracefully degrade.

**What you can test when done:** Open 30+ stream nodes. The system stays responsive. Open Activity Monitor and see CPU stay under control. No frame drops on your focused node even if 30 others exist.

---

## TODO

### 1. Global stream manager
- [ ] Create a `StreamManager` singleton that tracks all active stream nodes
- [ ] Each stream node registers/unregisters with the manager on mount/unmount
- [ ] Manager knows each stream's state: active, idle/frozen, off-screen, quality tier
- [ ] Manager exposes: total active streams, total decode budget used, per-stream stats

### 2. Resource budget system
- [ ] Define a global budget: max simultaneous active (decoding) streams
- [ ] Default budget: 6-8 active streams (tune based on testing)
- [ ] When a new stream wants to activate and budget is full:
  - Downgrade the least-recently-interacted active stream (lower its tier or freeze it)
  - Or: the new stream gets a lower tier than it otherwise would
- [ ] Priority order: focused node > recently clicked > visible > off-screen

### 3. Priority queue
- [ ] Each stream node gets a priority score based on:
  - Is user currently interacting with it? (+100)
  - Was it recently interacted with? (+50, decays over 30 seconds)
  - Is it visible on screen? (+20)
  - How large is it on screen? (+0 to +20 based on apparent size)
- [ ] StreamManager sorts by priority each time budget needs rebalancing
- [ ] Highest priority nodes get the best quality tiers, lowest get frozen

### 4. Memory management
- [ ] Track memory usage: frozen screenshots + active video buffers
- [ ] If memory pressure is detected (you can check `performance.memory` in Chromium):
  - Compress frozen screenshots more aggressively (lower JPEG quality)
  - Drop off-screen frozen screenshots entirely (re-capture when scrolled into view)
- [ ] Set a max memory budget for stream data (e.g. 500MB)

### 5. Performance monitoring overlay (dev tool)
- [ ] Add a debug overlay (toggle with a shortcut) showing:
  - Number of active / frozen / off-screen streams
  - Total estimated decode CPU usage
  - Per-stream FPS and resolution
  - Memory usage for stream data
- [ ] This is invaluable for tuning and debugging — keep it as a dev tool

---

## Key Technical Notes

- The StreamManager should be reactive — when zoom changes, when a node is clicked, when a stream goes idle, it recalculates and rebalances. But debounce the rebalancing (100-200ms) to avoid thrashing.
- The budget system is the safety net. Milestones 03 and 04 handle the common case (idle detection + zoom scaling). This milestone handles the edge case: "user opened 30 nodes and they're ALL active and visible."
- Don't over-engineer this. Start with a simple "max 8 active, freeze the rest by LRU" and see if that's enough. The priority queue is a refinement.
- `performance.memory` is Chrome/Electron only and behind a flag. It's fine for a dev tool, don't rely on it for production logic.

## Done When
- The system self-regulates. No matter how many stream nodes the user creates, the app stays responsive. The user's focused stream is always smooth. Background streams gracefully degrade without user intervention.
