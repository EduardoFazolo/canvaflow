import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Sidebar, SIDEBAR_W } from './components/Sidebar'
import { TitleBar, TITLEBAR_H } from './components/TitleBar'
import { CommandPalette } from './components/CommandPalette'
import { ViewTabBar, VIEW_TABBAR_H } from './components/ViewTabBar'
import { ViewLayer } from './components/ViewLayer'
import { useAutoSave } from './hooks/useAutoSave'
import { useWorkspaceInit } from './hooks/useWorkspaceInit'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useAgentStatus } from '../../modules/servers/agentic_signals/renderer/useAgentStatus'
import { useViewStore } from './stores/viewStore'
import { setCanvasViewport } from './stores/canvasViewportStore'

export default function App(): React.ReactElement {
  useWorkspaceInit()
  useAutoSave()
  useAgentStatus()

  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const sidebarContainerRef = useRef<HTMLDivElement>(null)

  // Synchronous init during render (top-down, before any child useEffect runs).
  // Ensures canvasViewportStore is correct when BrowserNodeV2 first mounts.
  const viewportInitialized = useRef(false)
  if (!viewportInitialized.current) {
    viewportInitialized.current = true
    setCanvasViewport(sidebarOpen ? SIDEBAR_W : 0, TITLEBAR_H + VIEW_TABBAR_H)
  }

  // Keep canvasViewportStore in sync with the sidebar CSS animation frame-by-frame.
  // Opening: jump to SIDEBAR_W immediately and stay there — do NOT track the RAF because
  //          the container's right edge starts at 0 and would overwrite the conservative value.
  // Closing: do NOT jump to 0 immediately — the sidebar is still visible during the
  //          200ms animation so we must track the real right edge down to 0, never jump.
  useEffect(() => {
    if (sidebarOpen) {
      // Conservative: stay at full width so the WebContentsView is never placed
      // in front of a still-appearing sidebar.
      setCanvasViewport(SIDEBAR_W, TITLEBAR_H + VIEW_TABBAR_H)
      return
    }

    // Closing: track the actual right edge from SIDEBAR_W → 0 each animation frame.
    const container = sidebarContainerRef.current
    if (!container) return

    let rafId: number
    const track = () => {
      const right = container.getBoundingClientRect().right
      setCanvasViewport(right, TITLEBAR_H + VIEW_TABBAR_H)
      if (right > 0.5) {
        rafId = requestAnimationFrame(track)
      }
    }
    rafId = requestAnimationFrame(track)
    return () => cancelAnimationFrame(rafId)
  }, [sidebarOpen])

  const openPalette = useCallback(() => setPaletteOpen(true), [])
  const openSettings = useCallback(() => useViewStore.getState().open(
    { id: 'settings', type: 'settings', label: 'Settings', closeable: true }
  ), [])

  useKeyboardShortcuts({ onSearch: openPalette, onSettings: openSettings })

  // Browser view visibility is now managed by ViewLayer on tab switch

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', overflow: 'hidden' }}>
      <TitleBar
        sidebarOpen={sidebarOpen}
        sidebarWidth={SIDEBAR_W}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
      />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div ref={sidebarContainerRef} style={{
          width: sidebarOpen ? SIDEBAR_W : 0,
          overflow: 'hidden',
          transition: 'width 0.2s ease',
          flexShrink: 0,
        }}>
          <Sidebar />
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <ViewTabBar />
          <ViewLayer />
        </div>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}
