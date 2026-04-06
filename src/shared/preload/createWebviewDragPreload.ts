import { ipcRenderer } from 'electron'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface WebviewDragPreloadConfig {
  /** IPC channel prefix: 'notion' | 'trello' | etc. */
  channelPrefix: string

  /** Given a URL, extract the item ID. Return null to skip. */
  extractItemId: (href: string) => string | null

  /** Given the clicked element, extract a display title. */
  extractTitle: (el: Element) => string

  /** CSS selector to find the closest link from a click target. */
  linkSelector: string

  /**
   * CSS selector for the card container element (for bounding rect).
   * If the click target isn't directly on a link, we search for a link
   * inside the closest element matching cardContainerSelector.
   */
  cardContainerSelector: string | null

  /** Overlay theme */
  overlayBackground: string
  overlayBorderColor: string
  badgeBackground: string

  /** CSS rule injected to highlight hoverable cards while in drag mode. */
  hoverHighlightCSS: string
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function initWebviewDragPreload(config: WebviewDragPreloadConfig): void {
  const {
    channelPrefix,
    extractItemId,
    extractTitle,
    linkSelector,
    cardContainerSelector,
    overlayBackground,
    overlayBorderColor,
    badgeBackground,
    hoverHighlightCSS,
  } = config

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  let cmdHeld = false
  let dragActive = false
  let overlayEl: HTMLDivElement | null = null

  // -------------------------------------------------------------------------
  // Overlay
  // -------------------------------------------------------------------------

  function showOverlay(): void {
    if (overlayEl) return
    overlayEl = document.createElement('div')
    overlayEl.id = '__canvaflow_drag_overlay__'
    overlayEl.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      pointer-events: none;
      background: ${overlayBackground};
      outline: 2px solid ${overlayBorderColor};
      outline-offset: -2px;
      box-sizing: border-box;
    `

    const badge = document.createElement('div')
    badge.style.cssText = `
      position: absolute;
      top: 14px;
      left: 50%;
      transform: translateX(-50%);
      background: ${badgeBackground};
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
    style.textContent = hoverHighlightCSS
    document.head.appendChild(style)
    document.body.appendChild(overlayEl)
  }

  function hideOverlay(): void {
    overlayEl?.remove()
    overlayEl = null
    document.getElementById('__canvaflow_drag_style__')?.remove()
  }

  // -------------------------------------------------------------------------
  // Host ↔ webview bridge
  // -------------------------------------------------------------------------

  ;(window as any).__canvaflow_setMode = (enabled: boolean): void => {
    if (enabled && !cmdHeld) {
      cmdHeld = true
      showOverlay()
    } else if (!enabled && !dragActive) {
      cmdHeld = false
      hideOverlay()
    }
  }

  ;(window as any).__canvaflow_cancelDrag = (): void => {
    dragActive = false
    hideOverlay()
  }

  // -------------------------------------------------------------------------
  // Keyboard
  // -------------------------------------------------------------------------

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Meta' && !cmdHeld) {
      cmdHeld = true
      showOverlay()
    }
    if (e.key === 'Escape') {
      if (dragActive) {
        dragActive = false
        ipcRenderer.sendToHost(`${channelPrefix}:drag-cancel`, {})
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

  // -------------------------------------------------------------------------
  // Drag — capture phase so we beat the page's own handlers
  // -------------------------------------------------------------------------

  document.addEventListener('pointerdown', (e) => {
    if (!cmdHeld || e.button !== 0) return

    // Try direct link ancestor first
    let link = (e.target as Element).closest(linkSelector) as HTMLAnchorElement | null

    // Fall back to first link inside a card container
    if (!link && cardContainerSelector) {
      const card = (e.target as Element).closest(cardContainerSelector)
      link = card?.querySelector(linkSelector) as HTMLAnchorElement | null
    }
    if (!link) return

    const href = link.getAttribute('href') ?? ''
    const itemId = extractItemId(href)
    if (!itemId) return

    e.preventDefault()
    e.stopImmediatePropagation()

    dragActive = true

    const cardEl = (cardContainerSelector
      ? (e.target as Element).closest(cardContainerSelector) ?? link
      : link)
    const r = cardEl.getBoundingClientRect()

    ipcRenderer.sendToHost(`${channelPrefix}:drag-start`, {
      itemId,
      title: extractTitle(link),
      x: e.clientX,
      y: e.clientY,
      viewportWidth: document.documentElement.clientWidth,
      viewportHeight: document.documentElement.clientHeight,
      cardRect: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
    })
  }, true)

  // Block the page's mousedown-based drag
  document.addEventListener('mousedown', (e) => {
    if (cmdHeld && e.button === 0) {
      const link = (e.target as Element).closest(linkSelector)
      if (link) {
        e.preventDefault()
        e.stopImmediatePropagation()
      }
    }
  }, true)

  // Prevent HTML5 native drag
  document.addEventListener('dragstart', (e) => {
    if (cmdHeld) {
      e.preventDefault()
      e.stopImmediatePropagation()
    }
  }, true)

  document.addEventListener('pointermove', (e) => {
    if (!dragActive) return
    e.stopImmediatePropagation()
    ipcRenderer.sendToHost(`${channelPrefix}:drag-move`, { x: e.clientX, y: e.clientY })
  }, true)

  document.addEventListener('pointerup', (e) => {
    if (!dragActive) return
    e.stopImmediatePropagation()
    dragActive = false
    if (!cmdHeld) hideOverlay()
    ipcRenderer.sendToHost(`${channelPrefix}:drag-end`, { x: e.clientX, y: e.clientY })
  }, true)

  // -------------------------------------------------------------------------
  // Wheel → canvas zoom
  // Pinch gestures on Mac trackpad arrive as wheel events with ctrlKey=true.
  // -------------------------------------------------------------------------

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
}
