import { ipcRenderer } from 'electron'

// Double-tap detection — mirrors canvasWebview.ts pattern
// Pinch / trackpad-zoom forwarding
document.addEventListener(
  'wheel',
  (e) => {
    if (!e.ctrlKey) return
    e.preventDefault()
    ipcRenderer.send('canvas:wheel', {
      deltaY: e.deltaY,
      clientX: e.clientX,
      clientY: e.clientY,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    })
  },
  { passive: false },
)
