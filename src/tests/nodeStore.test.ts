import { describe, it, expect, beforeEach } from 'vitest'
import { useNodeStore } from '../renderer/src/stores/nodeStore'
import type { NodeType } from '../renderer/src/stores/nodeStore'

const DEFAULT_SIZES: Record<NodeType, { width: number; height: number }> = {
  terminal: { width: 600, height: 400 },
  browser: { width: 800, height: 600 },
  browserv2: { width: 800, height: 600 },
  note: { width: 300, height: 200 },
  files: { width: 700, height: 480 },
  notion: { width: 900, height: 700 },
  trello: { width: 900, height: 700 },
  claude: { width: 700, height: 480 },
  codex: { width: 700, height: 480 },
  monaco: { width: 1000, height: 640 },
  orchestrator: { width: 520, height: 300 },
  subagent: { width: 460, height: 180 },
}

beforeEach(() => {
  useNodeStore.setState({
    nodes: new Map(),
    workspaceNodes: new Map(),
    activeWorkspaceId: '',
    focusedNodeId: null,
  })
})

// ---------------------------------------------------------------------------
// add()
// ---------------------------------------------------------------------------

describe('nodeStore.add', () => {
  it('creates a node with the given type and position', () => {
    const node = useNodeStore.getState().add('note', 10, 20)
    expect(node.type).toBe('note')
    expect(node.x).toBe(10)
    expect(node.y).toBe(20)
  })

  it('assigns default size for each node type', () => {
    for (const type of Object.keys(DEFAULT_SIZES) as NodeType[]) {
      useNodeStore.setState({ nodes: new Map() })
      const node = useNodeStore.getState().add(type, 0, 0)
      expect(node.width).toBe(DEFAULT_SIZES[type].width)
      expect(node.height).toBe(DEFAULT_SIZES[type].height)
    }
  })

  it('assigns a unique id', () => {
    const a = useNodeStore.getState().add('note', 0, 0)
    const b = useNodeStore.getState().add('note', 0, 0)
    expect(a.id).not.toBe(b.id)
  })

  it('starts with minimized = false', () => {
    const node = useNodeStore.getState().add('terminal', 0, 0)
    expect(node.minimized).toBe(false)
  })

  it('stores the node in the map', () => {
    const node = useNodeStore.getState().add('browser', 5, 5)
    expect(useNodeStore.getState().nodes.get(node.id)).toEqual(node)
  })

  it('merges provided props', () => {
    const node = useNodeStore.getState().add('note', 0, 0, { content: 'hello' })
    expect(node.props.content).toBe('hello')
  })

  it('assigns zIndex = 1 for the first node', () => {
    const node = useNodeStore.getState().add('note', 0, 0)
    expect(node.zIndex).toBe(1)
  })

  it('increments zIndex for each subsequent node', () => {
    const a = useNodeStore.getState().add('note', 0, 0)
    const b = useNodeStore.getState().add('note', 0, 0)
    const c = useNodeStore.getState().add('note', 0, 0)
    expect(b.zIndex).toBeGreaterThan(a.zIndex)
    expect(c.zIndex).toBeGreaterThan(b.zIndex)
  })
})

// ---------------------------------------------------------------------------
// remove()
// ---------------------------------------------------------------------------

