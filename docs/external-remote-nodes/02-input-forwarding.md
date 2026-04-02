# 02 — Input Forwarding

**Goal:** Click and type inside the streaming node and have it control the actual window.

**What you can test when done:** Click a link in a streamed browser node and see the browser navigate. Type in a streamed text editor and see characters appear.

---

## TODO

### 1. Coordinate mapping
- [ ] When user clicks inside the `<video>` element, capture the click position relative to the video
- [ ] Map from video-element coordinates to the actual window's pixel coordinates
- [ ] Account for: video scaling (node size vs actual window size), aspect ratio, any letterboxing
- [ ] Formula: `realX = (clickX / videoWidth) * windowWidth`, same for Y

### 2. Mouse event injection (macOS)
- [ ] Create a new Swift helper (or extend the existing one) that injects mouse events via CGEvent
- [ ] Support: `mouseDown`, `mouseUp`, `mouseMove`, `rightClick`, `doubleClick`, `scroll`
- [ ] CGEvent API: `CGEvent(mouseEventSource:, mouseType:, mouseCursorPosition:, mouseButton:)`
- [ ] Post events with `CGEvent.post(tap: .cghidEventTap)`
- [ ] Wire up: renderer captures mouse event -> IPC to main -> main calls Swift helper with coordinates
- [ ] **Important:** Before injecting the click, bring the target window to front (you already have this via AppleScript)

### 3. Keyboard event injection (macOS)
- [ ] Capture `keydown`/`keyup` events when the streaming node is focused
- [ ] Map JS `event.keyCode`/`event.key` to macOS virtual key codes (CGKeyCode)
- [ ] Inject via `CGEvent(keyboardEventSource:, virtualKey:, keyDown:)`
- [ ] Handle modifier keys (shift, cmd, alt, ctrl) — set flags on the CGEvent
- [ ] Handle special keys: enter, tab, backspace, arrow keys, escape

### 4. Focus management on the canvas
- [ ] When user clicks a streaming node, it should "capture" keyboard input
- [ ] Other canvas shortcuts (delete node, zoom, etc.) should be suppressed while a stream node is focused
- [ ] Click outside the stream node (or press Escape) to release capture
- [ ] Visual indicator that the node is in "interactive mode" (border highlight, cursor change)

### 5. Scroll forwarding
- [ ] Capture wheel events on the `<video>` element
- [ ] Map scroll delta and inject via CGEvent scroll wheel events
- [ ] Respect the BaseNode scroll handling (it already manages wheel events for focused nodes)

---

## Key Technical Notes

- All input forwarding logic lives in `remotestream/`, not in `windowpicker/`. The original WindowPickerNode is never modified.
- CGEvent injection requires **Accessibility permission** (System Settings > Privacy > Accessibility). WindowPickerNode only needs Screen Recording. This is a new permission the RemoteStreamNode will need.
- Prompt the user for Accessibility permission on first input attempt, not on node creation.
- There will be a slight visual delay: you click -> event injected -> app processes it -> screen updates -> stream captures new frame -> displayed. At 30fps local capture this is ~30-60ms. Feels fine for most apps, slightly laggy for gaming.
- Consider debouncing `mouseMove` events — sending every pixel of mouse movement is wasteful. Send on click, drag, and throttled hover.

## Done When
- You can browse the web inside a streamed browser node entirely from the canvas — clicking links, typing in search bars, scrolling pages.
