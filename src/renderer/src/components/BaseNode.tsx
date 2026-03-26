import React, { useCallback, useEffect, useRef, useState } from 'react'
import { NodeData } from '../stores/nodeStore'
import { useNodeStore } from '../stores/nodeStore'
import { useCameraStore } from '../stores/cameraStore'
import { useTemplateStore } from '../stores/templateStore'
import { useActivationStore } from '../stores/activationStore'
import { SIDEBAR_W } from './Sidebar'
import {
  ContextMenu, ContextMenuContent, useContextMenu,
  ContextMenuItem, ContextMenuSeparator, ContextMenuSub,
} from './ui/context-menu'

const btnBase: React.CSSProperties = {
  width: 22, height: 22,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'transparent',
  border: 'none',
  borderRadius: 4,
  color: 'rgba(255,255,255,0.22)',
  cursor: 'pointer',
  padding: 0,
  flexShrink: 0,
  transition: 'background 0.1s, color 0.1s',
}
const btnHover: React.CSSProperties = {
  ...btnBase,
  background: 'rgba(255,255,255,0.07)',
  color: 'rgba(255,255,255,0.7)',
}
const btnCloseHover: React.CSSProperties = {
  ...btnBase,
  background: 'rgba(239,68,68,0.15)',
  color: 'rgba(239,68,68,0.85)',
}

function TitleField({ node, focused }: { node: NodeData; focused: boolean }): React.ReactElement {
  const { update } = useNodeStore()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(node.title)
  const inputRef = useRef<HTMLInputElement>(null)

  const commit = useCallback(() => {
    const trimmed = draft.trim()
    if (trimmed) update(node.id, { title: trimmed })
    else setDraft(node.title)
    setEditing(false)
  }, [draft, node.id, node.title, update])

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Escape') commit()
          e.stopPropagation()
        }}
        onBlur={commit}
        onPointerDown={(e) => e.stopPropagation()}
        autoFocus
        style={{
          flex: 1, height: 20, fontSize: 11, fontWeight: 500,
          color: 'rgba(255,255,255,0.85)',
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(167,139,250,0.4)',
          borderRadius: 3, padding: '0 5px', outline: 'none',
          fontFamily: 'inherit', letterSpacing: '0.03em',
        }}
      />
    )
  }

  return (
    <span
      onDoubleClick={(e) => { e.stopPropagation(); setDraft(node.title); setEditing(true) }}
      title="Double-click to rename"
      style={{
        flex: 1,
        fontSize: 11,
        fontWeight: 500,
        color: focused ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.3)',
        transition: 'color 0.15s',
        letterSpacing: '0.03em',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        cursor: 'grab',
      }}
    >
      {node.title}
    </span>
  )
}

/** Tiny helper — hooks into the nearest ContextMenu and opens it on right-click */
function ContextMenuHandle({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  const { openAt } = useContextMenu()
  return (
    <div
      {...rest}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        openAt(e.clientX, e.clientY)
      }}
    >
      {children}
    </div>
  )
}

interface Props {
  node: NodeData
  children?: React.ReactNode
  titleExtra?: React.ReactNode
  contextMenuExtra?: React.ReactNode
  noCssZoom?: boolean
}

