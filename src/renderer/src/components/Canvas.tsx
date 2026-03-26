import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useCameraStore, updateCursorPos, cancelCameraAnimation } from '../stores/cameraStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useNodeStore } from '../stores/nodeStore'
import { zoomFitNode, zoomExit } from '../utils/zoomFocus'
import { notifyCanvasInteractionEnd, notifyCanvasInteractionStart } from '../utils/canvasInteraction'
import { GridRenderer } from './GridRenderer'
import { CanvasOverlay } from './CanvasOverlay'
import { NodeLayer } from './NodeLayer'
import { ConnectionLayer } from './ConnectionLayer'
import { ClusterLayer } from '../../../plugins/orchestrator/renderer/ClusterLayer'
import { CanvasContextMenu } from './CanvasContextMenu'
import { BranchZoneLayer } from './BranchZoneLayer'
import { createNotionNoteFromDrop, NotionCanvasDropPayload } from '../../../plugins/notion/utils/notionDrag'
import { plugins } from '../../../plugins'

export function Canvas(): React.ReactElement {
  const { camera, pan, zoomAt } = useCameraStore()
  const rootRef = useRef<HTMLDivElement>(null)
  const isPanningRef = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })
  const spaceHeldRef = useRef(false)
  const interactionEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [shiftHeld, setShiftHeld] = useState(false)
  const isSelectingRef = useRef(false)
  const selectionStart = useRef({ sx: 0, sy: 0 })
  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  const startCanvasInteraction = useCallback(() => {
    notifyCanvasInteractionStart()
    if (interactionEndTimerRef.current) clearTimeout(interactionEndTimerRef.current)
  }, [])

  const scheduleCanvasInteractionEnd = useCallback((delay = 180) => {
    if (interactionEndTimerRef.current) clearTimeout(interactionEndTimerRef.current)
    interactionEndTimerRef.current = setTimeout(() => {
      interactionEndTimerRef.current = null
      notifyCanvasInteractionEnd()
    }, delay)
  }, [])

  // Double-tap on a node (title bar / terminal content / any host-page area) to zoom-fit;
  // double-tap again to zoom back out.
  // Webview content (browser, notion) is handled via preload IPC instead (see zoomFocus.ts).
  useEffect(() => {
    const tap = { lastTime: 0, lastNodeId: null as string | null }

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      const canvas = rootRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const { camera } = useCameraStore.getState()
      const wx = (e.clientX - rect.left - camera.x) / camera.zoom
      const wy = (e.clientY - rect.top - camera.y) / camera.zoom

      // Hit-test nodes; highest zIndex wins
      const nodes = useNodeStore.getState().nodes
      let hitNode = null
      let maxZ = -Infinity
      for (const node of nodes.values()) {
        const h = node.height
        if (wx >= node.x && wx <= node.x + node.width && wy >= node.y && wy <= node.y + h) {
          if (node.zIndex > maxZ) { maxZ = node.zIndex; hitNode = node }
        }
      }
      if (!hitNode) return
      if ((e.target as HTMLElement).closest('[data-no-canvas-gesture]')) return

      const now = Date.now()
      const isDoubleTap = hitNode.id === tap.lastNodeId && now - tap.lastTime < 350
      tap.lastTime = isDoubleTap ? 0 : now
      tap.lastNodeId = hitNode.id
      if (!isDoubleTap) return

      if (e.metaKey && e.shiftKey) {
        zoomExit()
      } else {
        zoomFitNode(hitNode.id)
      }
    }

    document.addEventListener('pointerdown', onPointerDown, { capture: true })
    return () => document.removeEventListener('pointerdown', onPointerDown, { capture: true } as any)
  }, [])

  // Attach wheel as non-passive so preventDefault works.
  // Track zoom gesture state so releasing Cmd mid-scroll doesn't suddenly pan.
  useEffect(() => {
    const el = rootRef.current
    if (!el) return

    let wasZooming = false
    let gestureEndTimer: ReturnType<typeof setTimeout> | null = null

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      startCanvasInteraction()
      cancelCameraAnimation()
      const rect = el.getBoundingClientRect()
      const localX = e.clientX - rect.left
      const localY = e.clientY - rect.top
      const style = useSettingsStore.getState().settings.navStyle

      if (gestureEndTimer) clearTimeout(gestureEndTimer)
      gestureEndTimer = setTimeout(() => { wasZooming = false }, 60)

      if (style === 'trackpad') {
        zoomAt(localX, localY, e.deltaY)
      } else {
        if (e.ctrlKey || e.metaKey) wasZooming = true

        if (wasZooming) {
          zoomAt(localX, localY, e.deltaY)
        } else {
          pan(-e.deltaX, -e.deltaY)
        }
      }
      scheduleCanvasInteractionEnd()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      if (gestureEndTimer) clearTimeout(gestureEndTimer)
    }
  }, [pan, scheduleCanvasInteractionEnd, startCanvasInteraction, zoomAt])

  const startPan = useCallback((e: React.PointerEvent) => {
    startCanvasInteraction()
    isPanningRef.current = true
    lastPos.current = { x: e.clientX, y: e.clientY }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    e.preventDefault()
  }, [startCanvasInteraction])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Clicking the canvas background deactivates any focused node.
    // Nodes call stopPropagation on pointerDown, so this only fires on empty space.
    useNodeStore.getState().setFocusedNodeId(null)
    if (e.shiftKey && e.button === 0) {
      // Enter rubber-band selection mode
      const rect = rootRef.current!.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      isSelectingRef.current = true
      selectionStart.current = { sx, sy }
      setSelectionRect({ x: sx, y: sy, w: 0, h: 0 })
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      e.preventDefault()
    } else {
      useNodeStore.getState().clearSelection()
      if (e.button === 1 || e.button === 0) {
        startPan(e)
      }
    }
  }, [startPan])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const rect = rootRef.current?.getBoundingClientRect()
    if (rect) updateCursorPos(e.clientX - rect.left, e.clientY - rect.top)

    if (isSelectingRef.current && rect) {
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      setSelectionRect({
        x: Math.min(sx, selectionStart.current.sx),
        y: Math.min(sy, selectionStart.current.sy),
        w: Math.abs(sx - selectionStart.current.sx),
        h: Math.abs(sy - selectionStart.current.sy),
      })
      return
    }

    if (!isPanningRef.current) return
    pan(e.clientX - lastPos.current.x, e.clientY - lastPos.current.y)
    lastPos.current = { x: e.clientX, y: e.clientY }
    scheduleCanvasInteractionEnd()
  }, [pan, scheduleCanvasInteractionEnd])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (isSelectingRef.current) {
      isSelectingRef.current = false
      const canvasRect = rootRef.current?.getBoundingClientRect()
      if (canvasRect) {
        const sx = e.clientX - canvasRect.left
        const sy = e.clientY - canvasRect.top
        const x = Math.min(sx, selectionStart.current.sx)
        const y = Math.min(sy, selectionStart.current.sy)
        const w = Math.abs(sx - selectionStart.current.sx)
        const h = Math.abs(sy - selectionStart.current.sy)
        const { camera } = useCameraStore.getState()
        // Convert screen rect to world coords
        const wx1 = (x - camera.x) / camera.zoom
        const wy1 = (y - camera.y) / camera.zoom
        const wx2 = (x + w - camera.x) / camera.zoom
        const wy2 = (y + h - camera.y) / camera.zoom
        const nodes = useNodeStore.getState().nodes
        const selectedIds = new Set<string>()
        for (const node of nodes.values()) {
          if (node.x < wx2 && node.x + node.width > wx1 && node.y < wy2 && node.y + node.height > wy1) {
            selectedIds.add(node.id)
          }
        }
        useNodeStore.getState().setSelectedNodeIds(selectedIds)
      }
      setSelectionRect(null)
      return
    }
    isPanningRef.current = false
    scheduleCanvasInteractionEnd(120)
  }, [scheduleCanvasInteractionEnd])

  useEffect(() => {
    return () => {
      if (interactionEndTimerRef.current) clearTimeout(interactionEndTimerRef.current)
    }
  }, [])

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.code === 'Space') { spaceHeldRef.current = true; setSpaceHeld(true) }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') setShiftHeld(true)
  }, [])

  const onKeyUp = useCallback((e: React.KeyboardEvent) => {
    if (e.code === 'Space') { spaceHeldRef.current = false; setSpaceHeld(false) }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') setShiftHeld(false)
  }, [])

  // Also track shift globally so cursor updates even when canvas div isn't focused
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftHeld(true) }
    const up = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftHeld(false) }
    document.addEventListener('keydown', down)
    document.addEventListener('keyup', up)
    return () => { document.removeEventListener('keydown', down); document.removeEventListener('keyup', up) }
  }, [])

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (
      e.dataTransfer.types.includes('application/canvaflow-notion-page') ||
      e.dataTransfer.types.includes('application/canvaflow-kanban-card')
    ) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    }
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    const raw = e.dataTransfer.getData('application/canvaflow-notion-page')
    if (!raw) return
    e.preventDefault()
    try {
      const payload = JSON.parse(raw) as NotionCanvasDropPayload
      void createNotionNoteFromDrop(payload, e.clientX, e.clientY)
    } catch (err) {
      console.error('Invalid Notion drag payload:', err)
    }
  }, [])

  return (
    <CanvasContextMenu camera={camera}>
      <div
        id="canvas-viewport"
        ref={rootRef}
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          cursor: shiftHeld ? 'crosshair' : spaceHeld ? 'grab' : 'default',
          outline: 'none',
        }}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <GridRenderer camera={camera} />
        <CanvasOverlay camera={camera}>
          <BranchZoneLayer />
          <ClusterLayer />
          <ConnectionLayer />
          <NodeLayer />
        </CanvasOverlay>

        {selectionRect && (
          <div
            style={{
              position: 'absolute',
              left: selectionRect.x,
              top: selectionRect.y,
              width: selectionRect.w,
              height: selectionRect.h,
              background: 'rgba(96,165,250,0.07)',
              border: '1px solid rgba(96,165,250,0.45)',
              borderRadius: 3,
              pointerEvents: 'none',
              zIndex: 9999,
            }}
          />
        )}
      </div>
      {plugins.map((p) => p.CanvasMount ? <p.CanvasMount key={p.id} /> : null)}
    </CanvasContextMenu>
  )
}
