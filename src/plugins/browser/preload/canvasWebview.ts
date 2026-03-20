import { ipcRenderer } from 'electron'

// nodeId is injected via additionalArguments by the main process
const nodeId = process.argv.find((a) => a.startsWith('--canvaflow-node-id='))?.split('=')[1] ?? ''

// Detect double-tap anywhere in the webview and signal the host canvas to zoom-fit this node.
let lastTapTime = 0
document.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return
  const now = Date.now()
  if (now - lastTapTime < 350) {
    lastTapTime = 0
    if (e.metaKey && e.shiftKey) {
      ipcRenderer.send('browser:canvas-event', nodeId, 'canvas:zoom-exit', {})
    } else {
      ipcRenderer.send('browser:canvas-event', nodeId, 'canvas:double-tap', {})
    }
  } else {
    lastTapTime = now
  }
}, { capture: true })

// Pinch gestures on macOS trackpads arrive as wheel events with ctrlKey=true.
// Forward them to the host canvas so zoom always affects the canvas, not the page.
document.addEventListener('wheel', (e) => {
  if (!e.ctrlKey) return
  e.preventDefault()
  e.stopPropagation()
  ipcRenderer.send('browser:canvas-event', nodeId, 'canvas:wheel', {
    deltaY: e.deltaY,
    clientX: e.clientX,
    clientY: e.clientY,
    viewportWidth: document.documentElement.clientWidth,
    viewportHeight: document.documentElement.clientHeight,
  })
}, { passive: false, capture: true })
