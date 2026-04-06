import React, { useEffect, useRef, useState, useCallback } from 'react'
import { DragGhost, DropTargetHighlight } from '../../../renderer/src/components/ui/drag-ghost'
import type { DragGhostTheme } from '../../../renderer/src/components/ui/drag-ghost'
import { NodeData, useNodeStore } from '../../../renderer/src/stores/nodeStore'
import { BaseNode } from '../../../renderer/src/components/BaseNode'
import { useCameraStore } from '../../../renderer/src/stores/cameraStore'
import { useSessionStore } from '../../../renderer/src/stores/sessionStore'
import { useActivationStore } from '../../../renderer/src/stores/activationStore'
import { NodePlaceholder } from '../../../renderer/src/components/NodePlaceholder'
import { useWebviewNodeDrag } from '../../../renderer/src/hooks/useWebviewNodeDrag'
import { getPreparedTrelloExport, primeTrelloExport } from '../utils/trelloDrag'
import { pasteIntoBrowser } from '../../../renderer/src/browserRegistry'
import { ContextMenuItem } from '../../../renderer/src/components/ui/context-menu'
import { TrelloDropModal, TrelloDropPayload } from './TrelloDropModal'
import type { TrelloCard } from '../main/handlers'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string
        partition?: string
        allowpopups?: string
        preload?: string
        useragent?: string
        ref?: React.Ref<HTMLElement>
      }
    }
  }
}

const TITLE_H = 32
const TOOLBAR_H = 36

const TRELLO_GHOST_THEME: DragGhostTheme = {
  background: '#1D2125',
  textColor: 'rgba(255,255,255,0.88)',
  borderColor: 'rgba(255,255,255,0.1)',
  skeletonColor: 'rgba(255,255,255,0.08)',
  footerBorderColor: 'rgba(255,255,255,0.06)',
  badgeBackground: 'rgba(0,121,191,0.12)',
  badgeTextColor: 'rgba(0,180,255,0.85)',
  iconBackground: '#0079BF',
  iconSvg: (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="#fff">
      <rect x="3" y="3" width="7" height="13" rx="1.5"/>
      <rect x="14" y="3" width="7" height="8" rx="1.5"/>
    </svg>
  ),
}
const TRELLO_URL = 'https://trello.com'

function getInitialUrl(props: Record<string, unknown>): string {
  return (props.url as string) || TRELLO_URL
}
const TRELLO_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function getPartition(sessionId: string | undefined, nodeId: string): string {
  if (!sessionId || sessionId === 'default') return 'persist:canvaflow-ws-default'
  if (sessionId === 'private') return `canvaflow-private-${nodeId}`
  return `persist:canvaflow-session-${sessionId}`
}

// ---------------------------------------------------------------------------
// SessionPicker (shared pattern)
// ---------------------------------------------------------------------------

interface SessionPickerProps {
  sessionId: string | undefined
  nodeId: string
  onChange: (id: string) => void
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
        setOpen(false); setCreating(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  useEffect(() => { if (creating && inputRef.current) inputRef.current.focus() }, [creating])

  const label = !sessionId || sessionId === 'default' ? 'Default'
    : sessionId === 'private' ? 'Private'
    : sessions.find((s) => s.id === sessionId)?.name ?? 'Unknown'

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    const session = await add(name)
    onChange(session.id)
    setNewName(''); setCreating(false); setOpen(false)
  }

