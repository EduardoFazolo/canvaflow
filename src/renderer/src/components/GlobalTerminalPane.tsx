import React, { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { useGlobalTerminalStore } from '../stores/globalTerminalStore'
import { useSettingsStore } from '../stores/settingsStore'
import { AddWorkspaceDialog } from './Sidebar'
import '@xterm/xterm/css/xterm.css'

const HEADER_H = 34
const GLOBAL_ID = '__global'

export function GlobalTerminalPane(): React.ReactElement | null {
  const collapsed = useGlobalTerminalStore((s) => s.collapsed)
  const height = useGlobalTerminalStore((s) => s.height)
  const loaded = useGlobalTerminalStore((s) => s.loaded)
  const load = useGlobalTerminalStore((s) => s.load)
  const toggle = useGlobalTerminalStore((s) => s.toggle)
  const setHeight = useGlobalTerminalStore((s) => s.setHeight)

  const fontSize = useSettingsStore((s) => s.settings.fontSize)

  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const isAtBottomRef = useRef(true)
  const [dragging, setDragging] = useState(false)
  const [addWsPath, setAddWsPath] = useState<string | null>(null)

  useEffect(() => { if (!loaded) load() }, [loaded, load])

  // Mount xterm once (persists for app lifetime).
  useEffect(() => {
    if (!hostRef.current) return
    const term = new Terminal({
      fontFamily: 'JetBrains Mono, Menlo, Consolas, monospace',
      fontSize,
      lineHeight: 1.2,
      cursorBlink: true,
      allowTransparency: false,
      scrollback: 2000,
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
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon())
    term.open(hostRef.current)
    fit.fit()
    ;(async () => {
      try {
        const { WebglAddon } = await import('@xterm/addon-webgl')
        const webgl = new WebglAddon()
        webgl.onContextLoss(() => webgl.dispose())
        term.loadAddon(webgl)
      } catch {
        const { CanvasAddon } = await import('@xterm/addon-canvas')
        term.loadAddon(new CanvasAddon())
      }
    })()

    const viewport = term.element?.querySelector('.xterm-viewport') as HTMLElement | null
    viewport?.addEventListener('scroll', () => {
      const gap = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
      isAtBottomRef.current = gap < 5
    })

    termRef.current = term
    fitRef.current = fit

    // Replay buffered output, then attach live stream.
    window.terminal.getGlobalBuffer().then((buf) => {
      if (buf) term.write(buf, () => term.scrollToBottom())
    })

    const unsub = window.terminal.onData(GLOBAL_ID, (data) => {
      const wasBottom = isAtBottomRef.current
      term.write(data, () => { if (wasBottom) term.scrollToBottom() })
    })

    term.onData((data) => window.terminal.write(GLOBAL_ID, data))

    // Sync PTY size to fitted dims.
    const resizeToPty = () => {
      try {
        fit.fit()
        const { cols, rows } = term
        window.terminal.resize(GLOBAL_ID, cols, rows)
      } catch {}
    }
    resizeToPty()

    const ro = new ResizeObserver(() => resizeToPty())
    ro.observe(hostRef.current)

    return () => {
      ro.disconnect()
      unsub()
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [])

  // Font-size changes
  useEffect(() => {
    const term = termRef.current
    const fit = fitRef.current
    if (!term || !fit) return
    term.options.fontSize = fontSize
    fit.fit()
    const { cols, rows } = term
    window.terminal.resize(GLOBAL_ID, cols, rows)
  }, [fontSize])

  // Drag-to-resize (top edge)
  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) => {
      const h = window.innerHeight - e.clientY
      setHeight(h)
    }
    const onUp = () => setDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging, setHeight])

  const paneHeight = collapsed ? HEADER_H : height

  return (
    <div
      style={{
        flexShrink: 0,
        height: paneHeight,
        display: 'flex',
        flexDirection: 'column',
        borderTop: '1px solid #2a2a2a',
        background: '#0d0d0d',
        position: 'relative',
        userSelect: dragging ? 'none' : undefined,
      }}
    >
      {!collapsed && (
        <div
          onMouseDown={() => setDragging(true)}
          style={{
            position: 'absolute',
            top: -3,
            left: 0,
            right: 0,
            height: 6,
            cursor: 'ns-resize',
            zIndex: 10,
          }}
        />
      )}
      <div
        onClick={toggle}
        style={{
          height: HEADER_H,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          padding: '0 10px',
          fontSize: 11,
          color: '#888',
          background: '#151515',
          borderBottom: collapsed ? 'none' : '1px solid #222',
          cursor: 'pointer',
          gap: 8,
          fontFamily: 'JetBrains Mono, Menlo, monospace',
          letterSpacing: 0.4,
          textTransform: 'uppercase',
        }}
      >
        <span style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>▾</span>
        <span>terminal</span>
        <button
          title="Add current terminal directory as workspace"
          onClick={async (e) => {
            e.stopPropagation()
            const cwd = await window.terminal.getGlobalCwd()
            setAddWsPath(cwd || '')
          }}
          style={{
            marginLeft: 'auto',
            height: 20,
            padding: '0 8px',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 4,
            background: 'transparent',
            color: 'rgba(255,255,255,0.55)',
            fontSize: 10,
            cursor: 'pointer',
            fontFamily: 'inherit',
            letterSpacing: 0.4,
            textTransform: 'uppercase',
          }}
        >
          + workspace
        </button>
      </div>
      {addWsPath !== null && (
        <AddWorkspaceDialog initialPath={addWsPath} onClose={() => setAddWsPath(null)} />
      )}
      <div
        ref={hostRef}
        style={{
          flex: 1,
          minHeight: 0,
          padding: '4px 8px',
          boxSizing: 'border-box',
          display: collapsed ? 'none' : 'block',
          isolation: 'isolate',
        }}
      />
    </div>
  )
}
