import { create } from 'zustand'

interface CanvasViewportState {
  // Screen coordinates of the top-left corner of the canvas content area
  // (right edge of the sidebar, below the title bar + tab bar).
  // This is the authoritative clip boundary for native views (WebContentsView).
  left: number
  top: number
}

// Sidebar starts open at 240px, top at 68px (TitleBar 40 + ViewTabBar 28) —
// these defaults prevent a flash before App's synchronous first-render update.
export const useCanvasViewportStore = create<CanvasViewportState>(() => ({
  left: 240,
  top: 68,
}))

// Called by App.tsx on every frame of the sidebar open/close animation,
// and once on initial mount.
export function setCanvasViewport(left: number, top: number): void {
  useCanvasViewportStore.setState({ left, top })
  // Keep the main process in sync so it enforces the boundary when positioning
  // WebContentsViews — even if renderer IPC bounds are momentarily stale.
  window.browser?.setCanvasLeft(left)
}
