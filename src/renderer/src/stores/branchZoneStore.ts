import { create } from 'zustand'
import { nanoid } from 'nanoid'

export interface BranchZone {
  id: string
  workspaceId: string
  branch: string
  worktreePath: string
  color: string
  x: number
  y: number
  width: number
  height: number
  createdAt: number
}

const ZONE_COLORS = [
  'rgba(139, 92, 246, 0.08)',   // violet
  'rgba(59, 130, 246, 0.08)',   // blue
  'rgba(16, 185, 129, 0.08)',   // emerald
  'rgba(245, 158, 11, 0.08)',   // amber
  'rgba(239, 68, 68, 0.08)',    // red
  'rgba(236, 72, 153, 0.08)',   // pink
  'rgba(6, 182, 212, 0.08)',    // cyan
  'rgba(132, 204, 22, 0.08)',   // lime
]

const ZONE_BORDER_COLORS: Record<string, string> = {
  'rgba(139, 92, 246, 0.08)': 'rgba(139, 92, 246, 0.35)',
  'rgba(59, 130, 246, 0.08)':  'rgba(59, 130, 246, 0.35)',
  'rgba(16, 185, 129, 0.08)':  'rgba(16, 185, 129, 0.35)',
  'rgba(245, 158, 11, 0.08)':  'rgba(245, 158, 11, 0.35)',
  'rgba(239, 68, 68, 0.08)':   'rgba(239, 68, 68, 0.35)',
  'rgba(236, 72, 153, 0.08)':  'rgba(236, 72, 153, 0.35)',
  'rgba(6, 182, 212, 0.08)':   'rgba(6, 182, 212, 0.35)',
  'rgba(132, 204, 22, 0.08)':  'rgba(132, 204, 22, 0.35)',
}

export function getBorderColor(bg: string): string {
  return ZONE_BORDER_COLORS[bg] ?? bg.replace('0.08)', '0.35)')
}

export function getLabelColor(bg: string): string {
  return bg.replace('0.08)', '0.7)')
}

interface BranchZoneStore {
  zones: Map<string, BranchZone>

  loadZones: (workspaceId: string, zones: BranchZone[]) => void
  addZone: (workspaceId: string, branch: string, worktreePath: string, x: number, y: number) => BranchZone
  removeZone: (id: string) => void
  updateZone: (id: string, patch: Partial<BranchZone>) => void
  getZoneAtPoint: (x: number, y: number) => BranchZone | null
}

export const useBranchZoneStore = create<BranchZoneStore>((set, get) => ({
  zones: new Map(),

  loadZones: (_workspaceId, zones) => {
    const map = new Map<string, BranchZone>()
    for (const z of zones) map.set(z.id, z)
    set({ zones: map })
  },

  addZone: (workspaceId, branch, worktreePath, x, y) => {
    const existing = get().zones.size
    const color = ZONE_COLORS[existing % ZONE_COLORS.length]
    const zone: BranchZone = {
      id: nanoid(),
      workspaceId,
      branch,
      worktreePath,
      color,
      x: x - 600,
      y: y - 400,
      width: 1200,
      height: 800,
      createdAt: Date.now(),
    }
    set((s) => {
      const zones = new Map(s.zones)
      zones.set(zone.id, zone)
      return { zones }
    })
    // Persist
    window.branchZones.save(zone).catch(() => {})
    return zone
  },

  removeZone: (id) => {
    set((s) => {
      const zones = new Map(s.zones)
      zones.delete(id)
      return { zones }
    })
    window.branchZones.delete(id).catch(() => {})
  },

  updateZone: (id, patch) => {
    set((s) => {
      const zone = s.zones.get(id)
      if (!zone) return s
      const updated = { ...zone, ...patch }
      const zones = new Map(s.zones)
      zones.set(id, updated)
      // Persist position/size changes
      window.branchZones.save(updated).catch(() => {})
      return { zones }
    })
  },

  getZoneAtPoint: (x, y) => {
    for (const zone of get().zones.values()) {
      if (x >= zone.x && x <= zone.x + zone.width && y >= zone.y && y <= zone.y + zone.height) {
        return zone
      }
    }
    return null
  },
}))