  return (
    <div ref={pickerRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => setOpen((o) => !o)}
        style={{
          height: 22, padding: '0 8px', borderRadius: 4, flexShrink: 0,
          border: '1px solid rgba(255,255,255,0.1)',
          background: open ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)',
          color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: 500,
          cursor: 'pointer', letterSpacing: '0.02em',
        }}
      >
        {label}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 26, right: 0, zIndex: 1000,
          background: '#1e1e1e', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8, overflow: 'hidden', minWidth: 140,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          {[
            { id: 'default', label: 'Default' },
            { id: 'private', label: 'Private' },
            ...sessions.map((s) => ({ id: s.id, label: s.name })),
          ].map((item) => (
            <div
              key={item.id}
              onClick={() => { onChange(item.id); setOpen(false) }}
              style={{
                padding: '7px 10px', fontSize: 12, cursor: 'pointer',
                color: item.id === (sessionId || 'default') ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.55)',
                background: item.id === (sessionId || 'default') ? 'rgba(255,255,255,0.07)' : 'transparent',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background =
                  item.id === (sessionId || 'default') ? 'rgba(255,255,255,0.07)' : 'transparent'
              }}
            >
              {item.label}
            </div>
          ))}
          {creating ? (
            <div style={{ padding: '6px 8px', display: 'flex', gap: 6 }}>
              <input
                ref={inputRef} value={newName}
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
                  border: 'none', background: '#0079BF', color: '#fff',
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
// CredentialsPanel
// ---------------------------------------------------------------------------

interface CredentialsPanelProps {
  apiKey: string
  token: string
  onSave: (apiKey: string, token: string) => void
  onClose: () => void
}

function CredentialsPanel({ apiKey: initKey, token: initToken, onSave, onClose }: CredentialsPanelProps): React.ReactElement {
  const [apiKey, setApiKey] = useState(initKey)
  const [token, setToken] = useState(initToken)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])

  const openAuthUrl = () => {
    if (!apiKey.trim()) return
    const url = `https://trello.com/1/authorize?expiration=never&name=CanvaFlow&scope=read&response_type=token&key=${apiKey.trim()}`
    window.sessions.login('persist:canvaflow-ws-default', url)
  }

  return (
    <div
      ref={panelRef}
      style={{
        position: 'absolute', top: 30, right: 0, zIndex: 1000,
        background: '#1e1e1e', border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 10, padding: 14, width: 280,
        boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 10, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        Trello API Credentials
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>
          API Key — from{' '}
          <span
            style={{ color: 'rgba(0,180,255,0.7)', cursor: 'pointer', textDecoration: 'underline' }}
            onClick={() => window.sessions.login('persist:canvaflow-ws-default', 'https://trello.com/power-ups/admin')}
          >
            trello.com/power-ups/admin
          </span>
        </div>
        <input
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Enter API key…"
          style={{
            width: '100%', height: 28, borderRadius: 5, boxSizing: 'border-box',
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.8)',
            fontSize: 11, padding: '0 8px', outline: 'none', fontFamily: 'monospace',
          }}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Token</span>
          <span
            onClick={openAuthUrl}
            style={{
              color: apiKey.trim() ? 'rgba(0,121,191,0.8)' : 'rgba(255,255,255,0.2)',
              cursor: apiKey.trim() ? 'pointer' : 'default',
              fontSize: 10, fontWeight: 600, letterSpacing: '0.02em',
            }}
          >
            Get token →
          </span>
        </div>
        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Paste token here…"
          style={{
            width: '100%', height: 28, borderRadius: 5, boxSizing: 'border-box',
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.8)',
            fontSize: 11, padding: '0 8px', outline: 'none', fontFamily: 'monospace',
          }}
        />
      </div>

      <button
        onClick={() => onSave(apiKey.trim(), token.trim())}
        style={{
          width: '100%', height: 28, borderRadius: 5,
          border: 'none', background: '#0079BF', color: '#fff',
          fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        Save
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared button styles
// ---------------------------------------------------------------------------

const btnBase: React.CSSProperties = {
  width: 22, height: 22,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'transparent', border: 'none', borderRadius: 4,
  color: 'rgba(255,255,255,0.25)', cursor: 'pointer', padding: 0, flexShrink: 0,
}
const btnHover: React.CSSProperties = {
  ...btnBase, background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.75)',
}

interface Props { node: NodeData }

// ---------------------------------------------------------------------------
// TrelloNode
// ---------------------------------------------------------------------------

export function TrelloNode({ node }: Props): React.ReactElement {
  const { update, focusedNodeId, setFocusedNodeId } = useNodeStore()
  const isActivated = useActivationStore((s) => !!s.activated[node.id])
  const webviewRef = useRef<any>(null)
  const [preloadPath, setPreloadPath] = useState<string | null>(null)

  const sessionId = node.props.sessionId as string | undefined
  const partition = getPartition(sessionId, node.id)

  const initialUrl = useRef<string>(getInitialUrl(node.props))
  const [loading, setLoading] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [token, setToken] = useState('')
  const [showCredentials, setShowCredentials] = useState(false)
  const [pendingDrop, setPendingDrop] = useState<TrelloDropPayload | null>(null)
  const prefetchedCard = useRef<TrelloCard | null>(null)

  const cameraZoomRef = useRef(useCameraStore.getState().camera.zoom)
  const [isThumbnailMode, setIsThumbnailMode] = useState(useCameraStore.getState().camera.zoom < 0.3)
  const [thumbnail, setThumbnail] = useState<string | null>(null)

  // Suppress the white flash that Electron shows when the webview surface is resized
  const [showResizeOverlay, setShowResizeOverlay] = useState(false)
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resizeMountedRef = useRef(false)
  useEffect(() => {
    if (!resizeMountedRef.current) { resizeMountedRef.current = true; return }
    if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
    setShowResizeOverlay(true)
    resizeTimerRef.current = setTimeout(() => setShowResizeOverlay(false), 120)
  }, [node.width, node.height])

  // Load credentials from appState on mount
  useEffect(() => {
    Promise.all([
      window.appState.get('trello:apiKey'),
      window.appState.get('trello:token'),
    ]).then(([k, t]) => {
      if (k) setApiKey(k)
      if (t) setToken(t)
    })
  }, [])

  const handleSaveCredentials = useCallback((k: string, t: string) => {
    setApiKey(k)
    setToken(t)
    setShowCredentials(false)
    window.appState.set('trello:apiKey', k)
    window.appState.set('trello:token', t)
  }, [])

  // ---------------------------------------------------------------------------
  // Shared drag hook
  // ---------------------------------------------------------------------------

  const handleDrop = useCallback(async (
    data: { cardId: string; title: string },
    target: import('../../../renderer/src/types/dragDrop').DragDropTarget | null,
    clientX: number, clientY: number,
  ) => {
    const { cardId, title } = data

    if (target) {
      let text = title
      const prepared = getPreparedTrelloExport(cardId)
      if (prepared) {
        text = prepared.text
      } else if (apiKey && token) {
        try {
          const result = await primeTrelloExport(apiKey, token, cardId)
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
    }

    // Drop on canvas — show agent picker modal
    const card = prefetchedCard.current
    prefetchedCard.current = null
    setPendingDrop({ cardId, title, clientX, clientY, prefetchedCard: card, apiKey, token, partition })
  }, [apiKey, token, partition])

  const { isDragging, ghostX, ghostY, activeDragTitle, dropTarget, bindWebviewIpc } = useWebviewNodeDrag<{ cardId: string; title: string }>({
    nodeId: node.id,
    channelPrefix: 'trello',
    webviewRef,
    nodeWidth: node.width,
    nodeHeight: node.height,
    titleBarHeight: TITLE_H,
    toolbarHeight: TOOLBAR_H,
    dropTargetTypes: ['terminal', 'browser', 'claude', 'kanban'],
    parseDragStart: useCallback((payload: any) => {
      const { itemId, title } = payload
      if (!itemId) return null
      return { data: { cardId: itemId, title }, title }
    }, []),
    onPrefetch: useCallback((data: { cardId: string; title: string }) => {
      prefetchedCard.current = null
      if (apiKey && token) {
        window.trello.fetchCard(apiKey, token, data.cardId)
          .then((card) => { prefetchedCard.current = card })
          .catch(() => {})
        void primeTrelloExport(apiKey, token, data.cardId).catch(() => {})
      } else {
        window.trello.fetchCardWithSession(partition, data.cardId)
          .then((card) => { prefetchedCard.current = card })
          .catch(() => {})
      }
    }, [apiKey, token, partition]),
    onDrop: handleDrop,
  })

  // ---------------------------------------------------------------------------
  // Preload path
  // ---------------------------------------------------------------------------

  useEffect(() => {
    window.app.trelloPreloadPath().then(setPreloadPath)
  }, [])

  // ---------------------------------------------------------------------------
  // Camera zoom → thumbnail mode
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
  // Webview event listeners
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const wv = webviewRef.current
    if (!wv) return

    const onStart = () => setLoading(true)
    const onStop = () => setLoading(false)
    const onFail = () => setLoading(false)
    const onTitle = (e: any) => { if (e.title) update(node.id, { title: e.title }) }
    const onNavigate = (e: any) => {
      if (e.url) update(node.id, { props: { ...useNodeStore.getState().nodes.get(node.id)?.props, url: e.url } })
    }

    wv.addEventListener('did-start-loading', onStart)
    wv.addEventListener('did-stop-loading', onStop)
    wv.addEventListener('did-fail-load', onFail)
    wv.addEventListener('page-title-updated', onTitle)
    wv.addEventListener('did-navigate', onNavigate)
    wv.addEventListener('did-navigate-in-page', onNavigate)

    const cleanupIpc = bindWebviewIpc(wv)

    return () => {
      wv.removeEventListener('did-start-loading', onStart)
      wv.removeEventListener('did-stop-loading', onStop)
      wv.removeEventListener('did-fail-load', onFail)
      wv.removeEventListener('page-title-updated', onTitle)
      wv.removeEventListener('did-navigate', onNavigate)
      wv.removeEventListener('did-navigate-in-page', onNavigate)
      cleanupIpc()
    }
  }, [node.id, preloadPath, update, bindWebviewIpc, isActivated])

  const handleReload = useCallback(() => {
    if (!webviewRef.current) return
    try {
      if (loading) { ;(webviewRef.current as any).stop() }
      else { ;(webviewRef.current as any).reload() }
    } catch {}
  }, [loading])

  const handleLogin = useCallback(async () => {
    setLoggingIn(true)
    try {
      await window.sessions.login(partition, TRELLO_URL + '/login')
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
  const hasCredentials = apiKey.length > 0 && token.length > 0

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
            {/* Logo + label */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <div style={{
                width: 18, height: 18, borderRadius: 4,
                background: '#0079BF',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="#fff">
                  <rect x="3" y="3" width="7" height="13" rx="1.5"/>
                  <rect x="14" y="3" width="7" height="8" rx="1.5"/>
                </svg>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.02em' }}>
                Trello
              </span>
            </div>

            <div style={{ flex: 1 }} />

            {/* Reload */}
            <button
              style={btnBase}
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

            {/* Log in */}
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={handleLogin}
              disabled={loggingIn}
              title="Open Trello login"
              style={{
                height: 22, padding: '0 9px', borderRadius: 4,
                border: '1px solid rgba(255,255,255,0.1)',
                background: loggingIn ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.06)',
                color: loggingIn ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.55)',
                fontSize: 10, fontWeight: 500, cursor: loggingIn ? 'default' : 'pointer',
                letterSpacing: '0.02em', flexShrink: 0,
              }}
            >
              {loggingIn ? 'Waiting…' : 'Log in'}
            </button>

            {/* API credentials button */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setShowCredentials((v) => !v)}
                title={hasCredentials ? 'API credentials (connected)' : 'Connect API (required for card content)'}
                style={{
                  ...btnBase,
                  color: hasCredentials ? 'rgba(0,180,100,0.7)' : 'rgba(255,165,0,0.6)',
                }}
                onMouseEnter={(e) => Object.assign((e.currentTarget as HTMLElement).style, { ...btnHover, color: hasCredentials ? 'rgba(0,200,120,0.9)' : 'rgba(255,190,50,0.9)' })}
                onMouseLeave={(e) => Object.assign((e.currentTarget as HTMLElement).style, { ...btnBase, color: hasCredentials ? 'rgba(0,180,100,0.7)' : 'rgba(255,165,0,0.6)' })}
              >
                <svg width="11" height="11" viewBox="0 0 20 20" fill="none">
                  <path d="M7 10a3 3 0 1 0 6 0 3 3 0 0 0-6 0zm-4 0a7 7 0 1 1 14 0A7 7 0 0 1 3 10z" fill="currentColor"/>
                  <path d="M13 10h5M2 10H1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
              {showCredentials && (
                <CredentialsPanel
                  apiKey={apiKey}
                  token={token}
                  onSave={handleSaveCredentials}
                  onClose={() => setShowCredentials(false)}
                />
              )}
            </div>

            <SessionPicker sessionId={sessionId} nodeId={node.id} onChange={handleSessionChange} />
          </div>

          {/* Webview area */}
          <div
            style={{ width: '100%', height: webviewHeight, position: 'relative', overflow: 'hidden', background: '#1D2125' }}
            onPointerDown={(e) => { useActivationStore.getState().activate(node.id); e.stopPropagation() }}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('application/canvaflow-session')) {
                e.preventDefault(); e.dataTransfer.dropEffect = 'copy'
              }
            }}
            onDrop={(e) => {
              const raw = e.dataTransfer.getData('application/canvaflow-session')
              if (raw) {
                e.preventDefault()
                try { const { id } = JSON.parse(raw); handleSessionChange(id) } catch {}
              }
            }}
          >
            {isActivated && preloadPath && (
              <webview
                key={partition}
                ref={webviewRef}
                src={initialUrl.current}
                partition={partition}
                preload={preloadPath}
                allowpopups=""
                useragent={TRELLO_UA}
                style={{ width: '100%', height: '100%', display: 'flex' }}
              />
            )}
            {isActivated && isThumbnailMode && thumbnail && (
              <img
                src={thumbnail}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                alt="Trello thumbnail"
              />
            )}
            {isActivated && showResizeOverlay && !isThumbnailMode && (
              <div style={{ position: 'absolute', inset: 0, zIndex: 5, background: '#1D2125', pointerEvents: 'none' }} />
            )}
            {!isActivated && <NodePlaceholder icon="trello" />}
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

    {dropTarget && <DropTargetHighlight target={dropTarget} accentColor="rgba(0,121,191,0.65)" />}
    {isDragging && <DragGhost ghostX={ghostX} ghostY={ghostY} title={activeDragTitle} theme={TRELLO_GHOST_THEME} />}

    {pendingDrop && (
      <TrelloDropModal payload={pendingDrop} onClose={() => setPendingDrop(null)} />
    )}
    </>
  )
}