export function BaseNode({ node, children, titleExtra, contextMenuExtra, noCssZoom }: Props): React.ReactElement {
  const { update, bringToFront, sendToBack, remove, focusedNodeId, setFocusedNodeId, selectedNodeIds, trackFocus } = useNodeStore()
  const { setDraggingOverSidebar, add: addTemplate } = useTemplateStore()
  const focused = focusedNodeId === node.id
  const selected = selectedNodeIds.has(node.id)
  const agentStatus = node.agentStatus

  const contentRef = useRef<HTMLDivElement>(null)

  // Prevent canvas from hijacking wheel events when this node is focused.
  // Cmd/Ctrl+wheel (pinch zoom) is allowed through so canvas zoom still works.
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      if (e.ctrlKey || e.metaKey) return
      if (useNodeStore.getState().focusedNodeId === node.id) {
        e.stopPropagation()
      }
    }
    el.addEventListener('wheel', onWheel, { passive: true })
    return () => el.removeEventListener('wheel', onWheel)
  }, [node.id])

  const isDragging = useRef(false)
  const dragStart = useRef({ px: 0, py: 0, nx: 0, ny: 0 })
  const multiDragStarts = useRef<Map<string, { nx: number; ny: number }>>(new Map())

  const isResizing = useRef(false)
  const resizeStart = useRef({ px: 0, py: 0, nw: 0, nh: 0 })

  const SNAP_GRID = 20

  const onHeaderPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    bringToFront(node.id)
    setFocusedNodeId(node.id)
    useActivationStore.getState().activateNow(node.id)
    trackFocus(node.id)
    isDragging.current = true
    dragStart.current = { px: e.clientX, py: e.clientY, nx: node.x, ny: node.y }
    // Record starting positions of all other selected nodes for multi-drag
    const { selectedNodeIds, nodes } = useNodeStore.getState()
    if (selectedNodeIds.has(node.id)) {
      const starts = new Map<string, { nx: number; ny: number }>()
      for (const id of selectedNodeIds) {
        if (id === node.id) continue
        const n = nodes.get(id)
        if (n) starts.set(id, { nx: n.x, ny: n.y })
      }
      multiDragStarts.current = starts
    } else {
      multiDragStarts.current = new Map()
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [node.id, node.x, node.y, bringToFront, setFocusedNodeId])

  const onHeaderPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return
    const zoom = useCameraStore.getState().camera.zoom
    const dx = (e.clientX - dragStart.current.px) / zoom
    const dy = (e.clientY - dragStart.current.py) / zoom
    const snap = (v: number) => Math.round(v / SNAP_GRID) * SNAP_GRID
    let newX = dragStart.current.nx + dx
    let newY = dragStart.current.ny + dy
    if (e.ctrlKey) {
      newX = snap(newX)
      newY = snap(newY)
    }
    update(node.id, { x: newX, y: newY })
    // Move all other selected nodes by the same delta
    if (multiDragStarts.current.size > 0) {
      const storeUpdate = useNodeStore.getState().update
      for (const [id, start] of multiDragStarts.current) {
        let nx = start.nx + dx
        let ny = start.ny + dy
        if (e.ctrlKey) { nx = snap(nx); ny = snap(ny) }
        storeUpdate(id, { x: nx, y: ny })
      }
    }
    setDraggingOverSidebar(e.clientX < SIDEBAR_W)
  }, [node.id, update, setDraggingOverSidebar])

  const onHeaderPointerUp = useCallback((e: React.PointerEvent) => {
    if (isDragging.current && e.clientX < SIDEBAR_W) {
      // Drop onto sidebar — save as template and snap node back to original position
      const { serializedState: _s, ...safeProps } = node.props as any
      addTemplate({ type: node.type, title: node.title, props: safeProps })
      update(node.id, { x: dragStart.current.nx, y: dragStart.current.ny })
    }
    setDraggingOverSidebar(false)
    isDragging.current = false
  }, [node, addTemplate, update, setDraggingOverSidebar])

  const onResizePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    isResizing.current = true
    resizeStart.current = { px: e.clientX, py: e.clientY, nw: node.width, nh: node.height }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [node.width, node.height])

  const onResizePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isResizing.current) return
    const zoom = useCameraStore.getState().camera.zoom
    const dw = (e.clientX - resizeStart.current.px) / zoom
    const dh = (e.clientY - resizeStart.current.py) / zoom
    update(node.id, {
      width: Math.max(200, resizeStart.current.nw + dw),
      height: Math.max(150, resizeStart.current.nh + dh),
    })
  }, [node.id, update])

  const onResizePointerUp = useCallback(() => {
    isResizing.current = false
  }, [])

  return (
    <div
      style={{
        position: 'absolute',
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        zIndex: node.zIndex,
        borderRadius: 8,
        boxShadow: focused
          ? '0 8px 32px rgba(0,0,0,0.65), 0 2px 8px rgba(0,0,0,0.4), 0 0 0 1.5px rgba(167,139,250,0.5)'
          : selected
          ? '0 8px 32px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.35), 0 0 0 1.5px rgba(96,165,250,0.55)'
          : '0 8px 32px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.35)',
        overflow: 'hidden',
        transition: 'box-shadow 0.15s',
      }}
      data-node-id={node.id}
      onPointerDown={(e) => { bringToFront(node.id); setFocusedNodeId(node.id); useActivationStore.getState().activateNow(node.id); e.stopPropagation() }}
    >
      {/* Title bar with context menu */}
      <ContextMenu>
          <ContextMenuHandle
            style={{
              height: 32,
              display: 'flex',
              alignItems: 'center',
              paddingLeft: 12,
              paddingRight: 8,
              gap: 4,
              background: focused ? '#1c1c1c' : '#161616',
              borderRadius: '8px 8px 0 0',
              border: focused ? '1px solid rgba(167,139,250,0.25)' : '1px solid rgba(255,255,255,0.07)',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              transition: 'background 0.15s, border-color 0.15s',
              cursor: 'grab',
              userSelect: 'none',
            }}
            onPointerDown={onHeaderPointerDown}
            onPointerMove={onHeaderPointerMove}
            onPointerUp={onHeaderPointerUp}
          >
        {/* Drag dots */}
        <svg width="8" height="12" viewBox="0 0 8 12" style={{ opacity: focused ? 0.35 : 0.15, flexShrink: 0, marginRight: 6, transition: 'opacity 0.15s' }}>
          <circle cx="2" cy="2" r="1.2" fill="white" />
          <circle cx="6" cy="2" r="1.2" fill="white" />
          <circle cx="2" cy="6" r="1.2" fill="white" />
          <circle cx="6" cy="6" r="1.2" fill="white" />
          <circle cx="2" cy="10" r="1.2" fill="white" />
          <circle cx="6" cy="10" r="1.2" fill="white" />
        </svg>

        <TitleField node={node} focused={focused} />

        {titleExtra}

        {/* Agent status dot */}
        {agentStatus && agentStatus !== 'idle' && (() => {
          const colors: Record<string, string> = {
            thinking: '#a78bfa',
            executing: '#60a5fa',
            modifying_files: '#fb923c',
            needs_permission: '#fbbf24',
            needs_input: '#fbbf24',
            done: '#4ade80',
            error: '#f87171',
          }
          const color = colors[agentStatus] ?? '#9ca3af'
          const label: Record<string, string> = {
            thinking: 'Thinking',
            executing: 'Running command',
            modifying_files: 'Modifying files',
            needs_permission: 'Awaiting user input',
            needs_input: 'Awaiting user input',
            done: 'Done',
            error: 'Error',
          }
          return (
            <div
              title={label[agentStatus] ?? agentStatus}
              style={{
                width: 6, height: 6, borderRadius: '50%',
                background: color,
                flexShrink: 0,
                boxShadow: `0 0 4px ${color}`,
                opacity: 0.9,
              }}
            />
          )
        })()}

        {/* Window size & zoom level display */}
        <span
          style={{
            fontSize: 10,
            color: 'rgba(255,255,255,0.45)',
            userSelect: 'none',
            textAlign: 'center',
            whiteSpace: 'nowrap',
          }}
          title="Window size and content zoom level"
        >
          {Math.round(node.width)}x{Math.round(node.height)}px &middot; {Math.round((node.contentScale ?? 1) * 100)}%
        </span>

        {/* Zoom out button */}
        <button
          style={{ ...btnBase }}
          data-no-canvas-gesture
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); update(node.id, { contentScale: Math.max(0.5, (node.contentScale ?? 1) - 0.25) }) }}
          title="Zoom out content"
          onMouseEnter={(e) => Object.assign((e.currentTarget as HTMLElement).style, btnHover)}
          onMouseLeave={(e) => Object.assign((e.currentTarget as HTMLElement).style, btnBase)}
        >
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
        </button>

        {/* Zoom in button */}
        <button
          style={{ ...btnBase }}
          data-no-canvas-gesture
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); update(node.id, { contentScale: Math.min(2, (node.contentScale ?? 1) + 0.25) }) }}
          title="Zoom in content"
          onMouseEnter={(e) => Object.assign((e.currentTarget as HTMLElement).style, btnHover)}
          onMouseLeave={(e) => Object.assign((e.currentTarget as HTMLElement).style, btnBase)}
        >
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M5 2v6M2 5h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
        </button>

        {/* Close button */}
        <button
          style={{ ...btnBase }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); remove(node.id) }}
          title="Close"
          onMouseEnter={(e) => Object.assign((e.currentTarget as HTMLElement).style, btnCloseHover)}
          onMouseLeave={(e) => Object.assign((e.currentTarget as HTMLElement).style, btnBase)}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </button>
          </ContextMenuHandle>
        <ContextMenuContent>
          {contextMenuExtra}
          <ContextMenuSub trigger="Order">
            <ContextMenuItem onClick={() => bringToFront(node.id)}>Bring to Front</ContextMenuItem>
            <ContextMenuItem onClick={() => sendToBack(node.id)}>Send to Back</ContextMenuItem>
          </ContextMenuSub>
          <ContextMenuSeparator />
          <ContextMenuItem destructive onClick={() => remove(node.id)}>Close</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Content */}
      <div ref={contentRef} style={{
        height: node.height - 32,
        position: 'relative',
        overflow: 'hidden',
        background: '#0d0d0d',
        border: '1px solid rgba(255,255,255,0.07)',
        borderTop: 'none',
        borderRadius: '0 0 8px 8px',
        zoom: noCssZoom ? 1 : (node.contentScale ?? 1),
      }}>
        {children}
      </div>

      {/* Resize handle */}
      <div
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: 16,
            height: 16,
            cursor: 'se-resize',
            zIndex: 10,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'flex-end',
            padding: 3,
          }}
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
        >
          <svg width="7" height="7" viewBox="0 0 7 7" style={{ opacity: 0.2 }}>
            <path d="M1 6h5V1" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </svg>
        </div>
    </div>
  )
}
