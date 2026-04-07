import { useEffect } from 'react'
import { nanoid } from 'nanoid'
import { useWorkspaceStore, Workspace } from '../stores/workspaceStore'
import { useNodeStore, NodeData, NodeType } from '../stores/nodeStore'
import { useCameraStore, Camera } from '../stores/cameraStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useActivationStore } from '../stores/activationStore'
import { useViewStore } from '../stores/viewStore'
import { initCanvasManager, onWorkspaceSwitch } from '../stores/canvasManager'

// Activate nodes after React has had a chance to mount the components.
// Two rAF frames ensures the DOM commit + paint cycle completes first.
// Nodes are queued and staggered — visible nodes activate first, off-screen nodes later.
export function activateNodesAfterMount(nodeIds: string[], nodes?: Map<string, NodeData>): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      // Determine which nodes are currently visible in the viewport
      const camera = useCameraStore.getState().camera
      const vw = window.innerWidth
      const vh = window.innerHeight
      const visibleIds: string[] = []

      if (nodes) {
        const left = -camera.x / camera.zoom
        const top = -camera.y / camera.zoom
        const right = (vw - camera.x) / camera.zoom
        const bottom = (vh - camera.y) / camera.zoom

        for (const id of nodeIds) {
          const node = nodes.get(id)
          if (node &&
            node.x < right && node.x + node.width > left &&
            node.y < bottom && node.y + node.height > top
          ) {
            visibleIds.push(id)
          }
        }
      }

      useActivationStore.getState().queueActivation(nodeIds, visibleIds)
    })
  })
}

// Per-workspace camera cache — avoids DB round-trip when switching back to a visited workspace
const _workspaceCameraCache = new Map<string, Camera>()

// ---------------------------------------------------------------------------
// Convert DB row → NodeData
// ---------------------------------------------------------------------------

