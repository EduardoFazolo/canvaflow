import { ipcRenderer } from 'electron'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let cmdHeld = false
let dragActive = false
let overlayEl: HTMLDivElement | null = null

// ---------------------------------------------------------------------------
// Page ID extraction
// ---------------------------------------------------------------------------

function extractPageId(href: string): string | null {
  const lastSegment = href.split('/').pop()?.split('?')[0] ?? ''
  const hexMatch = lastSegment.match(/([0-9a-f]{32})$/i)
  if (hexMatch) return hexMatch[1]
  const uuidMatch = href.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
  if (uuidMatch) return uuidMatch[1].replace(/-/g, '')
  return null
}

function extractTitle(el: Element): string {
  const card = el.closest('[data-block-id]') ?? el.closest('a') ?? el
  const text = (card as HTMLElement).innerText ?? ''
  return text.split('\n')[0].trim() || 'Untitled'
}

// ---------------------------------------------------------------------------
// Overlay — shown inside the Notion webview when Cmd is held
// ---------------------------------------------------------------------------

// Exposed so the host renderer can toggle the mode via executeJavaScript
// (used when the webview doesn't yet have keyboard focus)
;(window as any).__canvaflow_setMode = (enabled: boolean): void => {
  if (enabled && !cmdHeld) {
    cmdHeld = true
    showOverlay()
  } else if (!enabled && !dragActive) {
    cmdHeld = false
    hideOverlay()
  }
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
    background: rgba(167, 139, 250, 0.07);
    outline: 2px solid rgba(167, 139, 250, 0.35);
    outline-offset: -2px;
    box-sizing: border-box;
  `

  const badge = document.createElement('div')
  badge.style.cssText = `
    position: absolute;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(124, 58, 237, 0.92);
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

  // Highlight Notion board cards on hover while overlay is active
  const style = document.createElement('style')
  style.id = '__canvaflow_drag_style__'
  style.textContent = `
    a[href*="notion.so"]:hover,
    [data-block-id] a[href]:hover {
      outline: 2px solid rgba(167, 139, 250, 0.7) !important;
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
// Keyboard — Cmd key shows/hides the overlay
// ---------------------------------------------------------------------------

document.addEventListener('keydown', (e) => {
  if (e.key === 'Meta' && !cmdHeld) {
    cmdHeld = true
    showOverlay()
  }
  if (e.key === 'Escape') {
    if (dragActive) {
      dragActive = false
      ipcRenderer.sendToHost('notion:drag-cancel', {})
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

// Also hide overlay if window loses focus
window.addEventListener('blur', () => {
  cmdHeld = false
  if (!dragActive) hideOverlay()
})

// Pinch gestures on macOS trackpads arrive as wheel events with ctrlKey=true.
// Forward them to the host canvas so zoom always affects the canvas, not Notion.
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

// ---------------------------------------------------------------------------
// Drag — pointerdown in capture phase so we beat Notion's own handlers
// The preload registers before any page script, so capture-phase listeners
// here fire first. We also block mousedown and dragstart to stop Notion's
// own DnD from activating.
// ---------------------------------------------------------------------------

document.addEventListener('pointerdown', (e) => {
  if (!cmdHeld || e.button !== 0) return

  // Try direct link ancestor first; fall back to first link inside a block card
  let link = (e.target as Element).closest('a[href]') as HTMLAnchorElement | null
  if (!link) {
    const card = (e.target as Element).closest('[data-block-id]')
    link = card?.querySelector('a[href]') as HTMLAnchorElement | null
  }
  if (!link) return

  const href = link.getAttribute('href') ?? ''
  const pageId = extractPageId(href)
  if (!pageId) return

  // Stop Notion from seeing this event
  e.preventDefault()
  e.stopImmediatePropagation()

  dragActive = true

  // Find the closest card container for the screenshot rect
  const cardEl = (e.target as Element).closest('[data-block-id]') ?? link
  const r = cardEl.getBoundingClientRect()

  ipcRenderer.sendToHost('notion:drag-start', {
    pageId,
    title: extractTitle(link),
    x: e.clientX,
    y: e.clientY,
    viewportWidth: document.documentElement.clientWidth,
    viewportHeight: document.documentElement.clientHeight,
    cardRect: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
  })
}, true)

// Also intercept mousedown so Notion's mousedown-based drag doesn't start
document.addEventListener('mousedown', (e) => {
  if (cmdHeld && e.button === 0) {
    const link = (e.target as Element).closest('a[href]')
    if (link) {
      e.preventDefault()
      e.stopImmediatePropagation()
    }
  }
}, true)

// Prevent HTML5 native drag from starting while Cmd is held
document.addEventListener('dragstart', (e) => {
  if (cmdHeld) {
    e.preventDefault()
    e.stopImmediatePropagation()
  }
}, true)

document.addEventListener('pointermove', (e) => {
  if (!dragActive) return
  e.stopImmediatePropagation()
  ipcRenderer.sendToHost('notion:drag-move', { x: e.clientX, y: e.clientY })
}, true)

document.addEventListener('pointerup', (e) => {
  if (!dragActive) return
  e.stopImmediatePropagation()
  dragActive = false
  if (!cmdHeld) hideOverlay()
  ipcRenderer.sendToHost('notion:drag-end', { x: e.clientX, y: e.clientY })
}, true)
