import React, { useEffect, useRef, useState, useCallback } from 'react'
import { NodeData, useNodeStore } from '../../../renderer/src/stores/nodeStore'
import { BaseNode } from '../../../renderer/src/components/BaseNode'
import { useCameraStore } from '../../../renderer/src/stores/cameraStore'
import { useSessionStore } from '../../../renderer/src/stores/sessionStore'
import { useActivationStore } from '../../../renderer/src/stores/activationStore'
import { NodePlaceholder } from '../../../renderer/src/components/NodePlaceholder'
import { zoomFitNode, zoomExit } from '../../../renderer/src/utils/zoomFocus'
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
const LOVABLE_URL = 'https://lovable.dev'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPartition(sessionId: string | undefined, nodeId: string): string {
  if (!sessionId || sessionId === 'default') return 'persist:canvaflow-lovable-default'
  if (sessionId === 'private') return `canvaflow-lovable-private-${nodeId}`
  return `persist:canvaflow-session-${sessionId}`
}

function isAuthUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return (
      u.pathname.includes('/auth/') ||
      u.pathname.includes('/login') ||
      u.pathname.includes('/sign-in') ||
      u.pathname.includes('/signin')
    )
  } catch {
    return false
  }
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
// Prompt overlay
// ---------------------------------------------------------------------------

type OverlayState = 'hidden' | 'sending' | 'sent'

interface PromptOverlayProps {
  state: OverlayState
  prompt: string
}

function PromptOverlay({ state, prompt }: PromptOverlayProps): React.ReactElement {
  const visible = state !== 'hidden'
  const done = state === 'sent'

  const truncated = prompt.length > 120 ? prompt.slice(0, 117) + '…' : prompt

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        height: 110,
        background: 'rgba(10, 10, 10, 0.94)',
        backdropFilter: 'blur(16px)',
        borderTop: done
          ? '1px solid rgba(34,197,94,0.3)'
          : '1px solid rgba(251,146,60,0.25)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '10px 14px',
        zIndex: 20,
        transform: visible ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.22s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.3s ease',
        pointerEvents: 'none',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Claude icon */}
        <div style={{
          width: 16, height: 16, borderRadius: 3,
          background: 'rgba(167,139,250,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="9" height="9" viewBox="0 0 16 16" fill="none">
            <path d="M8 2L13 5V11L8 14L3 11V5L8 2Z" stroke="rgba(167,139,250,0.9)" strokeWidth="1.2" fill="none"/>
          </svg>
        </div>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.04em' }}>
          Claude Code
        </span>
        <svg width="14" height="8" viewBox="0 0 14 8" fill="none" style={{ margin: '0 2px' }}>
          <path d="M1 4h10M8 1l3 3-3 3" stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        {/* Lovable flame */}
        <div style={{
          width: 16, height: 16, borderRadius: 3,
          background: 'rgba(251,146,60,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="8" height="10" viewBox="0 0 10 13" fill="none">
            <path d="M5 0.5C5 0.5 2 4 2 6.5C2 8.43 3.57 10 5.5 10C7.43 10 9 8.43 9 6.5C9 5.2 8.3 4.1 7.3 3.5C7.3 3.5 7 5 5.8 5.6C5.8 5.6 6.5 3 5 0.5Z" fill="rgba(251,146,60,0.85)"/>
          </svg>
        </div>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.04em' }}>
          Lovable
        </span>

        <div style={{ flex: 1 }} />

        {done ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <circle cx="6" cy="6" r="5" fill="rgba(34,197,94,0.2)"/>
              <path d="M3.5 6l2 2 3-3.5" stroke="rgba(34,197,94,0.9)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span style={{ fontSize: 10, color: 'rgba(34,197,94,0.85)', letterSpacing: '0.04em' }}>Sent</span>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <SpinnerDot />
            <span style={{ fontSize: 10, color: 'rgba(251,146,60,0.75)', letterSpacing: '0.04em' }}>Sending…</span>
          </div>
        )}
      </div>

      {/* Prompt preview */}
      <div style={{
        flex: 1,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 5,
        padding: '6px 9px',
        fontSize: 11,
        lineHeight: '1.5',
        color: 'rgba(255,255,255,0.55)',
        overflow: 'hidden',
        fontFamily: 'inherit',
      }}>
        {truncated}
      </div>
    </div>
  )
}

function SpinnerDot(): React.ReactElement {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % 3), 400)
    return () => clearInterval(id)
  }, [])
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: 3, height: 3, borderRadius: '50%',
            background: i === frame ? 'rgba(251,146,60,0.9)' : 'rgba(251,146,60,0.3)',
            transition: 'background 0.2s ease',
          }}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// LovableNode
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

interface Props {
  node: NodeData
}

