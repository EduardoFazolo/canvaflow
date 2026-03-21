import { create } from 'zustand'

export interface Settings {
  shell: string                          // default shell for new terminals (empty = use system default)
  fontSize: number                       // xterm.js font size
  navStyle: 'default' | 'trackpad'      // canvas navigation style
  maestroEnabled: boolean               // Maestro Hand-gestures plugin
}

const DEFAULTS: Settings = {
  shell: '',
  fontSize: 13,
  navStyle: 'default',
  maestroEnabled: false,
}

interface SettingsStore {
  settings: Settings
  loaded: boolean
  load: () => Promise<void>
  update: (patch: Partial<Settings>) => Promise<void>
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: DEFAULTS,
  loaded: false,

  load: async () => {
    try {
      const raw = await window.appState.get('settings')
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Settings>
        set({ settings: { ...DEFAULTS, ...parsed }, loaded: true })
      } else {
        set({ loaded: true })
      }
    } catch {
      set({ loaded: true })
    }
  },

  update: async (patch) => {
    const next = { ...get().settings, ...patch }
    set({ settings: next })
    try {
      await window.appState.set('settings', JSON.stringify(next))
    } catch {}
  },
}))
