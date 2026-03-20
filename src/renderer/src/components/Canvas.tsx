import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useCameraStore, updateCursorPos, cancelCameraAnimation } from '../stores/cameraStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useNodeStore } from '../stores/nodeStore'
import { zoomFitNode, zoomExit } from '../utils/zoomFocus'
import { GridRenderer } from './GridRenderer'
import { CanvasOverlay } from './CanvasOverlay'
import { NodeLayer } from './NodeLayer'
import { CanvasContextMenu } from './CanvasContextMenu'
import { createNotionNoteFromDrop, NotionCanvasDropPayload } from '../../../plugins/notion/utils/notionDrag'

export function Canvas(): React.ReactElement {
  const { camera, pan, zoomAt } = useCameraStore()
  const rootRef = useRef<HTMLDivElement>(null)
  const isPanningRef = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })
  const spaceHeldRef = useRef(false)
  const [spaceHeld, setSpaceHeld] = useState(false)

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

  // Attach wheel as non-passive so preventDefault works
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      cancelCameraAnimation()
      const rect = el.getBoundingClientRect()
      const localX = e.clientX - rect.left
      const localY = e.clientY - rect.top
      const style = useSettingsStore.getState().settings.navStyle
      if (style === 'trackpad') {
        zoomAt(localX, localY, e.deltaY)
      } else {
        if (e.ctrlKey || e.metaKey) {
          zoomAt(localX, localY, e.deltaY)
        } else {
          pan(-e.deltaX, -e.deltaY)
        }
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [pan, zoomAt])

  const startPan = useCallback((e: React.PointerEvent) => {
    isPanningRef.current = true
    lastPos.current = { x: e.clientX, y: e.clientY }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    e.preventDefault()
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Clicking the canvas background deactivates any focused node.
    // Nodes call stopPropagation on pointerDown, so this only fires on empty space.
    useNodeStore.getState().setFocusedNodeId(null)
    if (e.button === 1 || e.button === 0) {
      startPan(e)
    }
  }, [startPan])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const rect = rootRef.current?.getBoundingClientRect()
    if (rect) updateCursorPos(e.clientX - rect.left, e.clientY - rect.top)
    if (!isPanningRef.current) return
    pan(e.clientX - lastPos.current.x, e.clientY - lastPos.current.y)
    lastPos.current = { x: e.clientX, y: e.clientY }
  }, [pan])

  const onPointerUp = useCallback(() => {
    isPanningRef.current = false
  }, [])

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.code === 'Space') { spaceHeldRef.current = true; setSpaceHeld(true) }
  }, [])

  const onKeyUp = useCallback((e: React.KeyboardEvent) => {
    if (e.code === 'Space') { spaceHeldRef.current = false; setSpaceHeld(false) }
  }, [])

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/canvaflow-notion-page')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
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
          width: '100vw',
          height: '100vh',
          overflow: 'hidden',
          cursor: spaceHeld ? 'grab' : 'default',
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
          <NodeLayer />
        </CanvasOverlay>

      </div>
    </CanvasContextMenu>
  )
}