export function LovableNode({ node }: Props): React.ReactElement {
  const { update, focusedNodeId, setFocusedNodeId } = useNodeStore()
  const isActivated = useActivationStore((s) => !!s.activated[node.id])
  const webviewRef = useRef<any>(null)
  const [preloadPath, setPreloadPath] = useState<string | null>(null)

  const sessionId = node.props.sessionId as string | undefined
  const partition = getPartition(sessionId, node.id)

  const [loading, setLoading] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)
  const [currentUrl, setCurrentUrl] = useState(LOVABLE_URL)

  // Prompt overlay state
  const [overlayState, setOverlayState] = useState<OverlayState>('hidden')
  const [pendingPrompt, setPendingPrompt] = useState('')
  const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ---------------------------------------------------------------------------
  // Load preload path on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    window.lovable.preloadPath().then(setPreloadPath).catch(() => {})
  }, [])

  // ---------------------------------------------------------------------------
  // Report status to main process whenever login state or URL changes
  // ---------------------------------------------------------------------------

  useEffect(() => {
    window.lovable.reportStatus(node.id, { loggedIn, url: currentUrl }).catch(() => {})
  }, [node.id, loggedIn, currentUrl])

  // ---------------------------------------------------------------------------
  // Listen for inject-prompt from main process (via MCP)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const unsub = window.lovable.onInjectPrompt((targetNodeId, prompt) => {
      // Accept if targeting this node or broadcast (null = any node)
      if (targetNodeId !== null && targetNodeId !== node.id) return
      if (!webviewRef.current) return

      // Clear any previous timer
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current)

      setPendingPrompt(prompt)
      setOverlayState('sending')

      // Inject after a beat so the user sees the overlay first
      overlayTimerRef.current = setTimeout(() => {
        try {
          ;(webviewRef.current as any).executeJavaScript(buildInjectionScript(prompt))
        } catch {}

        setOverlayState('sent')

        overlayTimerRef.current = setTimeout(() => {
          setOverlayState('hidden')
        }, 1600)
      }, 750)
    })
    return () => {
      unsub()
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current)
    }
  }, [node.id])

  // ---------------------------------------------------------------------------
  // Webview event listeners
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const wv = webviewRef.current
    if (!wv) return

    const onStart = () => setLoading(true)
    const onStop = () => setLoading(false)
    const onFail = () => setLoading(false)

    const onNavigate = (e: any) => {
      const url: string = e.url ?? ''
      setCurrentUrl(url)
      setLoggedIn(url.startsWith(LOVABLE_URL) && !isAuthUrl(url))
    }

    const onIpcMessage = (e: any) => {
      const { channel, args } = e
      if (channel === 'canvas:double-tap') {
        zoomFitNode(node.id)
      } else if (channel === 'canvas:zoom-exit') {
        zoomExit()
      } else if (channel === 'canvas:wheel') {
        const { deltaY, clientX, clientY, viewportWidth, viewportHeight } = args[0]
        const wvRect = (webviewRef.current as HTMLElement | null)?.getBoundingClientRect()
        if (!wvRect) return
        const scaleX = viewportWidth ? wvRect.width / viewportWidth : 1
        const scaleY = viewportHeight ? wvRect.height / viewportHeight : 1
        const hostX = wvRect.left + clientX * scaleX
        const hostY = wvRect.top + clientY * scaleY
        useCameraStore.getState().zoomAt(hostX, hostY, deltaY)
      }
    }

    wv.addEventListener('did-start-loading', onStart)
    wv.addEventListener('did-stop-loading', onStop)
    wv.addEventListener('did-fail-load', onFail)
    wv.addEventListener('did-navigate', onNavigate)
    wv.addEventListener('did-navigate-in-page', onNavigate)
    wv.addEventListener('ipc-message', onIpcMessage)

    return () => {
      wv.removeEventListener('did-start-loading', onStart)
      wv.removeEventListener('did-stop-loading', onStop)
      wv.removeEventListener('did-fail-load', onFail)
      wv.removeEventListener('did-navigate', onNavigate)
      wv.removeEventListener('did-navigate-in-page', onNavigate)
      wv.removeEventListener('ipc-message', onIpcMessage)
    }
  }, [node.id])

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

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
      await window.sessions.login(partition, LOVABLE_URL + '/auth/sign-in')
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
            <ContextMenuItem onClick={() => update(node.id, { minimized: !node.minimized ? 1 : 0 })}>
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
              {/* Brand */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <div style={{
                  width: 18, height: 18, borderRadius: 4,
                  background: 'rgba(251,146,60,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {/* Lovable flame icon */}
                  <svg width="9" height="11" viewBox="0 0 10 13" fill="none">
                    <path
                      d="M5 0.5C5 0.5 2 4 2 6.5C2 8.43 3.57 10 5.5 10C7.43 10 9 8.43 9 6.5C9 5.2 8.3 4.1 7.3 3.5C7.3 3.5 7 5 5.8 5.6C5.8 5.6 6.5 3 5 0.5Z"
                      fill="rgba(251,146,60,0.85)"
                    />
                  </svg>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.02em' }}>
                  Lovable
                </span>
              </div>

              <div style={{ flex: 1 }} />

              {/* MCP status pill */}
              <McpIndicator active={overlayState !== 'hidden'} />

              {/* Reload / stop */}
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

              {/* Login button */}
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={handleLogin}
                disabled={loggingIn}
                title={loggedIn ? 'Logged in to Lovable' : 'Log in to Lovable'}
                style={{
                  height: 22, padding: '0 9px',
                  borderRadius: 4,
                  border: loggedIn
                    ? '1px solid rgba(34,197,94,0.2)'
                    : '1px solid rgba(255,255,255,0.1)',
                  background: loggedIn
                    ? 'rgba(34,197,94,0.06)'
                    : loggingIn ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.06)',
                  color: loggedIn
                    ? 'rgba(34,197,94,0.7)'
                    : loggingIn ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.55)',
                  fontSize: 10, fontWeight: 500,
                  cursor: loggingIn ? 'default' : 'pointer',
                  letterSpacing: '0.02em', flexShrink: 0,
                  display: 'flex', alignItems: 'center', gap: 4,
                  transition: 'background 0.2s, color 0.2s, border-color 0.2s',
                }}
              >
                {loggedIn && (
                  <svg width="7" height="7" viewBox="0 0 8 8" fill="none">
                    <circle cx="4" cy="4" r="3" fill="rgba(34,197,94,0.7)"/>
                  </svg>
                )}
                {loggingIn ? 'Waiting…' : loggedIn ? 'Logged in' : 'Log in'}
              </button>

              <SessionPicker sessionId={sessionId} nodeId={node.id} onChange={handleSessionChange} />
            </div>

            {/* Webview area */}
            <div
              style={{
                width: '100%', height: webviewHeight,
                position: 'relative', overflow: 'hidden',
                background: isActivated ? '#ffffff' : '#0d0d0d',
              }}
              onPointerDown={(e) => { useActivationStore.getState().activate(node.id); e.stopPropagation() }}
            >
              {isActivated && preloadPath && (
                <webview
                  key={partition}
                  ref={webviewRef}
                  src={LOVABLE_URL}
                  partition={partition}
                  preload={preloadPath}
                  allowpopups=""
                  style={{ width: '100%', height: '100%', display: 'flex' }}
                />
              )}

              {!isActivated && <NodePlaceholder icon="browser" />}

              {/* Click-capture overlay when unfocused */}
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

              {/* Prompt injection overlay */}
              <PromptOverlay state={overlayState} prompt={pendingPrompt} />
            </div>
          </BaseNode>
    </>
  )
}

