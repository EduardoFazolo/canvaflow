import { describe, expect, it, beforeEach } from 'vitest'
import { useNodeStore } from '../renderer/src/stores/nodeStore'

function resetNodeStore() {
  useNodeStore.setState({
    nodes: new Map(),
    workspaceNodes: new Map(),
    activeWorkspaceId: '',
    worktreeCwd: null,
    focusedNodeId: null,
    selectedNodeIds: new Set(),
  })
}

describe('nodeStore.add() cwd injection', () => {
  beforeEach(() => {
    resetNodeStore()
  })

  it('uses explicit cwd when worktreeCwd is null', () => {
    useNodeStore.getState().loadWorkspace('ws-1', new Map())
    useNodeStore.getState().setWorktreeCwd(null)

    const node = useNodeStore.getState().add('terminal', 0, 0, { cwd: '/main/path' })
    expect(node.props.cwd).toBe('/main/path')
  })

  it('OVERRIDES explicit cwd when worktreeCwd is set', () => {
    useNodeStore.getState().loadWorkspace('wt-branch-1', new Map())
    useNodeStore.getState().setWorktreeCwd('/repo/.worktrees/my-branch')

    // Callers like context menu always pass cwd from getActiveWorkspace()
    const node = useNodeStore.getState().add('terminal', 0, 0, { cwd: '/main/workspace/path' })
    expect(node.props.cwd).toBe('/repo/.worktrees/my-branch')
  })

  it('overrides cwd for claude nodes too', () => {
    useNodeStore.getState().loadWorkspace('wt-branch-1', new Map())
    useNodeStore.getState().setWorktreeCwd('/repo/.worktrees/feature')

    const node = useNodeStore.getState().add('claude', 0, 0, { cwd: '/wrong/path' })
    expect(node.props.cwd).toBe('/repo/.worktrees/feature')
  })

  it('injects cwd even when props has no cwd at all', () => {
    useNodeStore.getState().loadWorkspace('wt-branch-1', new Map())
    useNodeStore.getState().setWorktreeCwd('/repo/.worktrees/feature')

    const node = useNodeStore.getState().add('terminal', 0, 0)
    expect(node.props.cwd).toBe('/repo/.worktrees/feature')
  })

  it('does NOT inject worktreeCwd when it is null', () => {
    useNodeStore.getState().loadWorkspace('ws-1', new Map())
    useNodeStore.getState().setWorktreeCwd(null)

    const node = useNodeStore.getState().add('terminal', 0, 0)
    expect(node.props.cwd).toBeUndefined()
  })

  it('preserves other props when injecting cwd', () => {
    useNodeStore.getState().loadWorkspace('wt-branch-1', new Map())
    useNodeStore.getState().setWorktreeCwd('/repo/.worktrees/feature')

    const node = useNodeStore.getState().add('claude', 0, 0, {
      cwd: '/wrong',
      claudeFlags: '--dangerously-skip-permissions',
      customProp: 'hello',
    })
    expect(node.props.cwd).toBe('/repo/.worktrees/feature')
    expect(node.props.claudeFlags).toBe('--dangerously-skip-permissions')
    expect(node.props.customProp).toBe('hello')
  })
})

describe('nodeStore workspace isolation', () => {
  beforeEach(() => {
    resetNodeStore()
  })

  it('nodes added to worktree view stay in worktree workspace, not main', () => {
    // Setup main workspace with a node
    const mainNodes = new Map()
    useNodeStore.getState().loadWorkspace('main-ws', mainNodes)
    const mainNode = useNodeStore.getState().add('terminal', 0, 0, { cwd: '/main' })

    expect(useNodeStore.getState().nodes.size).toBe(1)
    expect(useNodeStore.getState().nodes.get(mainNode.id)).toBeDefined()

    // Switch to worktree view
    useNodeStore.getState().loadWorkspace('wt-feature-123', new Map())
    useNodeStore.getState().setWorktreeCwd('/repo/.worktrees/feature')

    // Main nodes are gone from active view
    expect(useNodeStore.getState().nodes.size).toBe(0)

    // Add node to worktree
    const wtNode = useNodeStore.getState().add('claude', 0, 0, { cwd: '/whatever' })
    expect(useNodeStore.getState().nodes.size).toBe(1)

    // Worktree node is in worktree workspace
    const wtWsNodes = useNodeStore.getState().workspaceNodes.get('wt-feature-123')
    expect(wtWsNodes?.has(wtNode.id)).toBe(true)

    // Main workspace nodes are untouched
    const mainWsNodes = useNodeStore.getState().workspaceNodes.get('main-ws')
    expect(mainWsNodes?.has(mainNode.id)).toBe(true)
    expect(mainWsNodes?.has(wtNode.id)).toBeFalsy()
  })

  it('switching back to main restores main nodes without worktree nodes', () => {
    // Setup main workspace
    useNodeStore.getState().loadWorkspace('main-ws', new Map())
    const mainNode = useNodeStore.getState().add('terminal', 0, 0, { cwd: '/main' })

    // Switch to worktree
    useNodeStore.getState().loadWorkspace('wt-feat-1', new Map())
    const wtNode = useNodeStore.getState().add('claude', 0, 0)

    // Switch back to main
    const mainNodes = useNodeStore.getState().workspaceNodes.get('main-ws')!
    useNodeStore.getState().loadWorkspace('main-ws', mainNodes)

    // Main should have its original node, not the worktree node
    expect(useNodeStore.getState().nodes.has(mainNode.id)).toBe(true)
    expect(useNodeStore.getState().nodes.has(wtNode.id)).toBe(false)
    expect(useNodeStore.getState().nodes.size).toBe(1)
  })

  it('worktreeCwd is cleared when switching back to main', () => {
    useNodeStore.getState().loadWorkspace('main-ws', new Map())

    // Switch to worktree
    useNodeStore.getState().loadWorkspace('wt-feat-1', new Map())
    useNodeStore.getState().setWorktreeCwd('/repo/.worktrees/feat')
    expect(useNodeStore.getState().worktreeCwd).toBe('/repo/.worktrees/feat')

    // Switch back
    useNodeStore.getState().setWorktreeCwd(null)
    expect(useNodeStore.getState().worktreeCwd).toBeNull()

    // New terminal should NOT get worktree cwd
    const node = useNodeStore.getState().add('terminal', 0, 0, { cwd: '/main' })
    expect(node.props.cwd).toBe('/main')
  })

  it('multiple worktree views have independent node sets', () => {
    useNodeStore.getState().loadWorkspace('main-ws', new Map())

    // Worktree 1
    useNodeStore.getState().loadWorkspace('wt-feat-1', new Map())
    useNodeStore.getState().setWorktreeCwd('/wt/feat1')
    const n1 = useNodeStore.getState().add('claude', 0, 0)

    // Worktree 2
    useNodeStore.getState().loadWorkspace('wt-feat-2', new Map())
    useNodeStore.getState().setWorktreeCwd('/wt/feat2')
    const n2 = useNodeStore.getState().add('claude', 0, 0)

    // Each worktree has its own nodes
    const wt1Nodes = useNodeStore.getState().workspaceNodes.get('wt-feat-1')!
    const wt2Nodes = useNodeStore.getState().workspaceNodes.get('wt-feat-2')!

    expect(wt1Nodes.has(n1.id)).toBe(true)
    expect(wt1Nodes.has(n2.id)).toBe(false)
    expect(wt2Nodes.has(n2.id)).toBe(true)
    expect(wt2Nodes.has(n1.id)).toBe(false)
  })
})
