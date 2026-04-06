import { ipcRenderer } from 'electron'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let cmdHeld = false
let dragActive = false
let overlayEl: HTMLDivElement | null = null

// ---------------------------------------------------------------------------
// Card ID extraction from Trello card URLs: /c/<shortLink>[/<slug>]
// ---------------------------------------------------------------------------

function extractCardId(href: string): string | null {
  const match = href.match(/\/c\/([^/?#\s]+)/)
  if (!match) return null
  // Exclude non-card paths like /c/ with no shortlink
  const candidate = match[1]
  return candidate.length >= 4 ? candidate : null
}

function extractTitle(el: Element): string {
  const card = el.closest('a[href*="/c/"]') ?? el
  const text = (card as HTMLElement).innerText ?? ''
  return text.split('\n')[0].trim() || 'Untitled'
}

// ---------------------------------------------------------------------------
// Overlay — shown inside Trello webview when Cmd is held
// ---------------------------------------------------------------------------

;(window as any).__canvaflow_setMode = (enabled: boolean): void => {
  if (enabled && !cmdHeld) {
    cmdHeld = true
    showOverlay()
  } else if (!enabled && !dragActive) {
    cmdHeld = false
    hideOverlay()
  }
}

// Called by the host renderer after a drop completes outside the webview,
// so we can clear dragActive and hide the overlay.
;(window as any).__canvaflow_cancelDrag = (): void => {
  dragActive = false
  hideOverlay()
}

function showOverlay(): void {
  if (overlayEl) return
  overlayEl = document.createElement('div')
  overlayEl.id = '__canvaflow_drag_overlay__'
  overlayEl.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    pointer-events: none;
    background: rgba(0, 121, 191, 0.06);
    outline: 2px solid rgba(0, 121, 191, 0.3);
    outline-offset: -2px;
    box-sizing: border-box;
  `

  const badge = document.createElement('div')
  badge.style.cssText = `
    position: absolute;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 82, 204, 0.92);
    color: #fff;
    padding: 5px 16px;
    border-radius: 20px;
    font-size: 12px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-weight: 600;
    letter-spacing: 0.01em;
    white-space: nowrap;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    pointer-events: none;
    user-select: none;
  `
  badge.textContent = '⌘  Canvas drag mode — drag a card to the canvas'
  overlayEl.appendChild(badge)

  const style = document.createElement('style')
  style.id = '__canvaflow_drag_style__'
  style.textContent = `
    a[href*="/c/"]:hover {
      outline: 2px solid rgba(0, 121, 191, 0.7) !important;
      outline-offset: 2px !important;
      border-radius: 4px !important;
      cursor: grab !important;
    }
  `
  document.head.appendChild(style)
  document.body.appendChild(overlayEl)
}

function hideOverlay(): void {
  overlayEl?.remove()
  overlayEl = null
  document.getElementById('__canvaflow_drag_style__')?.remove()
}

// ---------------------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------------------

document.addEventListener('keydown', (e) => {
  if (e.key === 'Meta' && !cmdHeld) {
    cmdHeld = true
    showOverlay()
  }
  if (e.key === 'Escape') {
    if (dragActive) {
      dragActive = false
      ipcRenderer.sendToHost('trello:drag-cancel', {})
    }
    cmdHeld = false
    hideOverlay()
  }
}, true)

document.addEventListener('keyup', (e) => {
  if (e.key === 'Meta') {
    cmdHeld = false
    if (!dragActive) hideOverlay()
  }
}, true)

window.addEventListener('blur', () => {
  cmdHeld = false
  if (!dragActive) hideOverlay()
})

// ---------------------------------------------------------------------------
// Drag
// ---------------------------------------------------------------------------

document.addEventListener('pointerdown', (e) => {
  if (!cmdHeld || e.button !== 0) return

  let link = (e.target as Element).closest('a[href*="/c/"]') as HTMLAnchorElement | null
  if (!link) return

  const href = link.getAttribute('href') ?? ''
  const cardId = extractCardId(href)
  if (!cardId) return

  e.preventDefault()
  e.stopImmediatePropagation()

  dragActive = true

  const cardEl = link
  const r = cardEl.getBoundingClientRect()

  ipcRenderer.sendToHost('trello:drag-start', {
    cardId,
    title: extractTitle(link),
    x: e.clientX,
    y: e.clientY,
    viewportWidth: document.documentElement.clientWidth,
    viewportHeight: document.documentElement.clientHeight,
    cardRect: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
  })
}, true)

document.addEventListener('mousedown', (e) => {
  if (cmdHeld && e.button === 0) {
    const link = (e.target as Element).closest('a[href*="/c/"]')
    if (link) {
      e.preventDefault()
      e.stopImmediatePropagation()
    }
  }
}, true)

document.addEventListener('dragstart', (e) => {
  if (cmdHeld) {
    e.preventDefault()
    e.stopImmediatePropagation()
  }
}, true)

document.addEventListener('pointermove', (e) => {
  if (!dragActive) return
  e.stopImmediatePropagation()
  ipcRenderer.sendToHost('trello:drag-move', { x: e.clientX, y: e.clientY })
}, true)

document.addEventListener('pointerup', (e) => {
  if (!dragActive) return
  e.stopImmediatePropagation()
  dragActive = false
  if (!cmdHeld) hideOverlay()
  ipcRenderer.sendToHost('trello:drag-end', { x: e.clientX, y: e.clientY })
}, true)

// ---------------------------------------------------------------------------
// Wheel → canvas zoom
// Pinch gestures on Mac trackpad arrive as wheel events with ctrlKey=true.
// Intercept them here so Trello doesn't zoom its own page, and forward to
// the host renderer so the canvas zoom handler can act on them instead.
// Regular two-finger scroll (ctrlKey=false) is left alone so Trello scrolls normally.
// ---------------------------------------------------------------------------

document.addEventListener('wheel', (e) => {
  if (!e.ctrlKey) return
  e.preventDefault()
  e.stopPropagation()
  ipcRenderer.sendToHost('canvas:wheel', {
    deltaY: e.deltaY,
    clientX: e.clientX,
    clientY: e.clientY,
    viewportWidth: document.documentElement.clientWidth,
    viewportHeight: document.documentElement.clientHeight,
  })
}, { passive: false, capture: true })
