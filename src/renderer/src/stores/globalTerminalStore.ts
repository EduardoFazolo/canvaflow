import { create } from 'zustand'

interface State {
  collapsed: boolean
  height: number
  loaded: boolean
  load: () => Promise<void>
  setCollapsed: (v: boolean) => void
  toggle: () => void
  setHeight: (h: number) => void
}

const KEY = 'global_terminal_pane'
const DEFAULTS = { collapsed: false, height: 240 }
const MIN_HEIGHT = 80
const MAX_HEIGHT = 800

function persist(state: { collapsed: boolean; height: number }): void {
  try { window.appState.set(KEY, JSON.stringify(state)) } catch {}
}

export const useGlobalTerminalStore = create<State>((set, get) => ({
  collapsed: DEFAULTS.collapsed,
  height: DEFAULTS.height,
  loaded: false,

  load: async () => {
    try {
      const raw = await window.appState.get(KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<{ collapsed: boolean; height: number }>
        set({
          collapsed: parsed.collapsed ?? DEFAULTS.collapsed,
          height: Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, parsed.height ?? DEFAULTS.height)),
          loaded: true,
        })
      } else {
        set({ loaded: true })
      }
    } catch {
      set({ loaded: true })
    }
  },

  setCollapsed: (v) => {
    set({ collapsed: v })
    persist({ collapsed: v, height: get().height })
  },

  toggle: () => get().setCollapsed(!get().collapsed),

  setHeight: (h) => {
    const clamped = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, h))
    set({ height: clamped })
    persist({ collapsed: get().collapsed, height: clamped })
  },
}))
