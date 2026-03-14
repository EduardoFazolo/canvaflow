# CanvasFlow Mac

Mac-native spatial terminal canvas built with Swift and AppKit.

## What works

- Infinite-feeling canvas with a dark native desktop aesthetic
- Trackpad-friendly panning and pinch zoom
- Right-click context menu to create terminal tiles
- Draggable terminal tiles with focus handling
- Real embedded terminal emulation via SwiftTerm inside each tile
- Local shell sessions running in native AppKit terminal views

## Run

```bash
swift run
```

You can also open the package directly in Xcode and run the `CanvasFlowMac` executable target.

## Controls

- Right click: create or close a terminal tile
- Drag empty space: pan the canvas
- Pinch: zoom
- Option + scroll: zoom fallback
- Click a tile: focus it
- Drag a tile header: move it
- Type while focused: send input to the shell

## Notes

The canvas shell is custom AppKit, while each terminal tile is powered by SwiftTerm's `LocalProcessTerminalView`. That gives us much better terminal fidelity now, while still leaving room for future work like resize handles, persistence, tabs, split layouts, and Metal-backed canvas rendering.
