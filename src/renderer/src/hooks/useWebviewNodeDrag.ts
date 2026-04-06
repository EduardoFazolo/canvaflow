import { useState, useEffect, useRef, useCallback } from 'react'
import { useNodeStore } from '../stores/nodeStore'
import { useCameraStore } from '../stores/cameraStore'
import { useCanvasDrag } from './useCanvasDrag'
import type { DragDropTarget } from '../types/dragDrop'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface WebviewNodeDragConfig<TDragData> {
  /** Current node's ID (excluded from drop targets). */
  nodeId: string

  /** IPC channel prefix matching the preload config. */
  channelPrefix: string

  /** Ref to the <webview> DOM element. */
  webviewRef: React.RefObject<HTMLElement | null>

  /** Node dimensions for coordinate-scale fallback. */
  nodeWidth: number
  nodeHeight: number
  titleBarHeight: number
  toolbarHeight: number

  /**
   * Parse the drag-start IPC payload into typed drag data.
   * The preload factory sends { itemId, title, x, y, viewportWidth, viewportHeight, cardRect }.
   * Return null to ignore the event.
   */
  parseDragStart: (payload: any) => { data: TDragData; title: string } | null

  /** Fire-and-forget prefetch when drag starts. */
  onPrefetch: (data: TDragData) => void

  /** Accepted drop target node types. */
  dropTargetTypes: string[]

  /**
   * Called when the drag ends (pointer released on host page).
   * Receives the drag data, the resolved drop target (null if canvas), and client coordinates.
   * The hook has already called execOnWebview('__canvaflow_cancelDrag') and reset its own state.
   */
  onDrop: (data: TDragData, target: DragDropTarget | null, clientX: number, clientY: number) => void
}

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface WebviewNodeDragReturn {
  isDragging: boolean
  ghostX: number
  ghostY: number
  activeDragTitle: string
  dropTarget: DragDropTarget | null
  /** Call inside the webview lifecycle useEffect to bind IPC handlers. Returns cleanup fn. */
  bindWebviewIpc: (wv: HTMLElement) => () => void
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWebviewNodeDrag<TDragData>(
  config: WebviewNodeDragConfig<TDragData>,
): WebviewNodeDragReturn {
  const {
    nodeId,
    channelPrefix,
    webviewRef,
    nodeWidth,
    nodeHeight,
    titleBarHeight,
    toolbarHeight,
    parseDragStart,
    onPrefetch,
    dropTargetTypes,
    onDrop: onDropCallback,
  } = config

  // -------------------------------------------------------------------------
  // Internal state
  // -------------------------------------------------------------------------

  const [dropTarget, setDropTarget] = useState<DragDropTarget | null>(null)
  const [activeDragTitle, setActiveDragTitle] = useState('')
  const dropTargetRef = useRef<DragDropTarget | null>(null)
  const dragDataRef = useRef<TDragData | null>(null)
  const prevWebviewPos = useRef({ x: 0, y: 0 })
  const webviewViewport = useRef({ width: 0, height: 0 })

  // Keep dropTargetRef in sync
  useEffect(() => { dropTargetRef.current = dropTarget }, [dropTarget])

  // Stable refs for callbacks to avoid re-subscribing effects
  const parseDragStartRef = useRef(parseDragStart)
  useEffect(() => { parseDragStartRef.current = parseDragStart }, [parseDragStart])
  const onPrefetchRef = useRef(onPrefetch)
  useEffect(() => { onPrefetchRef.current = onPrefetch }, [onPrefetch])
  const onDropCallbackRef = useRef(onDropCallback)
  useEffect(() => { onDropCallbackRef.current = onDropCallback }, [onDropCallback])

  // -------------------------------------------------------------------------
  // Drop target detection
  // -------------------------------------------------------------------------

  const getDropTargetAt = useCallback((clientX: number, clientY: number): DragDropTarget | null => {
    const canvasEl = document.querySelector('[data-canvas-root]')
    const canvasRect = canvasEl?.getBoundingClientRect()
    if (!canvasRect) return null

    const { camera } = useCameraStore.getState()
    const candidates = Array.from(useNodeStore.getState().nodes.values())
      .filter((c) => c.id !== nodeId && dropTargetTypes.includes(c.type))
      .map((c) => {
        const left = canvasRect.left + camera.x + c.x * camera.zoom
        const top = canvasRect.top + camera.y + c.y * camera.zoom
        const width = c.width * camera.zoom
        const height = (c.minimized ? 32 : c.height) * camera.zoom
        return { candidate: c, left, top, width, height }
      })
      .filter(({ left, top, width, height }) =>
        clientX >= left && clientX <= left + width && clientY >= top && clientY <= top + height
      )
      .sort((a, b) => b.candidate.zIndex - a.candidate.zIndex)

    const hit = candidates[0]
    if (!hit) return null
    return {
      nodeId: hit.candidate.id,
      nodeType: hit.candidate.type,
      title: hit.candidate.title,
      left: hit.left, top: hit.top, width: hit.width, height: hit.height,
    }
  }, [nodeId, dropTargetTypes])

  // -------------------------------------------------------------------------
  // execOnWebview helper
  // -------------------------------------------------------------------------

  const execOnWebview = useCallback((js: string) => {
    try { (webviewRef.current as any)?.executeJavaScript(js) } catch {}
  }, [webviewRef])

  // -------------------------------------------------------------------------
  // Core drag hook
  // -------------------------------------------------------------------------

  const { isDragging, ghostX, ghostY, startDrag, nudge, cancel } = useCanvasDrag({
    onMove: useCallback((clientX: number, clientY: number) => {
      setDropTarget(getDropTargetAt(clientX, clientY))
    }, [getDropTargetAt]),

    onDrop: useCallback((clientX: number, clientY: number) => {
      const target = dropTargetRef.current
      setDropTarget(null)
      execOnWebview('window.__canvaflow_cancelDrag&&window.__canvaflow_cancelDrag()')
      const data = dragDataRef.current
      if (!data) return
      dragDataRef.current = null
      onDropCallbackRef.current(data, target, clientX, clientY)
    }, [execOnWebview]),
  })

  // -------------------------------------------------------------------------
  // Cmd key forwarding to webview
  // -------------------------------------------------------------------------

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.key === 'Meta') execOnWebview('window.__canvaflow_setMode&&window.__canvaflow_setMode(true)')
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.key === 'Meta') execOnWebview('window.__canvaflow_setMode&&window.__canvaflow_setMode(false)')
    }
    document.addEventListener('keydown', onDown)
    document.addEventListener('keyup', onUp)
    return () => {
      document.removeEventListener('keydown', onDown)
      document.removeEventListener('keyup', onUp)
    }
  }, [execOnWebview])

  // -------------------------------------------------------------------------
  // IPC binding — call in the webview lifecycle useEffect
  // -------------------------------------------------------------------------

  const bindWebviewIpc = useCallback((wv: HTMLElement): (() => void) => {
    const onIpcMessage = (e: any) => {
      const { channel, args } = e

      if (channel === 'canvas:wheel') {
        const { deltaY, clientX, clientY, viewportWidth, viewportHeight } = args[0]
        const wvRect = (webviewRef.current as HTMLElement | null)?.getBoundingClientRect()
        if (!wvRect) return
        const scaleX = viewportWidth ? wvRect.width / viewportWidth : 1
        const scaleY = viewportHeight ? wvRect.height / viewportHeight : 1
        const hostX = wvRect.left + clientX * scaleX
        const hostY = wvRect.top + clientY * scaleY
        useCameraStore.getState().zoomAt(hostX, hostY, deltaY)
        return
      }

      if (channel === `${channelPrefix}:drag-start`) {
        const payload = args[0]
        const parsed = parseDragStartRef.current(payload)
        if (!parsed) return
        const { data, title } = parsed

        prevWebviewPos.current = { x: payload.x, y: payload.y }
        webviewViewport.current = { width: payload.viewportWidth ?? 0, height: payload.viewportHeight ?? 0 }
        dragDataRef.current = data
        setActiveDragTitle(title)
        setDropTarget(null)

        const wvRect = (webviewRef.current as HTMLElement)?.getBoundingClientRect()
        const initX = (wvRect && payload.viewportWidth) ? wvRect.left + (payload.x / payload.viewportWidth) * wvRect.width : undefined
        const initY = (wvRect && payload.viewportHeight) ? wvRect.top + (payload.y / payload.viewportHeight) * wvRect.height : undefined
        startDrag(initX, initY)

        onPrefetchRef.current(data)
      } else if (channel === `${channelPrefix}:drag-move`) {
        const { x, y } = args[0]
        const dx = x - prevWebviewPos.current.x
        const dy = y - prevWebviewPos.current.y
        prevWebviewPos.current = { x, y }
        const rect = (webviewRef.current as HTMLElement).getBoundingClientRect()
        const { width: vpW, height: vpH } = webviewViewport.current
        const scaleX = vpW > 0 ? rect.width / vpW : rect.width / nodeWidth
        const scaleY = vpH > 0 ? rect.height / vpH : rect.height / (nodeHeight - titleBarHeight - toolbarHeight)
        nudge(dx * scaleX, dy * scaleY)
      } else if (channel === `${channelPrefix}:drag-end`) {
        dragDataRef.current = null
        setDropTarget(null)
        cancel()
      } else if (channel === `${channelPrefix}:drag-cancel`) {
        dragDataRef.current = null
        setDropTarget(null)
        cancel()
      }
    }

    wv.addEventListener('ipc-message', onIpcMessage)
    return () => { wv.removeEventListener('ipc-message', onIpcMessage) }
  }, [channelPrefix, webviewRef, nodeWidth, nodeHeight, titleBarHeight, toolbarHeight, startDrag, nudge, cancel])

  return { isDragging, ghostX, ghostY, activeDragTitle, dropTarget, bindWebviewIpc }
}
