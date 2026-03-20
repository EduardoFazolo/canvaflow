import React, { useEffect, useRef, useState, useCallback } from 'react'
import { NodeData, useNodeStore } from '../stores/nodeStore'
import { BaseNode } from './BaseNode'
import { useCameraStore } from '../stores/cameraStore'
import { useSessionStore } from '../stores/sessionStore'
import { useActivationStore } from '../stores/activationStore'
import { NodePlaceholder } from './NodePlaceholder'
import { registerBrowserPaster, unregisterBrowserPaster } from '../browserRegistry'
import { zoomFitNode, zoomExit } from '../utils/zoomFocus'
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent,
  ContextMenuItem, ContextMenuSeparator, ContextMenuSub
} from './ui/context-menu'

const TITLE_H = 32
const TOOLBAR_H = 36

function getPartition(sessionId: string | undefined, nodeId: string): string {
  if (!sessionId || sessionId === 'default') return 'persist:canvaflow-ws-default'
  if (sessionId === 'private') return `canvaflow-private-${nodeId}`
  return `persist:canvaflow-session-${sessionId}`
}

// ---------------------------------------------------------------------------
// SessionPicker
// ---------------------------------------------------------------------------

interface SessionPickerProps {
  sessionId: string | undefined
  nodeId: string
  onChange: (sessionId: string) => void
}

