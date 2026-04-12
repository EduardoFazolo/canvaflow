import React, { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SerializeAddon } from '@xterm/addon-serialize'
import { NodeData } from '../stores/nodeStore'
import { BaseNode } from './BaseNode'
import { useNodeStore } from '../stores/nodeStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { getActiveCwd } from '../stores/viewStore'
import { registerTerminal, unregisterTerminal } from '../terminalRegistry'
import { useSettingsStore } from '../stores/settingsStore'
import { useActivityStore } from '../stores/activityStore'
import { useActivationStore } from '../stores/activationStore'
import { ActivationFade } from './NodePlaceholder'
import { normalizeClientPointForElement } from '../utils/terminalMouse'
import { detectAgentStatusFromTerminalBuffer, detectAgentStatusFromTitle, sanitizeTerminalOutput } from '../../../modules/servers/agentic_signals/shared/detection'
import { logAgentDebug, summarizeText } from '../../../modules/servers/agentic_signals/shared/debug'
import '@xterm/xterm/css/xterm.css'

interface Props {
  node: NodeData
}

type XtermMouseServiceLike = {
  getCoords?: (...args: any[]) => any
  getMouseReportCoords?: (...args: any[]) => any
}

type XtermSelectionServiceLike = {
  _getMouseEventScrollAmount?: (...args: any[]) => any
}

function patchXtermMouseCoordinates(term: Terminal): () => void {
  // xterm expects pointer coordinates in the terminal's unscaled layout space.
  // Our canvas zoom is a CSS transform, so we normalize mouse input before
  // xterm converts it into cell coordinates for selection and mouse reporting.
  const core = (term as any)?._core as {
    _mouseService?: XtermMouseServiceLike
    _selectionService?: XtermSelectionServiceLike
    screenElement?: HTMLElement
  } | undefined

  const mouseService = core?._mouseService
  if (!mouseService) return () => {}

  const originalGetCoords = mouseService.getCoords?.bind(mouseService)
  const originalGetMouseReportCoords = mouseService.getMouseReportCoords?.bind(mouseService)
  const selectionService = core?._selectionService
  const originalGetMouseEventScrollAmount =
    selectionService?._getMouseEventScrollAmount?.bind(selectionService)

  if (originalGetCoords) {
    mouseService.getCoords = (
      event: { clientX: number; clientY: number },
      element: HTMLElement,
      colCount: number,
      rowCount: number,
      isSelection?: boolean,
    ) => originalGetCoords(
      normalizeClientPointForElement(event, element),
      element,
      colCount,
      rowCount,
      isSelection,
    )
  }

  if (originalGetMouseReportCoords) {
    mouseService.getMouseReportCoords = (
      event: MouseEvent,
      element: HTMLElement,
    ) => originalGetMouseReportCoords(
      normalizeClientPointForElement(event, element),
      element,
    )
  }

  if (selectionService && originalGetMouseEventScrollAmount && core?.screenElement) {
    selectionService._getMouseEventScrollAmount = (event: MouseEvent) =>
      originalGetMouseEventScrollAmount(
        normalizeClientPointForElement(event, core.screenElement!),
      )
  }

  return () => {
    if (originalGetCoords) mouseService.getCoords = originalGetCoords
    if (originalGetMouseReportCoords) mouseService.getMouseReportCoords = originalGetMouseReportCoords
    if (selectionService && originalGetMouseEventScrollAmount) {
      selectionService._getMouseEventScrollAmount = originalGetMouseEventScrollAmount
    }
  }
}