describe('nodeStore.remove', () => {
  it('deletes the node from the map', () => {
    const node = useNodeStore.getState().add('note', 0, 0)
    useNodeStore.getState().remove(node.id)
    expect(useNodeStore.getState().nodes.has(node.id)).toBe(false)
  })

  it('leaves other nodes intact', () => {
    const a = useNodeStore.getState().add('note', 0, 0)
    const b = useNodeStore.getState().add('note', 0, 0)
    useNodeStore.getState().remove(a.id)
    expect(useNodeStore.getState().nodes.has(b.id)).toBe(true)
  })

  it('is a no-op for unknown ids', () => {
    useNodeStore.getState().add('note', 0, 0)
    expect(() => useNodeStore.getState().remove('nonexistent')).not.toThrow()
    expect(useNodeStore.getState().nodes.size).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// update()
// ---------------------------------------------------------------------------

describe('nodeStore.update', () => {
  it('patches the specified fields', () => {
    const node = useNodeStore.getState().add('note', 0, 0)
    useNodeStore.getState().update(node.id, { x: 99, title: 'Changed' })
    const updated = useNodeStore.getState().nodes.get(node.id)!
    expect(updated.x).toBe(99)
    expect(updated.title).toBe('Changed')
  })

  it('does not affect unpatched fields', () => {
    const node = useNodeStore.getState().add('note', 5, 10)
    useNodeStore.getState().update(node.id, { x: 99 })
    const updated = useNodeStore.getState().nodes.get(node.id)!
    expect(updated.y).toBe(10)
    expect(updated.width).toBe(DEFAULT_SIZES.note.width)
  })

  it('is a no-op for unknown ids', () => {
    useNodeStore.getState().add('note', 0, 0)
    expect(() => useNodeStore.getState().update('nonexistent', { x: 99 })).not.toThrow()
  })

  it('can toggle minimized', () => {
    const node = useNodeStore.getState().add('note', 0, 0)
    useNodeStore.getState().update(node.id, { minimized: true })
    expect(useNodeStore.getState().nodes.get(node.id)!.minimized).toBe(true)
    useNodeStore.getState().update(node.id, { minimized: false })
    expect(useNodeStore.getState().nodes.get(node.id)!.minimized).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// bringToFront() / sendToBack()
// ---------------------------------------------------------------------------

describe('nodeStore.bringToFront', () => {
  it('gives the node the highest zIndex', () => {
    const a = useNodeStore.getState().add('note', 0, 0)
    const b = useNodeStore.getState().add('note', 0, 0)
    const c = useNodeStore.getState().add('note', 0, 0)

    useNodeStore.getState().bringToFront(a.id)

    const aZ = useNodeStore.getState().nodes.get(a.id)!.zIndex
    const bZ = useNodeStore.getState().nodes.get(b.id)!.zIndex
    const cZ = useNodeStore.getState().nodes.get(c.id)!.zIndex

    expect(aZ).toBeGreaterThan(bZ)
    expect(aZ).toBeGreaterThan(cZ)
  })

  it('is a no-op for unknown ids', () => {
    expect(() => useNodeStore.getState().bringToFront('nonexistent')).not.toThrow()
  })
})

describe('nodeStore.sendToBack', () => {
  it('gives the node the lowest zIndex', () => {
    const a = useNodeStore.getState().add('note', 0, 0)
    const b = useNodeStore.getState().add('note', 0, 0)
    const c = useNodeStore.getState().add('note', 0, 0)

    useNodeStore.getState().sendToBack(c.id)

    const aZ = useNodeStore.getState().nodes.get(a.id)!.zIndex
    const bZ = useNodeStore.getState().nodes.get(b.id)!.zIndex
    const cZ = useNodeStore.getState().nodes.get(c.id)!.zIndex

    expect(cZ).toBeLessThan(aZ)
    expect(cZ).toBeLessThan(bZ)
  })

  it('is a no-op for unknown ids', () => {
    expect(() => useNodeStore.getState().sendToBack('nonexistent')).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// getMaxZIndex()
// ---------------------------------------------------------------------------

describe('nodeStore.getMaxZIndex', () => {
  it('returns 0 when store is empty', () => {
    expect(useNodeStore.getState().getMaxZIndex()).toBe(0)
  })

  it('returns the highest zIndex across all nodes', () => {
    useNodeStore.getState().add('note', 0, 0)
    useNodeStore.getState().add('note', 0, 0)
    const last = useNodeStore.getState().add('note', 0, 0)
    expect(useNodeStore.getState().getMaxZIndex()).toBe(last.zIndex)
  })
})

// ---------------------------------------------------------------------------
// focusedNodeId
// ---------------------------------------------------------------------------

describe('nodeStore.setFocusedNodeId', () => {
  it('sets and clears focused node id', () => {
    const node = useNodeStore.getState().add('note', 0, 0)
    useNodeStore.getState().setFocusedNodeId(node.id)
    expect(useNodeStore.getState().focusedNodeId).toBe(node.id)
    useNodeStore.getState().setFocusedNodeId(null)
    expect(useNodeStore.getState().focusedNodeId).toBeNull()
  })
})

describe('nodeStore.setAgentStatus', () => {
  it('updates a node in an inactive workspace without switching the active workspace', () => {
    const inactiveNode = {
      id: 'node-inactive',
      type: 'claude' as const,
      x: 0,
      y: 0,
      width: 700,
      height: 480,
      zIndex: 1,
      title: 'Claude',
      minimized: false,
      contentScale: 1,
      props: {},
    }
    const activeNode = {
      id: 'node-active',
      type: 'claude' as const,
      x: 10,
      y: 10,
      width: 700,
      height: 480,
      zIndex: 2,
      title: 'Claude Active',
      minimized: false,
      contentScale: 1,
      props: {},
    }

    useNodeStore.setState({
      activeWorkspaceId: 'ws-active',
      nodes: new Map([[activeNode.id, activeNode]]),
      workspaceNodes: new Map([
        ['ws-active', new Map([[activeNode.id, activeNode]])],
        ['ws-inactive', new Map([[inactiveNode.id, inactiveNode]])],
      ]),
    })

    useNodeStore.getState().setAgentStatus(inactiveNode.id, 'needs_input')

    expect(useNodeStore.getState().activeWorkspaceId).toBe('ws-active')
    expect(useNodeStore.getState().nodes.get(activeNode.id)?.agentStatus).toBeUndefined()
    expect(
      useNodeStore.getState().workspaceNodes.get('ws-inactive')?.get(inactiveNode.id)?.agentStatus
    ).toBe('needs_input')
  })
})