// ---------------------------------------------------------------------------
// MCP status indicator
// ---------------------------------------------------------------------------

function McpIndicator({ active }: { active: boolean }): React.ReactElement {
  return (
    <div
      title="MCP bridge ready on port 7823"
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        height: 18, padding: '0 6px',
        borderRadius: 3,
        border: active
          ? '1px solid rgba(251,146,60,0.25)'
          : '1px solid rgba(255,255,255,0.07)',
        background: active ? 'rgba(251,146,60,0.08)' : 'rgba(255,255,255,0.03)',
        transition: 'border-color 0.3s, background 0.3s',
        flexShrink: 0,
      }}
    >
      <div style={{
        width: 5, height: 5, borderRadius: '50%',
        background: active ? '#fb923c' : 'rgba(255,255,255,0.2)',
        boxShadow: active ? '0 0 6px rgba(251,146,60,0.7)' : 'none',
        transition: 'background 0.3s, box-shadow 0.3s',
        flexShrink: 0,
      }} />
      <span style={{
        fontSize: 9, fontWeight: 600, letterSpacing: '0.06em',
        color: active ? 'rgba(251,146,60,0.8)' : 'rgba(255,255,255,0.2)',
        transition: 'color 0.3s',
      }}>
        MCP
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Injection script builder
// ---------------------------------------------------------------------------

function buildInjectionScript(prompt: string): string {
  return `
(function() {
  const PROMPT = ${JSON.stringify(prompt)};

  // Try selectors from most to least specific
  const el =
    document.querySelector('textarea[placeholder]') ||
    document.querySelector('textarea') ||
    document.querySelector('[contenteditable="true"][role="textbox"]') ||
    document.querySelector('[contenteditable="true"]');

  if (!el) return false;

  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
    const proto = el.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) {
      setter.call(el, PROMPT);
    } else {
      el.value = PROMPT;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    el.focus();
    document.execCommand('selectAll', false, undefined);
    document.execCommand('insertText', false, PROMPT);
  }

  // Submit after React has processed the value
  setTimeout(() => {
    const btn =
      document.querySelector('button[aria-label*="Send" i]') ||
      document.querySelector('button[type="submit"]') ||
      document.querySelector('form button:last-of-type');
    if (btn && !(btn as HTMLButtonElement).disabled) {
      (btn as HTMLButtonElement).click();
    } else {
      el.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter',
        bubbles: true, ctrlKey: false, metaKey: false, shiftKey: false,
      }));
    }
  }, 150);

  return true;
})()
`.trim()
}