function SessionPicker({ sessionId, nodeId, onChange }: SessionPickerProps): React.ReactElement {
  const { sessions, loaded, load, add } = useSessionStore()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (!loaded) load() }, [loaded, load])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setCreating(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    if (creating && inputRef.current) inputRef.current.focus()
  }, [creating])

  const currentLabel = !sessionId || sessionId === 'default'
    ? 'Default'
    : sessionId === 'private'
      ? 'Private'
      : sessions.find((s) => s.id === sessionId)?.name ?? 'Unknown'

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    const session = await add(name)
    onChange(session.id)
    setNewName('')
    setCreating(false)
    setOpen(false)
  }

  const isPrivate = sessionId === 'private'
  const isDefault = !sessionId || sessionId === 'default'

  return (
    <div ref={pickerRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => setOpen((o) => !o)}
        title="Browser session"
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          height: 22, padding: '0 7px',
          borderRadius: 4, border: '1px solid rgba(255,255,255,0.08)',
          background: open ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
          color: isPrivate ? 'rgba(251,191,36,0.8)' : 'rgba(255,255,255,0.4)',
          fontSize: 10, fontWeight: 500, cursor: 'pointer',
          letterSpacing: '0.02em', whiteSpace: 'nowrap',
        }}
      >
        {isPrivate ? (
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
            <path d="M5 1a2 2 0 0 1 2 2v1H3V3a2 2 0 0 1 2-2zM2 4h6a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" fill="currentColor"/>
          </svg>
        ) : (
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
            <circle cx="5" cy="3.5" r="2" stroke="currentColor" strokeWidth="1.1"/>
            <path d="M1.5 9c0-1.93 1.57-3.5 3.5-3.5S8.5 7.07 8.5 9" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
          </svg>
        )}
        {currentLabel}
      </button>

      {open && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', top: 26, right: 0,
            minWidth: 160, zIndex: 99999,
            background: '#1e1e1e',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 6,
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            overflow: 'hidden',
          }}
        >
          {(['default', 'private'] as const).map((opt) => (
            <div
              key={opt}
              onClick={() => { onChange(opt); setOpen(false) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 10px', fontSize: 12, cursor: 'pointer',
                color: (opt === 'default' ? isDefault : opt === sessionId)
                  ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.55)',
                background: (opt === 'default' ? isDefault : opt === sessionId)
                  ? 'rgba(167,139,250,0.12)' : 'transparent',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background =
                  (opt === 'default' ? isDefault : opt === sessionId) ? 'rgba(167,139,250,0.12)' : 'transparent'
              }}
            >
              {opt === 'private' ? (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M5 1a2 2 0 0 1 2 2v1H3V3a2 2 0 0 1 2-2zM2 4h6a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" fill="rgba(251,191,36,0.7)"/>
                </svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <circle cx="5" cy="3.5" r="2" stroke="rgba(255,255,255,0.4)" strokeWidth="1.1"/>
                  <path d="M1.5 9c0-1.93 1.57-3.5 3.5-3.5S8.5 7.07 8.5 9" stroke="rgba(255,255,255,0.4)" strokeWidth="1.1" strokeLinecap="round"/>
                </svg>
              )}
              <span>{opt === 'default' ? 'Default (shared)' : 'Private'}</span>
              {opt === 'private' && (
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginLeft: 'auto' }}>incognito</span>
              )}
            </div>
          ))}

          {sessions.length > 0 && (
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', margin: '2px 0' }} />
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => { onChange(s.id); setOpen(false) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 10px', fontSize: 12, cursor: 'pointer',
                color: sessionId === s.id ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.55)',
                background: sessionId === s.id ? 'rgba(167,139,250,0.12)' : 'transparent',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background =
                  sessionId === s.id ? 'rgba(167,139,250,0.12)' : 'transparent'
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <circle cx="5" cy="3.5" r="2" stroke="rgba(167,139,250,0.7)" strokeWidth="1.1"/>
                <path d="M1.5 9c0-1.93 1.57-3.5 3.5-3.5S8.5 7.07 8.5 9" stroke="rgba(167,139,250,0.7)" strokeWidth="1.1" strokeLinecap="round"/>
              </svg>
              {s.name}
            </div>
          ))}

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', margin: '2px 0' }} />
          {creating ? (
            <div style={{ padding: '6px 8px', display: 'flex', gap: 6 }}>
              <input
                ref={inputRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate()
                  if (e.key === 'Escape') { setCreating(false); setNewName('') }
                }}
                placeholder="Session name…"
                style={{
                  flex: 1, height: 24, borderRadius: 4,
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'rgba(255,255,255,0.06)',
                  color: 'rgba(255,255,255,0.8)', fontSize: 11,
                  padding: '0 7px', outline: 'none', fontFamily: 'inherit',
                }}
              />
              <button
                onClick={handleCreate}
                style={{
                  height: 24, padding: '0 8px', borderRadius: 4,
                  border: 'none', background: '#a78bfa', color: '#fff',
                  fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Save
              </button>
            </div>
          ) : (
            <div
              onClick={() => setCreating(true)}
              style={{
                padding: '7px 10px', fontSize: 12, cursor: 'pointer',
                color: 'rgba(255,255,255,0.4)',
                display: 'flex', alignItems: 'center', gap: 7,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.7)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.4)' }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              New session…
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function parseGitHubRepo(url: string): { owner: string; repo: string; cloneUrl: string } | null {
  try {
    const u = new URL(url)
    if (u.hostname !== 'github.com') return null
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts.length < 2) return null
    const skip = ['login', 'signup', 'explore', 'trending', 'marketplace', 'orgs', 'settings']
    if (skip.includes(parts[0])) return null
    const [owner, repo] = parts
    const repoName = repo.replace(/\.git$/, '')
    return { owner, repo: repoName, cloneUrl: `https://github.com/${owner}/${repoName}.git` }
  } catch {
    return null
  }
}

const btnBase: React.CSSProperties = {
  width: 22,
  height: 22,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: 'none',
  borderRadius: 4,
  color: 'rgba(255,255,255,0.25)',
  cursor: 'pointer',
  padding: 0,
  flexShrink: 0,
}
const btnHover: React.CSSProperties = {
  ...btnBase,
  background: 'rgba(255,255,255,0.07)',
  color: 'rgba(255,255,255,0.75)',
}

interface Props {
  node: NodeData
}

export function BrowserNode({ node }: Props): React.ReactElement {
  const { update, remove, bringToFront, sendToBack, add, setFocusedNodeId } = useNodeStore()
  const isActivated = useActivationStore((s) => !!s.activated[node.id])
  const isFocused = useNodeStore((s) => s.focusedNodeId === node.id)
  const isActiveWorkspace = useNodeStore((s) =>
    s.workspaceNodes.get(s.activeWorkspaceId)?.has(node.id) ?? false
  )

  const webviewAreaRef = useRef<HTMLDivElement>(null)

  const sessionId = node.props.sessionId as string | undefined
  const partition = getPartition(sessionId, node.id)
  const partitionRef = useRef(partition)

  // Keep contentScale in a ref so camera subscription can read it without stale closure
  const contentScaleRef = useRef(node.contentScale ?? 1)
  contentScaleRef.current = node.contentScale ?? 1

  // Current URL tracked without re-rendering
  const webviewSrcRef = useRef<string>((node.props.url as string) || 'https://google.com')

  const [urlBar, setUrlBar] = useState<string>(webviewSrcRef.current)
  const [loading, setLoading] = useState(false)
  const [thumbnail, setThumbnail] = useState<string | null>(null)
  const [viewCreated, setViewCreated] = useState(false)
  const viewCreatedRef = useRef(false)
  useEffect(() => { viewCreatedRef.current = viewCreated }, [viewCreated])

  // Screenshot freeze-during-movement — fully imperative, no React state
  const screenshotRef = useRef<string | null>(null)
  const frozenImgRef = useRef<HTMLImageElement>(null)
  const isFrozenRef = useRef(false)
  const moveEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shouldShowRef = useRef(false)

  // Track camera zoom without re-rendering on every change
  const cameraZoomRef = useRef(useCameraStore.getState().camera.zoom)
  const [isThumbnailMode, setIsThumbnailMode] = useState(
    useCameraStore.getState().camera.zoom < 0.3
  )

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  // Compute bounds directly from camera state + node coords.
  // Reads canvas-viewport position via getBoundingClientRect() on each call so
  // it stays correct when the sidebar opens/closes — a cached ref would go stale
  // because ResizeObserver only fires on size changes, not position changes.
  // The canvas-viewport never moves due to camera changes, so this single read
  // per camera frame is cheap and always accurate.
  const getBoundsDirect = useCallback(
    (camera: { x: number; y: number; zoom: number }) => {
      const vp = document.getElementById('canvas-viewport')
      if (!vp) return null
      const { left: vpLeft, top: vpTop } = vp.getBoundingClientRect()
      const zoom = camera.zoom
      const sx = vpLeft + camera.x + node.x * zoom
      const syFull = vpTop + camera.y + node.y * zoom
      const contentOffsetY = (TITLE_H + TOOLBAR_H) * zoom
      const sy = syFull + contentOffsetY
      const sw = node.width * zoom
      const sh = (node.height - TITLE_H - TOOLBAR_H) * zoom

      const left = Math.max(sx, vpLeft)   // clip to sidebar right edge
      const top = Math.max(sy, vpTop)     // clip to canvas top edge
      const right = sx + sw
      const bottom = sy + sh
      if (right <= left || bottom <= top) return null
      return {
        x: Math.round(left),
        y: Math.round(top),
        width: Math.round(right - left),
        height: Math.round(bottom - top),
      }
    },
    [node.x, node.y, node.width, node.height]
  )

  // Fallback: read bounds from DOM (used outside camera subscription path).
  const getBounds = useCallback(() => {
    return getBoundsDirect(useCameraStore.getState().camera)
  }, [getBoundsDirect])

  // Stable ref so the visibility effect can call the latest getBoundsDirect
  // without taking it as a dependency (which would cause re-runs on every drag update).
  const getBoundsDirectRef = useRef(getBoundsDirect)
  useEffect(() => { getBoundsDirectRef.current = getBoundsDirect }, [getBoundsDirect])

  // Track previous camera zoom to avoid resetting page zoom on every pan
  const prevCameraZoomRef = useRef(useCameraStore.getState().camera.zoom)

  const sendBounds = useCallback(() => {
    const bounds = getBounds()
    if (!bounds) return
    window.browser.updateBounds(node.id, bounds)
  }, [node.id, getBounds])

  const sendBoundsAndZoom = useCallback((cameraZoom: number) => {
    const bounds = getBounds()
    if (!bounds) return
    window.browser.updateBounds(node.id, bounds)
    window.browser.setZoomFactor(node.id, cameraZoom * contentScaleRef.current)
  }, [node.id, getBounds])

  // ---------------------------------------------------------------------------
  // Freeze-during-movement: show a DOM screenshot while the canvas is moving
  // so the frozen image tracks the node frame (CSS transform) with zero lag.
  // ---------------------------------------------------------------------------

  const captureSnapshot = useCallback(() => {
    if (!viewCreatedRef.current) return
    window.browser.capture(node.id).then((url) => {
      if (!url) return
      screenshotRef.current = url
      // Pre-load into the always-present img so it's already decoded when we freeze
      if (frozenImgRef.current) frozenImgRef.current.src = url
    })
  }, [node.id])

  const freeze = useCallback(() => {
    if (!shouldShowRef.current) return      // view is hidden, nothing to freeze
    if (isFrozenRef.current) return         // already frozen
    isFrozenRef.current = true
    // Show the already-decoded screenshot first (if available), THEN hide the native
    // view — avoids white flash. If no screenshot yet, we still hide the view to
    // prevent it from overlapping the sidebar when the node scrolls off-screen.
    const img = frozenImgRef.current
    if (img && img.src) img.style.display = 'block'
    window.browser.setVisible(node.id, false)
  }, [node.id])

  const scheduleUnfreeze = useCallback(() => {
    if (moveEndTimerRef.current) clearTimeout(moveEndTimerRef.current)
    moveEndTimerRef.current = setTimeout(() => {
      if (!isFrozenRef.current) return
      isFrozenRef.current = false
      if (shouldShowRef.current) {
        const bounds = getBoundsDirect(useCameraStore.getState().camera)
        if (bounds) {
          // Node is visible — restore live view
          if (frozenImgRef.current) frozenImgRef.current.style.display = 'none'
          window.browser.updateBounds(node.id, bounds)
          window.browser.setVisible(node.id, true)
          captureSnapshot() // refresh for next movement/unfocus
        }
        // If bounds is null: node is fully behind sidebar or off-screen.
        // Keep view hidden and screenshot visible until next movement brings it back.
      }
      // If not focused, the img stays visible (it's the idle screenshot)
    }, 150)
  }, [node.id, getBoundsDirect, captureSnapshot])

  // ---------------------------------------------------------------------------
  // Lifecycle: create / destroy WebContentsView
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const bounds = getBounds() ?? { x: 0, y: 0, width: Math.round(node.width), height: Math.round(node.height - TITLE_H - TOOLBAR_H) }
    window.browser.create(node.id, partition, webviewSrcRef.current, bounds).then(() => {
      setViewCreated(true)
    })
    return () => {
      window.browser.destroy(node.id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally mount/unmount only

  // ---------------------------------------------------------------------------
  // Session changes: recreate with new partition
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!viewCreated) return
    if (partition === partitionRef.current) return
    partitionRef.current = partition
    const bounds = getBounds() ?? { x: 0, y: 0, width: Math.round(node.width), height: Math.round(node.height - TITLE_H - TOOLBAR_H) }
    window.browser.changeSession(node.id, partition, webviewSrcRef.current, bounds)
  }, [partition, viewCreated, node.id, node.width, node.height, getBounds])

  // ---------------------------------------------------------------------------
  // Visibility: show/hide based on activation + workspace + thumbnail mode
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!viewCreated) return
    // Live view is shown only when this node is the focused one.
    // When unfocused, we show a DOM screenshot instead — it naturally sits behind
    // the sidebar (and all other DOM z-indexed elements) with zero IPC overhead.
    const shouldShow = isFocused && isActiveWorkspace && !isThumbnailMode
    shouldShowRef.current = shouldShow

    if (shouldShow) {
      // Becoming focused: hide screenshot overlay, update bounds, show live view
      if (!isFrozenRef.current && frozenImgRef.current) {
        frozenImgRef.current.style.display = 'none'
      }
      if (isFrozenRef.current) {
        // a freeze was in progress before focus — abort it
        isFrozenRef.current = false
        if (moveEndTimerRef.current) clearTimeout(moveEndTimerRef.current)
        if (frozenImgRef.current) frozenImgRef.current.style.display = 'none'
      }
      const bounds = getBoundsDirectRef.current(useCameraStore.getState().camera)
      if (bounds) {
        window.browser.updateBounds(node.id, bounds)
        window.browser.setVisible(node.id, true)
      }
      captureSnapshot() // keep screenshot fresh for next unfocus
    } else {
      // Becoming unfocused: hide live view, show last screenshot in DOM
      if (isFrozenRef.current) {
        isFrozenRef.current = false
        if (moveEndTimerRef.current) clearTimeout(moveEndTimerRef.current)
      }
      window.browser.setVisible(node.id, false)
      // Show last known screenshot immediately (DOM img, appears behind sidebar)
      if (frozenImgRef.current && screenshotRef.current) {
        frozenImgRef.current.style.display = 'block'
      }
      captureSnapshot() // capture current state for next time it's shown
    }
  }, [isFocused, isActiveWorkspace, isThumbnailMode, viewCreated, node.id, captureSnapshot])

  // ---------------------------------------------------------------------------
  // Bounds: update when camera moves or node resizes
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const onCameraChange = (s: ReturnType<typeof useCameraStore.getState>) => {
      const zoomChanged = s.camera.zoom !== prevCameraZoomRef.current
      if (zoomChanged) prevCameraZoomRef.current = s.camera.zoom
      const bounds = getBoundsDirect(s.camera)
      if (bounds) {
        window.browser.updateBounds(node.id, bounds) // keep hidden view in sync
        if (zoomChanged) {
          window.browser.setZoomFactor(node.id, s.camera.zoom * contentScaleRef.current)
        }
      }
      // Always freeze/unfreeze — even when off-screen, we must hide the live view
      // so it doesn't float over the sidebar when the node scrolls off-screen.
      freeze()
      scheduleUnfreeze()
    }
    const unsub = useCameraStore.subscribe(onCameraChange)
    return () => { unsub() }
  }, [node.id, getBoundsDirect, freeze, scheduleUnfreeze])

  // Update bounds when node dimensions change
  useEffect(() => {
    if (!viewCreated) return
    sendBounds()
    freeze()
    scheduleUnfreeze()
  }, [node.width, node.height, node.x, node.y, viewCreated, sendBounds, freeze, scheduleUnfreeze])

  // Update zoom factor when contentScale changes (zoom +/- buttons in title bar)
  useEffect(() => {
    if (!viewCreated) return
    const cameraZoom = useCameraStore.getState().camera.zoom
    window.browser.setZoomFactor(node.id, cameraZoom * (node.contentScale ?? 1))
  }, [node.contentScale, viewCreated, node.id])

  // Re-send bounds when the sidebar opens/closes — the canvas-viewport shifts
  // horizontally but no camera event fires, so bounds would otherwise go stale.
  useEffect(() => {
    if (!viewCreated) return
    const sidebar = document.querySelector('[data-sidebar]')
    if (!sidebar) return
    const ro = new ResizeObserver(() => { sendBounds() })
    ro.observe(sidebar)
    return () => ro.disconnect()
  }, [viewCreated, sendBounds])

  // ---------------------------------------------------------------------------
  // Thumbnail mode
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const unsub = useCameraStore.subscribe((s) => {
      const zoom = s.camera.zoom
      const wasBelow = cameraZoomRef.current < 0.3
      const isBelow = zoom < 0.3

      if (!wasBelow && isBelow) {
        // Transitioning to thumbnail: capture screenshot
        window.browser.capture(node.id).then((dataUrl) => {
          if (dataUrl) setThumbnail(dataUrl)
        })
        setIsThumbnailMode(true)
      }

      if (wasBelow && !isBelow) {
        setIsThumbnailMode(false)
      }

      cameraZoomRef.current = zoom
    })
    return unsub
  }, [node.id])

  // ---------------------------------------------------------------------------
  // Events from main process
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const unsub = window.browser.onEvent((eventNodeId, eventName, data) => {
      if (eventNodeId !== node.id) return

      if (eventName === 'did-start-loading') {
        setLoading(true)
      } else if (eventName === 'did-stop-loading') {
        setLoading(false)
        const url = (data as any).url as string
        if (url) {
          setUrlBar(url)
          webviewSrcRef.current = url
          update(node.id, { props: { ...useNodeStore.getState().nodes.get(node.id)?.props, url } })
        }
        captureSnapshot()
      } else if (eventName === 'did-navigate' || eventName === 'did-navigate-in-page') {
        const url = (data as any).url as string
        if (url) {
          setUrlBar(url)
          webviewSrcRef.current = url
          update(node.id, { props: { ...useNodeStore.getState().nodes.get(node.id)?.props, url } })
        }
      } else if (eventName === 'page-title-updated') {
        const title = (data as any).title as string
        if (title) update(node.id, { title })
      } else if (eventName === 'did-fail-load') {
        setLoading(false)
      } else if (eventName === 'new-window') {
        const url = (data as any).url as string
        if (url) add('browser', node.x + 40, node.y + 40, { url })
      } else if (eventName === 'focus') {
        useActivationStore.getState().activate(node.id)
        setFocusedNodeId(node.id)
      }
    })
    return unsub
  }, [node.id, node.x, node.y, update, add, setFocusedNodeId, captureSnapshot])

  // ---------------------------------------------------------------------------
  // Canvas gesture events from WebContentsView preload
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const unsub = window.browser.onCanvasEvent((eventNodeId, channel, data) => {
      if (eventNodeId !== node.id) return
      if (channel === 'canvas:double-tap') zoomFitNode(node.id)
      if (channel === 'canvas:zoom-exit') zoomExit()
      if (channel === 'canvas:wheel') {
        const { deltaY, clientX, clientY, viewportWidth, viewportHeight } = data as any
        const wvRect = webviewAreaRef.current?.getBoundingClientRect()
        if (!wvRect) return
        const scaleX = viewportWidth ? wvRect.width / viewportWidth : 1
        const scaleY = viewportHeight ? wvRect.height / viewportHeight : 1
        const hostX = wvRect.left + clientX * scaleX
        const hostY = wvRect.top + clientY * scaleY
        useCameraStore.getState().zoomAt(hostX, hostY, deltaY)
      }
    })
    return unsub
  }, [node.id])

  // ---------------------------------------------------------------------------
  // Paste handler
  // ---------------------------------------------------------------------------

  useEffect(() => {
    registerBrowserPaster(node.id, async (text: string) => {
      useNodeStore.getState().setFocusedNodeId(node.id)
      window.browser.focus(node.id)

      const js = `
        (() => {
          const text = ${JSON.stringify(text)}
          const active = document.activeElement

          const isTextInput = (el) =>
            el instanceof HTMLTextAreaElement ||
            (el instanceof HTMLInputElement && (!el.type || ['text', 'search', 'url', 'email', 'tel', 'password'].includes(el.type)))

          const insert = (el) => {
            if (!el) return false

            if (isTextInput(el)) {
              const start = typeof el.selectionStart === 'number' ? el.selectionStart : el.value.length
              const end = typeof el.selectionEnd === 'number' ? el.selectionEnd : el.value.length
              el.focus()
              el.setRangeText(text, start, end, 'end')
              el.dispatchEvent(new Event('input', { bubbles: true }))
              el.dispatchEvent(new Event('change', { bubbles: true }))
              return true
            }

            if (el instanceof HTMLElement && el.isContentEditable) {
              el.focus()
              const sel = window.getSelection()
              if (!sel) return false
              if (!sel.rangeCount) {
                const range = document.createRange()
                range.selectNodeContents(el)
                range.collapse(false)
                sel.removeAllRanges()
                sel.addRange(range)
              }
              if (document.execCommand) {
                try {
                  if (document.execCommand('insertText', false, text)) return true
                } catch {}
              }
              const range = sel.getRangeAt(0)
              range.deleteContents()
              range.insertNode(document.createTextNode(text))
              range.collapse(false)
              sel.removeAllRanges()
              sel.addRange(range)
              return true
            }

            return false
          }

          if (insert(active)) return true

          const fallback = document.querySelector('textarea, input:not([type]), input[type="text"], input[type="search"], input[type="url"], [contenteditable="true"], [contenteditable=""], [role="textbox"]')
          return insert(fallback)
        })()
      `

      try {
        return Boolean(await window.browser.executeJS(node.id, js))
      } catch {
        return false
      }
    })

    return () => unregisterBrowserPaster(node.id)
  }, [node.id])

  // ---------------------------------------------------------------------------
  // Controls
  // ---------------------------------------------------------------------------

  const handleBack = useCallback(() => { window.browser.back(node.id) }, [node.id])
  const handleForward = useCallback(() => { window.browser.forward(node.id) }, [node.id])
  const handleReloadStop = useCallback(() => {
    if (loading) {
      window.browser.stop(node.id)
    } else {
      window.browser.reload(node.id)
    }
  }, [loading, node.id])

  const handleUrlKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        let url = (e.currentTarget as HTMLInputElement).value.trim()
        if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
          if (url.includes('.') && !url.includes(' ')) {
            url = 'https://' + url
          } else {
            url = 'https://www.google.com/search?q=' + encodeURIComponent(url)
          }
        }
        setUrlBar(url)
        window.browser.navigate(node.id, url)
      }
    },
    [node.id]
  )

  const handleSessionChange = useCallback((newSessionId: string) => {
    const currentProps = useNodeStore.getState().nodes.get(node.id)?.props ?? {}
    update(node.id, { props: { ...currentProps, sessionId: newSessionId } })
  }, [node.id, update])

  const webviewHeight = node.height - TITLE_H - TOOLBAR_H

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <BaseNode node={node} noCssZoom titleExtra={(() => {
              const gh = parseGitHubRepo(urlBar)
              if (!gh) return null
              return (
                <div
                  draggable
                  title={`Drag to a Files node to clone ${gh.owner}/${gh.repo}`}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/canvaflow-repo', JSON.stringify(gh))
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '0 6px', height: 18, borderRadius: 3,
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: 'rgba(255,255,255,0.55)',
                    fontSize: 10, fontWeight: 500,
                    cursor: 'grab', flexShrink: 0, userSelect: 'none',
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.7 }}>
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
                  </svg>
                  {gh.repo}
                </div>
              )
            })()}>
          {/* Toolbar */}
          <div
            style={{
              height: TOOLBAR_H,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '0 8px',
              background: '#161616',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              flexShrink: 0,
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* Back */}
            <button
              style={{ ...btnBase }}
              title="Back"
              onClick={handleBack}
              onMouseEnter={(e) => Object.assign((e.currentTarget as HTMLElement).style, btnHover)}
              onMouseLeave={(e) => Object.assign((e.currentTarget as HTMLElement).style, btnBase)}
            >
              <svg width="12" height="12" viewBox="0 0 12 12">
                <path d="M6 5l-4 4 4 4M2 9h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
            </button>

            {/* Forward */}
            <button
              style={{ ...btnBase }}
              title="Forward"
              onClick={handleForward}
              onMouseEnter={(e) => Object.assign((e.currentTarget as HTMLElement).style, btnHover)}
              onMouseLeave={(e) => Object.assign((e.currentTarget as HTMLElement).style, btnBase)}
            >
              <svg width="12" height="12" viewBox="0 0 12 12">
                <path d="M4 5l4 4-4 4M10 9H2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
            </button>

            {/* Reload / Stop */}
            <button
              style={{ ...btnBase }}
              title={loading ? 'Stop' : 'Reload'}
              onClick={handleReloadStop}
              onMouseEnter={(e) => Object.assign((e.currentTarget as HTMLElement).style, btnHover)}
              onMouseLeave={(e) => Object.assign((e.currentTarget as HTMLElement).style, btnBase)}
            >
              {loading ? (
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <path d="M9 4.5A4.5 4.5 0 1 0 10 8M9 2v3h-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
              )}
            </button>

            {/* URL input */}
            <input
              type="text"
              value={urlBar}
              onChange={(e) => setUrlBar(e.target.value)}
              onKeyDown={handleUrlKeyDown}
              onFocus={(e) => {
                ;(e.currentTarget as HTMLInputElement).select()
                ;(e.currentTarget as HTMLInputElement).style.borderColor = 'rgba(255,255,255,0.2)'
              }}
              onBlur={(e) => {
                ;(e.currentTarget as HTMLInputElement).style.borderColor = 'rgba(255,255,255,0.08)'
              }}
              style={{
                flex: 1,
                height: 22,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 4,
                color: 'rgba(255,255,255,0.7)',
                fontSize: 11,
                padding: '0 8px',
                outline: 'none',
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              }}
            />

            {/* Session picker */}
            <SessionPicker
              sessionId={sessionId}
              nodeId={node.id}
              onChange={handleSessionChange}
            />
          </div>

          {/* Webview area — placeholder div; actual content rendered by WebContentsView overlay */}
          <div
            ref={webviewAreaRef}
            style={{
              width: '100%',
              height: webviewHeight,
              position: 'relative',
              overflow: 'hidden',
              background: isFocused ? '#ffffff' : '#0d0d0d',
            }}
            onPointerDown={(e) => {
              useActivationStore.getState().activate(node.id)
              setFocusedNodeId(node.id)
              e.stopPropagation()
            }}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('application/canvaflow-session')) {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'copy'
              }
            }}
            onDrop={(e) => {
              const raw = e.dataTransfer.getData('application/canvaflow-session')
              if (raw) {
                e.preventDefault()
                try {
                  const { id } = JSON.parse(raw)
                  handleSessionChange(id)
                } catch {}
              }
            }}
          >
            {isActivated && isThumbnailMode && thumbnail && (
              <img
                src={thumbnail}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                alt="Browser thumbnail"
              />
            )}
            {/* Always in DOM so the screenshot is pre-decoded; shown/hidden imperatively */}
            <img
              ref={frozenImgRef}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', display: 'none', pointerEvents: 'none' }}
              alt=""
            />
            {!isActivated && !screenshotRef.current && <NodePlaceholder icon="browser" />}
          </div>
        </BaseNode>
      </ContextMenuTrigger>

      <ContextMenuContent>
        <ContextMenuSub trigger="Order">
          <ContextMenuItem onClick={() => bringToFront(node.id)}>Bring to Front</ContextMenuItem>
          <ContextMenuItem onClick={() => sendToBack(node.id)}>Send to Back</ContextMenuItem>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem destructive onClick={() => remove(node.id)}>
          Close
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