export function rowToNode(row: any): NodeData {
  return {
    id: row.id,
    type: row.type as NodeType,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    zIndex: row.zIndex,
    title: row.title,
    minimized: row.minimized === 1,
    contentScale: row.contentScale ?? 1,
    props: (() => {
      try { return JSON.parse(row.props) } catch { return {} }
    })(),
    createdAt: row.createdAt,
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWorkspaceInit(): void {
  useEffect(() => {
    let cancelled = false

    async function init() {
      const api = window

      // Load settings and templates early
      useSettingsStore.getState().load()
      const { useTemplateStore } = await import('../stores/templateStore')
      useTemplateStore.getState().load()

      // Load all workspaces from DB
      let dbWorkspaces: Workspace[] = []
      try {
        dbWorkspaces = await api.workspace.getAll()
      } catch {
        // DB not ready yet (unlikely after initDatabase() in main)
      }

      if (cancelled) return

      // Determine active workspace
      let activeId: string | null = null

      if (dbWorkspaces.length > 0) {
        // Restore last-used workspace
        const lastId = await api.appState.get('lastWorkspaceId')
        const lastExists = dbWorkspaces.some((w: Workspace) => w.id === lastId)
        activeId = lastExists ? lastId : dbWorkspaces[0].id
      } else {
        // Create a default workspace (home directory)
        const home = await window.workspace.homedir()
        const defaultWs: Workspace = {
          id: nanoid(),
          name: 'Home',
          path: home,
          lastOpenedAt: Date.now(),
          color: null,
          description: null,
        }
        await api.workspace.save(defaultWs)
        dbWorkspaces = [defaultWs]
        activeId = defaultWs.id
      }

      if (cancelled) return

      useWorkspaceStore.setState({ workspaces: dbWorkspaces, activeId })

      // Load node summaries for all workspaces (for sidebar display)
      const summariesEntries = await Promise.all(
        dbWorkspaces.map(async (ws: Workspace) => {
          try {
            const rows = await window.canvas.getNodes(ws.id)
            return [ws.id, rows.map((r: any) => {
              let subtitle: string | undefined
              try { subtitle = (r.type === 'browser' || r.type === 'browserv2') ? (JSON.parse(r.props)?.url ?? undefined) : undefined } catch {}
              return { id: r.id, title: r.title, type: r.type, subtitle }
            })] as const
          } catch {
            return [ws.id, []] as const
          }
        })
      )
      const nodeSummaries: Record<string, any[]> = {}
      for (const [id, summaries] of summariesEntries) nodeSummaries[id] = summaries
      useWorkspaceStore.setState({ nodeSummaries })

      // Load full canvas for the active workspace
      if (activeId) {
        await loadWorkspaceCanvas(activeId)
        initCanvasManager(activeId)
      }

      // Restore persisted worktree view tabs
      await useViewStore.getState().loadPersistedViews()
    }

    init()
    return () => { cancelled = true }
  }, [])
}

export async function loadWorkspaceCanvas(workspaceId: string): Promise<void> {
  const api = window

  try {
    // Handle canvas manager state for workspace switch
    onWorkspaceSwitch(workspaceId)

    // Save current workspace's live camera before switching away
    const currentWsId = useNodeStore.getState().activeWorkspaceId
    if (currentWsId && currentWsId !== workspaceId) {
      _workspaceCameraCache.set(currentWsId, useCameraStore.getState().camera)
    }

    // If this workspace's nodes are already in memory, just switch to them
    const existing = useNodeStore.getState().workspaceNodes.get(workspaceId)

    if (existing) {
      useNodeStore.getState().loadWorkspace(workspaceId, existing)
      activateNodesAfterMount([...existing.keys()], existing)
    } else {
      // First visit — load from DB
      const nodeRows = await api.canvas.getNodes(workspaceId)
      const nodes = new Map<string, NodeData>()
      for (const row of nodeRows) {
        const node = rowToNode(row)
        nodes.set(node.id, node)
      }

      // Merge persisted metadata (focusCount, lastFocusedAt, tags) into nodes
      try {
        const nodeIds = [...nodes.keys()]
        if (nodeIds.length > 0) {
          const metaRows = await window.agent.getMetadata(nodeIds)
          for (const meta of metaRows) {
            const node = nodes.get(meta.nodeId)
            if (node) {
              nodes.set(meta.nodeId, {
                ...node,
                lastFocusedAt: meta.lastFocusedAt,
                focusCount: meta.focusCount,
                totalFocusDuration: meta.totalFocusDuration ?? 0,
                tags: (() => { try { return JSON.parse(meta.tags) } catch { return [] } })(),
                description: meta.description ?? undefined,
                pinned: meta.pinned === 1,
                agentRole: meta.agentRole ?? null,
              })
            }
          }
        }
      } catch {}

      useNodeStore.getState().loadWorkspace(workspaceId, nodes)
      activateNodesAfterMount([...nodes.keys()], nodes)

      // Update sidebar summaries
      useWorkspaceStore.getState().setNodeSummaries(
        workspaceId,
        nodeRows.map((r: any) => {
          let subtitle: string | undefined
          try { subtitle = (r.type === 'browser' || r.type === 'browserv2') ? (JSON.parse(r.props)?.url ?? undefined) : undefined } catch {}
          return { id: r.id, title: r.title, type: r.type, subtitle }
        })
      )
    }

    // Restore camera: use in-memory cache if available, else load from DB
    const cachedCamera = _workspaceCameraCache.get(workspaceId)
    if (cachedCamera) {
      useCameraStore.setState({ camera: cachedCamera })
    } else {
      const cameraRow = await api.canvas.getCamera(workspaceId)
      if (cameraRow) {
        useCameraStore.setState({ camera: { x: cameraRow.x, y: cameraRow.y, zoom: cameraRow.zoom } })
      } else {
        useCameraStore.setState({ camera: { x: 0, y: 0, zoom: 1 } })
      }
    }

    await api.appState.set('lastWorkspaceId', workspaceId)
  } catch (err) {
    console.error('[workspace] Failed to load canvas:', err)
    useNodeStore.getState().loadWorkspace(workspaceId, new Map())
    useCameraStore.setState({ camera: { x: 0, y: 0, zoom: 1 } })
  }
}
