# Optimization TODO — Make CanvaFlow Buttery Smooth

Goal: Native-app-level smoothness. 60fps everywhere, zero jank.

---

## CRITICAL — Zoom-Out Lag Investigation

- [ ] **Profile zoom-out vs zoom-in asymmetry**
  - Zoom-out reveals MORE nodes → more DOM elements enter viewport simultaneously
  - `useVisibleNodes.ts` recomputes on every camera change with no frame-skipping
  - As zoom decreases, `pad = CULL_PADDING_SCREEN / zoom` grows huge, inflating the culling rect
  - Measure: how many nodes transition from culled → visible during a single zoom-out step?

- [ ] **Grid redraw explosion on zoom-out**
  - `GridRenderer.tsx:62` — full Pixi.js grid redraw on every camera change
  - Zoom-out = more visible area = exponentially more grid dots rendered
  - `drawGrid` adaptive step may not scale down fast enough at low zoom levels
  - Profile dot count at zoom 1.0 vs 0.3 vs 0.1 vs 0.05

- [ ] **ConnectionLayer recomputes every frame (NO memoization)**
  - `ConnectionLayer.tsx` — iterates all nodes, recomputes SVG paths on every render
  - Zoom-out = more connections visible = heavier SVG recalculation
  - SVG animations (`cf-wire-flow`, `cf-wire-pulse`) compound the cost

- [ ] **Browser webviews / keep-alive nodes never culled**
  - `NodeLayer.tsx:34-36` — Terminal, Browser, browserv2, keepAlive skip culling
  - Zoom-out doesn't reduce render load from these heavy nodes
  - BrowserNodeV2 freeze/unfreeze handoff may be too slow during rapid zoom-out

- [ ] **CSS `scale()` paint cost at low zoom values**
  - `CanvasOverlay.tsx` applies `scale(${camera.zoom})` on a div wrapping ALL nodes
  - At very low zoom, browser must composite a huge world into tiny screen area
  - Check if `will-change: transform` is actually triggering GPU layer promotion
  - Test `transform: translate3d() scale3d()` to force GPU compositing

---

## HIGH PRIORITY — General Lag Sources

- [ ] **Batch multi-node store updates**
  - `BaseNode.tsx:154-163` — multi-drag does separate `storeUpdate(id, ...)` per node
  - Each update triggers Zustand subscribers → multiple React re-renders per frame
  - Solution: add a `batchUpdateNodes(updates: Map<id, partial>)` to nodeStore

- [ ] **Debounce or throttle visible-node computation**
  - `useVisibleNodes.ts` runs on every camera change (~60fps during animations)
  - useMemo prevents re-render but the AABB loop still runs every frame
  - Throttle to every 2-3 frames or use requestIdleCallback

- [ ] **ConnectionLayer memoization**
  - Memoize connection path computation with useMemo keyed on [nodes, camera]
  - Or better: only recompute when node positions/connections actually change
  - Consider moving connection rendering to Canvas/Pixi.js instead of SVG

- [ ] **Reduce React reconciliation during zoom/pan**
  - Camera changes propagate through Zustand to every subscriber
  - Audit which components subscribe to camera state unnecessarily
  - Use selectors to minimize re-renders: `useStore(s => s.zoom)` not `useStore(s => s.camera)`

- [ ] **Profile Pixi.js grid performance**
  - Grid uses individual circle primitives — measure draw call count
  - Consider: instanced rendering, texture atlas dots, or shader-based grid
  - At zoom 0.05, the visible world area is ~20x larger than at zoom 1.0

---

## MEDIUM PRIORITY — Smoothness Improvements

- [ ] **Frame-skip during rapid zoom**
  - During continuous wheel events, skip intermediate renders
  - Use requestAnimationFrame coalescing: accumulate deltas, apply once per frame
  - Currently each wheel event triggers immediate state update + re-render

- [ ] **Lazy-load heavy components**
  - No React.lazy or code splitting currently
  - Monaco editor, xterm.js, and plugin components loaded upfront
  - Lazy-load on first use to reduce initial bundle and memory footprint

- [ ] **Spatial indexing for hit-testing**
  - `Canvas.tsx:58-68` — O(n) loop through all nodes for hit-test
  - Implement quadtree or R-tree for large canvases (100+ nodes)

- [ ] **Optimize browser snapshot handoff timing**
  - `browserSnapshotHandoff.ts` — FSM: live → freezing → frozen
  - Profile the freeze latency: is screenshot capture blocking the main thread?
  - Consider capturing at lower resolution during zoom for speed

- [ ] **Reduce SVG animation overhead**
  - `cf-wire-flow` and `cf-wire-pulse` CSS animations run continuously
  - Pause animations during zoom/pan interactions
  - Resume after `canvasInteractionEnd` fires

- [ ] **Terminal node rendering during zoom**
  - xterm.js canvases inside scaled DOM may trigger expensive repaints
  - Consider hiding terminal canvas and showing static image during zoom
  - Similar to browser freeze approach

---

## LOW PRIORITY — Polish

- [ ] **GPU memory audit**
  - Check layer count in Chrome DevTools → Layers panel
  - Too many GPU layers = memory pressure = compositing lag
  - Ensure only necessary elements have `will-change` or `transform: translateZ(0)`

- [ ] **Event listener cleanup**
  - Verify all `addEventListener` calls have matching `removeEventListener`
  - Check for listener leaks on node mount/unmount cycles

- [ ] **Zustand selector optimization audit**
  - Grep for broad store subscriptions that could be narrowed
  - Each unnecessary subscription = potential unnecessary re-render

- [ ] **Profile with Chrome Performance tab**
  - Record zoom-out from 1.0 → 0.1 with 10+ nodes
  - Identify longest tasks, layout thrashing, forced reflows
  - Check paint and composite times per frame

- [ ] **Test with `React.Profiler` wrapper**
  - Measure which components re-render during zoom
  - Identify unexpected renders from non-memoized props

---

## Key Files to Investigate

| File | Why |
|------|-----|
| `src/renderer/src/stores/cameraStore.ts` | Zoom math, animation loop |
| `src/renderer/src/components/Canvas.tsx` | Wheel handler, hit-testing |
| `src/renderer/src/components/CanvasOverlay.tsx` | CSS transform application |
| `src/renderer/src/components/GridRenderer.tsx` | Pixi.js grid redraws |
| `src/renderer/src/components/NodeLayer.tsx` | Node rendering + memo |
| `src/renderer/src/components/ConnectionLayer.tsx` | SVG connections (no memo!) |
| `src/renderer/src/hooks/useVisibleNodes.ts` | Viewport culling logic |
| `src/renderer/src/components/BaseNode.tsx` | Drag/resize + multi-select |
| `src/renderer/src/utils/browserSnapshotHandoff.ts` | Browser freeze/unfreeze |
| `src/renderer/src/utils/canvasInteraction.ts` | Interaction start/end signals |
