import { BrowserWindow, ipcMain } from 'electron'

let overlayWindow: BrowserWindow | null = null

// Circumference for dwell ring r=18: 2π×18 ≈ 113.1
const DWELL_C = (2 * Math.PI * 18).toFixed(2)

/** Inline HTML for the cursor overlay — no separate file or preload needed. */
const CURSOR_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: transparent; overflow: hidden; width: 100vw; height: 100vh; }
  #cursor {
    position: fixed; top: 0; left: 0;
    width: 44px; height: 44px;
    pointer-events: none;
    opacity: 0;
    will-change: transform, opacity;
  }
  #ring {
    position: absolute; top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    width: 20px; height: 20px;
    border-radius: 50%;
    border: 2px solid #a78bfa;
    box-sizing: border-box;
    transition: width .12s ease, height .12s ease, border-color .12s, box-shadow .12s, opacity .12s;
  }
  #dot {
    position: absolute; top: 50%; left: 50%;
    transform: translate(-50%, -50%) scale(1);
    width: 5px; height: 5px;
    border-radius: 50%;
    background: #a78bfa;
    transition: transform .12s ease, background .12s;
  }
</style>
</head>
<body>
<div id="cursor">
  <svg width="44" height="44" style="position:absolute;top:0;left:0;overflow:visible">
    <circle id="dwell"
      cx="22" cy="22" r="18"
      fill="none" stroke="#fff" stroke-width="2.5"
      stroke-dasharray="${DWELL_C}" stroke-dashoffset="${DWELL_C}"
      stroke-linecap="round" transform="rotate(-90 22 22)"
      style="opacity:0;transition:stroke .15s"
    />
  </svg>
  <div id="ring"></div>
  <div id="dot"></div>
</div>
<script>
const { ipcRenderer } = require('electron')
const SIZE = 44
const DWELL_C = ${DWELL_C}
const cursor = document.getElementById('cursor')
const ring   = document.getElementById('ring')
const dot    = document.getElementById('dot')
const dwell  = document.getElementById('dwell')

ipcRenderer.on('maestro:cursor-update', (_e, d) => {
  if (!d.visible) { cursor.style.opacity = '0'; return }

  cursor.style.transform = 'translate(' + (d.x - SIZE/2) + 'px,' + (d.y - SIZE/2) + 'px)'
  cursor.style.opacity = '1'

  let base, color
  if      (d.mode === 'panning') { base = 28; color = '#60a5fa' }
  else if (d.mode === 'zooming') { base = 24; color = '#34d399' }
  else if (d.mode === 'prayer')  { base = 22; color = '#fbbf24' }
  else                           { base = 18; color = '#a78bfa' }

  const sz = 18 + (base - 18) * d.ramp
  ring.style.width  = sz + 'px'
  ring.style.height = sz + 'px'
  ring.style.borderColor = d.hovering ? '#fff' : color
  ring.style.boxShadow   = d.hovering
    ? '0 0 10px ' + color + ', 0 0 20px ' + color + '40'
    : '0 0 6px '  + color + Math.round(d.ramp * 0x99).toString(16).padStart(2,'0')
  ring.style.opacity = String(0.35 + d.ramp * 0.65)

  dot.style.background = color
  dot.style.transform  = 'translate(-50%,-50%) scale(' + (d.mode === 'zooming' ? 1.8 : 1) + ')'

  if (d.dwellProgress > 0) {
    dwell.style.opacity = '1'
    dwell.style.strokeDashoffset = String(DWELL_C * (1 - d.dwellProgress))
    dwell.style.stroke = d.dwellProgress > 0.85 ? '#fff' : color
  } else {
    dwell.style.opacity = '0'
    dwell.style.strokeDashoffset = String(DWELL_C)
  }
})
</script>
</body>
</html>`

export function createCursorOverlay(parent: BrowserWindow): void {
  const [x, y] = parent.getPosition()
  const [w, h] = parent.getSize()

  overlayWindow = new BrowserWindow({
    x, y, width: w, height: h,
    transparent:  true,
    frame:        false,
    skipTaskbar:  true,
    alwaysOnTop:  true,
    focusable:    false,
    hasShadow:    false,
    show:         false,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration:  true,
      sandbox:          false,
    },
  })

  overlayWindow.setIgnoreMouseEvents(true, { forward: true })
  overlayWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(CURSOR_HTML)}`)
  overlayWindow.once('ready-to-show', () => overlayWindow?.show())

  const syncBounds = (): void => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return
    const [px, py] = parent.getPosition()
    const [pw, ph] = parent.getSize()
    overlayWindow.setPosition(px, py)
    overlayWindow.setSize(pw, ph)
  }

  parent.on('moved',   syncBounds)
  parent.on('resized', syncBounds)
  parent.on('closed',  () => { if (!overlayWindow?.isDestroyed()) overlayWindow?.close() })
}

export function setupCursorOverlayHandlers(): void {
  ipcMain.on('maestro:cursor-update', (_e, data) => {
    if (!overlayWindow?.isDestroyed()) {
      overlayWindow?.webContents.send('maestro:cursor-update', data)
    }
  })
}
