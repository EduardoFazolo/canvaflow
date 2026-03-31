import React, { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { NodeData, useNodeStore } from '../../../renderer/src/stores/nodeStore'
import { BaseNode } from '../../../renderer/src/components/BaseNode'
import { useCameraStore } from '../../../renderer/src/stores/cameraStore'
import { useSessionStore } from '../../../renderer/src/stores/sessionStore'
import { useActivationStore } from '../../../renderer/src/stores/activationStore'
import { NodePlaceholder } from '../../../renderer/src/components/NodePlaceholder'
import { useCanvasDrag } from '../../../renderer/src/hooks/useCanvasDrag'
import { getPreparedNotionExternalDrag, primeNotionExternalDrag } from '../utils/notionDrag'
import { NotionDropModal, NotionDropPayload } from './NotionDropModal'
import { pasteIntoBrowser } from '../../../renderer/src/browserRegistry'
import { useKanbanStore } from '../../kanban/store'
import { nanoid } from 'nanoid'
import { ContextMenuItem } from '../../../renderer/src/components/ui/context-menu'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string
        partition?: string
        allowpopups?: string
        preload?: string
        ref?: React.Ref<HTMLElement>
      }
    }
  }
}

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

function SessionPicker({ sessionId, onChange }: SessionPickerProps): React.ReactElement {
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

// ---------------------------------------------------------------------------
// NotionNode
// ---------------------------------------------------------------------------

const btnBase: React.CSSProperties = {
  width: 22, height: 22,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'transparent', border: 'none', borderRadius: 4,
  color: 'rgba(255,255,255,0.25)', cursor: 'pointer', padding: 0, flexShrink: 0,
}
const btnHover: React.CSSProperties = {
  ...btnBase,
  background: 'rgba(255,255,255,0.07)',
  color: 'rgba(255,255,255,0.75)',
}

interface DragDropTarget {
  nodeId: string
  nodeType: 'terminal' | 'browser' | 'claude' | 'kanban'
  title: string
  left: number
  top: number
  width: number
  height: number
}

interface Props {
  node: NodeData
}

export function NotionNode({ node }: Props): React.ReactElement {
  const { update, focusedNodeId, setFocusedNodeId } = useNodeStore()
  const isActivated = useActivationStore((s) => !!s.activated[node.id])
  const webviewRef = useRef<any>(null)
  const [preloadPath, setPreloadPath] = useState<string | null>(null)

  const sessionId = node.props.sessionId as string | undefined
  const partition = getPartition(sessionId, node.id)

  const [loading, setLoading] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)

  const [pendingDrop, setPendingDrop] = useState<NotionDropPayload | null>(null)

  // Drag data stored in a ref so the drop callback doesn't need to re-subscribe
  const dragDataRef = useRef<{ pageId: string; title: string } | null>(null)
  const [activeDragTitle, setActiveDragTitle] = useState('')
  const prevWebviewPos = useRef({ x: 0, y: 0 })
  const webviewViewport = useRef({ width: 0, height: 0 })
  const prefetchedChunk = useRef<any>(null)

  const [dropTarget, setDropTarget] = useState<DragDropTarget | null>(null)
  const dropTargetRef = useRef<DragDropTarget | null>(null)
  useEffect(() => { dropTargetRef.current = dropTarget }, [dropTarget])

  const cameraZoomRef = useRef(useCameraStore.getState().camera.zoom)
  const [isThumbnailMode, setIsThumbnailMode] = useState(
    useCameraStore.getState().camera.zoom < 0.3
  )
  const [thumbnail, setThumbnail] = useState<string | null>(null)

  // ---------------------------------------------------------------------------
  // Drop target detection
  // ---------------------------------------------------------------------------

  const getDropTargetAt = useCallback((clientX: number, clientY: number): DragDropTarget | null => {
    const canvasEl = document.querySelector('[data-canvas-root]')
    const canvasRect = canvasEl?.getBoundingClientRect()
    if (!canvasRect) return null

    const { camera } = useCameraStore.getState()
    const candidates = Array.from(useNodeStore.getState().nodes.values())
      .filter((candidate) =>
        candidate.id !== node.id &&
        (candidate.type === 'terminal' || candidate.type === 'browser' || candidate.type === 'claude' || candidate.type === 'kanban')
      )
      .map((candidate) => {
        const left = canvasRect.left + camera.x + candidate.x * camera.zoom
        const top = canvasRect.top + camera.y + candidate.y * camera.zoom
        const width = candidate.width * camera.zoom
        const height = (candidate.minimized ? 32 : candidate.height) * camera.zoom
        return { candidate, left, top, width, height }
      })
      .filter(({ left, top, width, height }) =>
        clientX >= left &&
        clientX <= left + width &&
        clientY >= top &&
        clientY <= top + height
      )
      .sort((a, b) => b.candidate.zIndex - a.candidate.zIndex)

    const hit = candidates[0]
    if (!hit) return null

    return {
      nodeId: hit.candidate.id,
      nodeType: hit.candidate.type as 'terminal' | 'browser' | 'claude' | 'kanban',
      title: hit.candidate.title,
      left: hit.left,
      top: hit.top,
      width: hit.width,
      height: hit.height,
    }
  }, [node.id])

  // ---------------------------------------------------------------------------
  // Core drag hook
  // ---------------------------------------------------------------------------

  const { isDragging, ghostX, ghostY, startDrag, nudge, cancel } = useCanvasDrag({
    onMove: useCallback((clientX: number, clientY: number) => {
      setDropTarget(getDropTargetAt(clientX, clientY))
    }, [getDropTargetAt]),

    onDrop: useCallback(async (clientX: number, clientY: number) => {
      setDropTarget(null)
      const data = dragDataRef.current
      if (!data) return
      dragDataRef.current = null
      const { pageId, title } = data

      const target = dropTargetRef.current

      if (target) {
        let text = title
        const prepared = getPreparedNotionExternalDrag(partition, pageId)
        if (prepared) {
          text = prepared.text
        } else {
          try {
            const result = await primeNotionExternalDrag(partition, pageId, title)
            text = result.text
          } catch {}
        }

        if (target.nodeType === 'terminal' || target.nodeType === 'claude') {
          useNodeStore.getState().setFocusedNodeId(target.nodeId)
          window.terminal.write(target.nodeId, text)
          return
        }
        if (target.nodeType === 'browser') {
          await pasteIntoBrowser(target.nodeId, text)
          return
        }
        if (target.nodeType === 'kanban') {
          const { state, setState } = useKanbanStore.getState()
          const board = state.boards.find((b) => b.id === state.activeBoardId)
          if (board && board.columns.length > 0) {
            const firstCol = board.columns[0]
            const newCard = { id: nanoid(8), title, description: text !== title ? text : undefined }
            const newColumns = board.columns.map((c) =>
              c.id === firstCol.id ? { ...c, cards: [...c.cards, newCard] } : c
            )
            setState({ ...state, boards: state.boards.map((b) => b.id === board.id ? { ...b, columns: newColumns } : b) })
          }
          return
        }
      }

      // Drop on canvas — show agent picker modal
      prefetchedChunk.current = null
      setPendingDrop({ title, pageId, partition, clientX, clientY })
    }, [partition]),
  })

  // ---------------------------------------------------------------------------
  // 1. Fetch preload path once
  // ---------------------------------------------------------------------------

  useEffect(() => {
    window.app.notionPreloadPath().then(setPreloadPath)
  }, [])

  // ---------------------------------------------------------------------------
  // 2. Camera zoom subscription for thumbnail mode
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const unsub = useCameraStore.subscribe((s) => {
      const zoom = s.camera.zoom
      const wasBelow = cameraZoomRef.current < 0.3
      const isBelow = zoom < 0.3
      if (!wasBelow && isBelow) {
        if (webviewRef.current) {
          try {
            ;(webviewRef.current as any).capturePage().then((img: any) => {
              setThumbnail(img.toDataURL())
            }).catch(() => {})
          } catch {}
        }
        setIsThumbnailMode(true)
      }
      if (wasBelow && !isBelow) setIsThumbnailMode(false)
      cameraZoomRef.current = zoom
    })
    return unsub
  }, [])

  // ---------------------------------------------------------------------------
  // 3a. Host-side Meta key detection
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const exec = (js: string) => {
      try { ;(webviewRef.current as any)?.executeJavaScript(js) } catch {}
    }
    const onDown = (e: KeyboardEvent) => {
      if (e.key === 'Meta') exec('window.__canvaflow_setMode&&window.__canvaflow_setMode(true)')
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.key === 'Meta') exec('window.__canvaflow_setMode&&window.__canvaflow_setMode(false)')
    }
    document.addEventListener('keydown', onDown)
    document.addEventListener('keyup', onUp)
    return () => {
      document.removeEventListener('keydown', onDown)
      document.removeEventListener('keyup', onUp)
    }
  }, [])

  // ---------------------------------------------------------------------------
  // 3b. Webview event listeners
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const wv = webviewRef.current
    if (!wv) return

    const onStart = () => setLoading(true)
    const onStop = () => setLoading(false)
    const onFail = () => setLoading(false)
    const onTitle = (e: any) => {
      if (e.title) update(node.id, { title: e.title })
    }

    wv.addEventListener('did-start-loading', onStart)
    wv.addEventListener('did-stop-loading', onStop)
    wv.addEventListener('did-fail-load', onFail)
    wv.addEventListener('page-title-updated', onTitle)

    // IPC messages from webview preload — intentionally synchronous, no awaits
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
      if (channel === 'notion:drag-start') {
        const { pageId, title, x, y, viewportWidth, viewportHeight } = args[0]
        prevWebviewPos.current = { x, y }
        webviewViewport.current = { width: viewportWidth ?? 0, height: viewportHeight ?? 0 }
        prefetchedChunk.current = null
        dragDataRef.current = { pageId, title }
        setActiveDragTitle(title)
        setDropTarget(null)
        // Use cursor ratio within the webview viewport → converts correctly regardless of
        // DPR, camera zoom, or any CSS zoom Notion applies to its own content.
        const wvRect = (webviewRef.current as HTMLElement)?.getBoundingClientRect()
        const initX = (wvRect && viewportWidth)  ? wvRect.left + (x / viewportWidth)  * wvRect.width  : undefined
        const initY = (wvRect && viewportHeight) ? wvRect.top  + (y / viewportHeight) * wvRect.height : undefined
        startDrag(initX, initY)
        // Prefetch page content fire-and-forget
        window.notion.fetchPage(partition, pageId)
          .then(chunk => { prefetchedChunk.current = chunk })
          .catch(() => {})
        void primeNotionExternalDrag(partition, pageId, title).catch(() => {})
      } else if (channel === 'notion:drag-move') {
        const { x, y } = args[0]
        const dx = x - prevWebviewPos.current.x
        const dy = y - prevWebviewPos.current.y
        prevWebviewPos.current = { x, y }
        const rect = (webviewRef.current as HTMLElement).getBoundingClientRect()
        const { width: vpW, height: vpH } = webviewViewport.current
        const scaleX = vpW > 0 ? rect.width  / vpW : rect.width  / node.width
        const scaleY = vpH > 0 ? rect.height / vpH : rect.height / (node.height - TITLE_H - TOOLBAR_H)
        nudge(dx * scaleX, dy * scaleY)
      } else if (channel === 'notion:drag-cancel') {
        prefetchedChunk.current = null
        dragDataRef.current = null
        setDropTarget(null)
        cancel()
      }
    }
    wv.addEventListener('ipc-message', onIpcMessage)

    return () => {
      wv.removeEventListener('did-start-loading', onStart)
      wv.removeEventListener('did-stop-loading', onStop)
      wv.removeEventListener('did-fail-load', onFail)
      wv.removeEventListener('page-title-updated', onTitle)
      wv.removeEventListener('ipc-message', onIpcMessage)
    }
  }, [node.id, partition, preloadPath, update, startDrag, nudge, cancel, isActivated])

  const handleReload = useCallback(() => {
    if (!webviewRef.current) return
    try {
      if (loading) {
        ;(webviewRef.current as any).stop()
      } else {
        ;(webviewRef.current as any).reload()
      }
    } catch {}
  }, [loading])

  const handleLogin = useCallback(async () => {
    setLoggingIn(true)
    try {
      await window.sessions.login(partition, 'https://www.notion.so/login')
      try { ;(webviewRef.current as any)?.reload() } catch {}
    } finally {
      setLoggingIn(false)
    }
  }, [partition])

  const handleSessionChange = useCallback((newSessionId: string) => {
    const currentProps = useNodeStore.getState().nodes.get(node.id)?.props ?? {}
    update(node.id, { props: { ...currentProps, sessionId: newSessionId } })
  }, [node.id, update])

  const webviewHeight = node.height - TITLE_H - TOOLBAR_H

  return (
    <>
        <BaseNode node={node} contextMenuExtra={
          <ContextMenuItem onClick={() => update(node.id, { minimized: !node.minimized })}>
            {node.minimized ? 'Restore' : 'Minimize'}
          </ContextMenuItem>
        }>
          {/* Toolbar */}
          <div
            style={{
              height: TOOLBAR_H,
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '0 8px',
              background: '#161616',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              flexShrink: 0,
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <div style={{
                width: 18, height: 18, borderRadius: 4,
                background: '#f6f5f4', color: '#111',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="10" height="10" viewBox="0 0 14 14" fill="currentColor">
                  <path d="M3.08 2.17c1.65-.12 4.16-.18 5.62-.16 1.58.02 2.08.44 2.14 1.95.08 1.68.08 4.22 0 5.9-.06 1.48-.52 1.91-2.03 1.96-1.61.06-4.15.06-5.79 0-1.43-.05-1.95-.5-2.02-1.86-.08-1.73-.09-4.36 0-6.08.07-1.34.59-1.6 2.08-1.71Zm.45 1.36v6.95h6.94V3.53H3.53Zm1.26 1.17h3.95v.91H6.99v3.09h-.98V5.61H4.79V4.7Z"/>
                </svg>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.02em' }}>
                Notion
              </span>
            </div>

            <div style={{ flex: 1 }} />

            <button
              style={{ ...btnBase }}
              title={loading ? 'Stop' : 'Reload'}
              onClick={handleReload}
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

            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={handleLogin}
              disabled={loggingIn}
              title="Open Notion login in a separate window"
              style={{
                height: 22, padding: '0 9px',
                borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)',
                background: loggingIn ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.06)',
                color: loggingIn ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.55)',
                fontSize: 10, fontWeight: 500,
                cursor: loggingIn ? 'default' : 'pointer',
                letterSpacing: '0.02em', flexShrink: 0,
              }}
            >
              {loggingIn ? 'Waiting…' : 'Log in'}
            </button>

            <SessionPicker sessionId={sessionId} nodeId={node.id} onChange={handleSessionChange} />
          </div>

          {/* Webview area */}
          <div
            style={{ width: '100%', height: webviewHeight, position: 'relative', overflow: 'hidden', background: isActivated ? '#ffffff' : '#0d0d0d' }}
            onPointerDown={(e) => { useActivationStore.getState().activate(node.id); e.stopPropagation() }}
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
            {isActivated && preloadPath && (
              <webview
                key={partition}
                ref={webviewRef}
                src="https://www.notion.so"
                partition={partition}
                preload={preloadPath}
                allowpopups=""
                style={{ width: '100%', height: '100%', display: 'flex' }}
              />
            )}
            {isActivated && isThumbnailMode && thumbnail && (
              <img
                src={thumbnail}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                alt="Notion thumbnail"
              />
            )}
            {!isActivated && <NodePlaceholder icon="notion" />}
            {isActivated && focusedNodeId !== node.id && (
              <div
                style={{ position: 'absolute', inset: 0, zIndex: 10, cursor: 'default' }}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  setFocusedNodeId(node.id)
                  setTimeout(() => (webviewRef.current as any)?.focus(), 0)
                }}
              />
            )}
          </div>
        </BaseNode>

    {/* Drop target highlight */}
    {dropTarget && createPortal(
      <div style={{
        position: 'fixed',
        left: dropTarget.left,
        top: dropTarget.top,
        width: dropTarget.width,
        height: dropTarget.height,
        zIndex: 999998,
        pointerEvents: 'none',
        borderRadius: 8,
        border: '1.5px solid rgba(167,139,250,0.65)',
        background: 'rgba(167,139,250,0.12)',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06), 0 0 0 1px rgba(167,139,250,0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        boxSizing: 'border-box',
      }}>
        <div style={{
          background: 'rgba(19,16,29,0.92)',
          color: 'rgba(255,255,255,0.9)',
          borderRadius: 999,
          padding: '8px 14px',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.01em',
          boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
          textAlign: 'center',
        }}>
          {dropTarget.nodeType === 'claude' ? 'Drop to send to Claude' : dropTarget.nodeType === 'terminal' ? 'Drop to copy into terminal' : dropTarget.nodeType === 'kanban' ? 'Drop to add to Kanban' : 'Drop to copy into browser'}
        </div>
      </div>,
      document.body
    )}

    {/* Drag ghost — portalled to body to escape canvas CSS transform */}
    {isDragging && createPortal(
      <div style={{
        position: 'fixed',
        left: ghostX - 120,
        top: ghostY - 24,
        zIndex: 999999,
        pointerEvents: 'none',
        width: 240,
        background: '#ffffff',
        border: '1px solid rgba(55,53,47,0.12)',
        borderRadius: 6,
        boxShadow: '0 8px 32px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.10)',
        transform: 'rotate(1.5deg) scale(1.03)',
        transformOrigin: '50% 20%',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}>
        <div style={{ padding: '10px 12px 8px' }}>
          <div style={{
            fontSize: 13, fontWeight: 600, color: '#37352f',
            lineHeight: 1.4, marginBottom: 8, wordBreak: 'break-word',
          }}>
            {activeDragTitle || 'Untitled'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ height: 7, borderRadius: 3, background: 'rgba(55,53,47,0.08)', width: '85%' }} />
            <div style={{ height: 7, borderRadius: 3, background: 'rgba(55,53,47,0.08)', width: '65%' }} />
          </div>
        </div>
        <div style={{
          padding: '5px 12px 8px',
          borderTop: '1px solid rgba(55,53,47,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'rgba(124,58,237,0.08)', borderRadius: 20,
            padding: '2px 7px', fontSize: 10, fontWeight: 600,
            color: 'rgba(109,40,217,0.85)', letterSpacing: '0.01em',
          }}>
            <svg width="7" height="7" viewBox="0 0 10 10" fill="none">
              <path d="M5 1v6M2 5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Drop on canvas
          </div>
          <div style={{
            width: 16, height: 16, borderRadius: 3, background: '#f1f0ef',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="9" height="9" viewBox="0 0 14 14" fill="#37352f">
              <path d="M3.08 2.17c1.65-.12 4.16-.18 5.62-.16 1.58.02 2.08.44 2.14 1.95.08 1.68.08 4.22 0 5.9-.06 1.48-.52 1.91-2.03 1.96-1.61.06-4.15.06-5.79 0-1.43-.05-1.95-.5-2.02-1.86-.08-1.73-.09-4.36 0-6.08.07-1.34.59-1.6 2.08-1.71Zm.45 1.36v6.95h6.94V3.53H3.53Zm1.26 1.17h3.95v.91H6.99v3.09h-.98V5.61H4.79V4.7Z"/>
            </svg>
          </div>
        </div>
      </div>,
      document.body
    )}
    {pendingDrop && (
      <NotionDropModal
        payload={pendingDrop}
        onClose={() => setPendingDrop(null)}
      />
    )}
    </>
  )
}