export function TerminalNode({ node }: Props): React.ReactElement {
  const termRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const serializeAddonRef = useRef<SerializeAddon | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const renderInspectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const baseFontSizeRef = useRef<number>(13)
  const statusBufferRef = useRef('')
  const isAtBottomRef = useRef(true)
  const { update, focusedNodeId, setFocusedNodeId } = useNodeStore()
  const focusedNodeIdRef = useRef(focusedNodeId)
  useEffect(() => { focusedNodeIdRef.current = focusedNodeId }, [focusedNodeId])
  const isActivated = useActivationStore((s) => !!s.activated[node.id])

  useEffect(() => {
    if (!isActivated || !termRef.current) return

    const workspaceId = useWorkspaceStore.getState().activeId || ''

    const { settings: appSettings } = useSettingsStore.getState()

    baseFontSizeRef.current = appSettings.fontSize
    const term = new Terminal({
      fontFamily: 'JetBrains Mono, Menlo, Consolas, monospace',
      fontSize: appSettings.fontSize * (node.contentScale ?? 1),
      lineHeight: 1.2,
      cursorBlink: true,
      allowTransparency: false,
      scrollback: 5000,
      theme: {
        background: '#0d0d0d',
        foreground: '#e8e8e8',
        cursor: '#a78bfa',
        selectionBackground: '#a78bfa44',
        black: '#1a1a1a',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#fbbf24',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#e8e8e8',
        brightBlack: '#404040',
        brightRed: '#fca5a5',
        brightGreen: '#86efac',
        brightYellow: '#fde68a',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9',
        brightWhite: '#f5f5f5',
      },
    })

    const fitAddon = new FitAddon()
    const serializeAddon = new SerializeAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(serializeAddon)
    term.loadAddon(new WebLinksAddon())

    // Try WebGL renderer, fall back to canvas
    const loadRenderer = async () => {
      try {
        const { WebglAddon } = await import('@xterm/addon-webgl')
        const webglAddon = new WebglAddon()
        webglAddon.onContextLoss(() => webglAddon.dispose())
        term.loadAddon(webglAddon)
      } catch {
        const { CanvasAddon } = await import('@xterm/addon-canvas')
        term.loadAddon(new CanvasAddon())
      }
    }

    term.open(termRef.current)
    const restoreMousePatch = patchXtermMouseCoordinates(term)
    fitAddon.fit()
    loadRenderer()

    // Track whether the viewport is pinned to the bottom so we can
    // re-pin after writes (prevents the "jumps to top" bug on heavy output).
    const viewport = term.element?.querySelector('.xterm-viewport') as HTMLElement | null
    if (viewport) {
      viewport.addEventListener('scroll', () => {
        const gap = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
        isAtBottomRef.current = gap < 5
      })
    }

    xtermRef.current = term
    fitAddonRef.current = fitAddon
    serializeAddonRef.current = serializeAddon

    const inspectRenderedScreen = (reason: string) => {
      const active = term.buffer.active
      const start = active.viewportY
      const end = Math.min(active.length, start + term.rows)
      const lines: string[] = []
      for (let y = start; y < end; y++) {
        lines.push(active.getLine(y)?.translateToString(true) ?? '')
      }
      const snapshot = lines.join('\n')
      const detected = detectAgentStatusFromTerminalBuffer(snapshot)
      if (detected) {
        logAgentDebug('terminal-renderer', 'detected-status-from-screen', {
          nodeId: node.id,
          reason,
          detected,
          screenTail: summarizeText(snapshot.slice(-600)),
        })
        useNodeStore.getState().setAgentStatus(node.id, detected as any)
        return
      }
      if (/\besc to interrupt\b/i.test(snapshot)) {
        logAgentDebug('terminal-renderer', 'detected-thinking-from-screen', {
          nodeId: node.id,
          reason,
          screenTail: summarizeText(snapshot.slice(-600)),
        })
        useNodeStore.getState().setAgentStatus(node.id, 'thinking')
      } else if (/What would you like to work on|Do you want to proceed|Esc to cancel|Enter to select/i.test(snapshot)) {
        logAgentDebug('terminal-renderer', 'prompt-like-screen-without-detection', {
          nodeId: node.id,
          reason,
          screenTail: summarizeText(snapshot.slice(-600)),
        })
      }
    }

    const scheduleRenderedScreenInspect = (reason: string) => {
      if (renderInspectTimerRef.current) clearTimeout(renderInspectTimerRef.current)
      renderInspectTimerRef.current = setTimeout(() => {
        renderInspectTimerRef.current = null
        inspectRenderedScreen(reason)
      }, 10)
    }

    const renderDisposable = term.onRender(() => {
      scheduleRenderedScreenInspect('render')
    })

    // Register so beforeunload can serialize this terminal synchronously
    registerTerminal(node.id, () => serializeAddonRef.current?.serialize() ?? '')

    // Restore previous scrollback from SQLite (written before tmux output starts).
    //
    // For agent nodes (claude, codex, orchestrator) we deliberately skip this: the agent
    // process redraws its own banner on startup, and overlaying the previous visual
    // snapshot causes literal escape-sequence artifacts and double banners. The
    // conversation history itself is preserved via `claude --resume <sessionId>`,
    // which is what actually matters to the user.
    const savedState = node.props.serializedState as string | undefined
    const isAgentNode = node.type === 'claude' || node.type === 'codex' || node.type === 'orchestrator'
    if (savedState && !isAgentNode) {
      term.write(savedState, () => term.scrollToBottom())
    }

    // Start PTY at the FITTED dimensions — not the default 80x24. Spawning
    // with the wrong size and resizing afterwards sends SIGWINCH mid-startup,
    // which races with Claude's banner draw and produces literal escape-
    // sequence artifacts (^[[?1;2c, ^[[O). Spawning at the right size from
    // the start avoids the race entirely.
    // Resolve cwd. Fall back to the active view/workspace path if the node
    // has none — otherwise pty.ts would drop the terminal in $HOME, which
    // triggers Claude Code's "trust this folder?" dialog for every spawn.
    const cwd = (node.props.cwd as string) || getActiveCwd()
    const shell = (node.props.shell as string) || appSettings.shell
    window.terminal.create(node.id, workspaceId, cwd, shell, term.cols, term.rows)

    // PTY → xterm (also signals activity to the navbar indicator)
    const unsub = window.terminal.onData(node.id, (data) => {
      const wasAtBottom = isAtBottomRef.current
      term.write(data, () => {
        if (wasAtBottom) term.scrollToBottom()
      })
      // Mark this terminal active; auto-idles after 30s of silence
      useActivityStore.getState().markActive(node.id)

      const clean = sanitizeTerminalOutput(data)
      statusBufferRef.current = (statusBufferRef.current + clean).slice(-4096)
      const detected = detectAgentStatusFromTerminalBuffer(statusBufferRef.current)
      if (detected) {
        logAgentDebug('terminal-renderer', 'detected-status-from-buffer', {
          nodeId: node.id,
          detected,
          chunk: summarizeText(clean),
          bufferTail: summarizeText(statusBufferRef.current.slice(-400)),
        })
        useNodeStore.getState().setAgentStatus(node.id, detected as any)
        if (detected === 'idle') statusBufferRef.current = ''
      } else if (/\besc to interrupt\b/i.test(statusBufferRef.current)) {
        logAgentDebug('terminal-renderer', 'detected-thinking-from-buffer', {
          nodeId: node.id,
          bufferTail: summarizeText(statusBufferRef.current.slice(-400)),
        })
        useNodeStore.getState().setAgentStatus(node.id, 'thinking')
      } else if (/What would you like to work on|Do you want to proceed|Esc to cancel|Enter to select/i.test(statusBufferRef.current)) {
        logAgentDebug('terminal-renderer', 'prompt-like-buffer-without-detection', {
          nodeId: node.id,
          chunk: summarizeText(clean),
          bufferTail: summarizeText(statusBufferRef.current.slice(-400)),
        })
      }
      scheduleRenderedScreenInspect('pty-data')
    })

    // xterm → PTY
    term.onData((data) => {
      // Ctrl+C should clear stale active status immediately, even before the shell redraw lands.
      if (data === '\u0003') {
        logAgentDebug('terminal-renderer', 'ctrl-c-input', { nodeId: node.id })
        useNodeStore.getState().setAgentStatus(node.id, 'idle')
        statusBufferRef.current = ''
      }
      window.terminal.write(node.id, data)
    })

    // OSC 7: shell reports CWD as file://hostname/path
    // Most modern shells (zsh+oh-my-zsh, fish, bash with vte) emit this on every cd
    term.parser.registerOscHandler(7, (data) => {
      try {
        const raw = data.startsWith('file://')
          ? decodeURIComponent(new URL(data).pathname)
          : decodeURIComponent(data)
        const parts = raw.split('/').filter(Boolean)
        // Shorten: ~/foo → just show foo, /usr/local/bin → usr/local/bin
        const home = raw.includes('/Users/') || raw.includes('/home/')
        const homeIdx = raw.indexOf('/Users/') >= 0
          ? raw.indexOf('/Users/') : raw.indexOf('/home/')
        const afterHome = homeIdx >= 0
          ? raw.slice(raw.indexOf('/', homeIdx + 1) + 1)
          : null
        const short = afterHome !== null && afterHome !== ''
          ? '~/' + afterHome
          : afterHome === ''
            ? '~'
            : '/' + parts.join('/')
        const current = useNodeStore.getState().nodes.get(node.id)
        useNodeStore.getState().update(node.id, {
          title: short,
          props: { ...current?.props, cwd: raw },  // store full path, not the display-shortened one
        })
      } catch {}
      return false
    })

    // OSC 2: shell / running process sets the window title
    // Fired by most shells and programs (vim, htop, etc.)
    term.onTitleChange((title) => {
      if (!title) return
      const current = useNodeStore.getState().nodes.get(node.id)
      // Only update if it doesn't look like a raw OSC 7 path repeated
      if (!title.startsWith('file://')) {
        const detected = detectAgentStatusFromTitle(title)
        logAgentDebug('terminal-renderer', 'title-change', {
          nodeId: node.id,
          title,
          detected: detected ?? '',
        })
        useNodeStore.getState().update(node.id, {
          title,
          props: { ...current?.props },
        })
        if (detected) {
          useNodeStore.getState().setAgentStatus(node.id, detected as any)
        }
      }
    })

    // Periodically update nodeStore with serialized state so autosave keeps SQLite fresh
    saveTimerRef.current = setInterval(() => {
      if (serializeAddonRef.current) {
        const serializedState = serializeAddonRef.current.serialize()
        const current = useNodeStore.getState().nodes.get(node.id)
        if (current) {
          useNodeStore.getState().update(node.id, { props: { ...current.props, serializedState } })
        }
      }
    }, 5_000)

    return () => {
      unregisterTerminal(node.id)

      // Workspace switch: node is already removed from store, write directly to DB
      if (serializeAddonRef.current) {
        const serializedState = serializeAddonRef.current.serialize()
        window.terminal.saveState(node.id, serializedState)
      }

      if (saveTimerRef.current) clearInterval(saveTimerRef.current)
      if (renderInspectTimerRef.current) clearTimeout(renderInspectTimerRef.current)

      unsub()
      renderDisposable.dispose()
      restoreMousePatch()
      term.dispose()

      // Kill the tmux session only if the node was explicitly deleted
      const nodeDeleted = !useNodeStore.getState().nodes.has(node.id)
      window.terminal.kill(node.id, workspaceId, nodeDeleted)

      xtermRef.current = null
      fitAddonRef.current = null
      serializeAddonRef.current = null
    }
  }, [node.id, isActivated])


  // Block wheel events from reaching the canvas only when this terminal is focused.
  // When not focused, the guard overlay intercepts events so this handler never sees them.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return
      if (focusedNodeIdRef.current === node.id) e.stopPropagation()
    }
    el.addEventListener('wheel', onWheel, { passive: true })
    return () => el.removeEventListener('wheel', onWheel)
  }, [node.id])

  // Refit when node size changes
  useEffect(() => {
    if (!fitAddonRef.current || !xtermRef.current) return
    const timer = setTimeout(() => {
      fitAddonRef.current?.fit()
      const { cols, rows } = xtermRef.current!
      window.terminal.resize(node.id, cols, rows)
    }, 50)
    return () => clearTimeout(timer)
  }, [node.width, node.height, node.id])

  // Update font size when contentScale changes
  useEffect(() => {
    if (!xtermRef.current || !fitAddonRef.current) return
    xtermRef.current.options.fontSize = baseFontSizeRef.current * (node.contentScale ?? 1)
    fitAddonRef.current.fit()
    const { cols, rows } = xtermRef.current
    window.terminal.resize(node.id, cols, rows)
  }, [node.contentScale, node.id])

  return (
        <BaseNode node={node} noCssZoom>
          <div
            ref={containerRef}
            style={{ width: '100%', height: node.height - 32, padding: isActivated ? '6px 8px' : 0, boxSizing: 'border-box', position: 'relative' }}
            onPointerDown={(e) => { useActivationStore.getState().activateNow(node.id); e.stopPropagation() }}
            onContextMenu={async (e) => {
              e.preventDefault()
              e.stopPropagation()
              const term = xtermRef.current
              if (!term) return
              const action = await (window as any).contextMenu.showTerminalMenu(term.hasSelection())
              if (action === 'copy' && term.hasSelection()) {
                navigator.clipboard.writeText(term.getSelection())
              } else if (action === 'paste') {
                const text = await navigator.clipboard.readText()
                if (text) window.terminal.write(node.id, text)
              } else if (action === 'selectAll') {
                term.selectAll()
              } else if (action === 'clear') {
                term.clear()
              }
            }}
          >
            <ActivationFade isActivated={isActivated} icon="terminal">
              {/* isolation: isolate contains xterm's internal z-indices so our overlay can sit above them */}
              <div ref={termRef} style={{ width: '100%', height: '100%', isolation: 'isolate' }} />
              {focusedNodeId !== node.id && (
                <div
                  style={{ position: 'absolute', inset: 0, zIndex: 9999, cursor: 'text' }}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    setFocusedNodeId(node.id)
                    setTimeout(() => xtermRef.current?.focus(), 0)
                  }}
                />
              )}
            </ActivationFade>
          </div>
        </BaseNode>
  )
}
