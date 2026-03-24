import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerLifecycleController,
  unregisterLifecycleController,
  getLifecycleController,
  resumeNode,
  suspendNode,
  retryNode,
  checkNodeHealth,
} from '../renderer/src/hooks/useNodeLifecycle'
import type { NodeLifecycleController, NodeHealthStatus, PluginLifecycle, CanvaFlowPlugin } from '../plugins/types'
import { PluginRegistry } from '../plugins/types'

// ---------------------------------------------------------------------------
// Lifecycle controller registry
// ---------------------------------------------------------------------------

describe('lifecycle controller registry', () => {
  beforeEach(() => {
    unregisterLifecycleController('test-node')
    unregisterLifecycleController('node-a')
    unregisterLifecycleController('node-b')
  })

  it('registers and retrieves a controller', () => {
    const ctrl: NodeLifecycleController = { resume() {}, suspend() {} }
    registerLifecycleController('test-node', ctrl)
    expect(getLifecycleController('test-node')).toBe(ctrl)
  })

  it('returns undefined for unregistered nodes', () => {
    expect(getLifecycleController('unknown')).toBeUndefined()
  })

  it('unregisters a controller', () => {
    registerLifecycleController('test-node', {})
    unregisterLifecycleController('test-node')
    expect(getLifecycleController('test-node')).toBeUndefined()
  })

  it('overwrites a controller on re-register', () => {
    const ctrl1: NodeLifecycleController = {}
    const ctrl2: NodeLifecycleController = {}
    registerLifecycleController('test-node', ctrl1)
    registerLifecycleController('test-node', ctrl2)
    expect(getLifecycleController('test-node')).toBe(ctrl2)
  })
})

// ---------------------------------------------------------------------------
// resumeNode / suspendNode
// ---------------------------------------------------------------------------

describe('resumeNode / suspendNode', () => {
  beforeEach(() => {
    unregisterLifecycleController('test-node')
  })

  it('calls resume on the registered controller', () => {
    let called = false
    registerLifecycleController('test-node', { resume() { called = true } })
    resumeNode('test-node')
    expect(called).toBe(true)
  })

  it('calls suspend on the registered controller', () => {
    let called = false
    registerLifecycleController('test-node', { suspend() { called = true } })
    suspendNode('test-node')
    expect(called).toBe(true)
  })

  it('is a no-op for unregistered nodes', () => {
    expect(() => resumeNode('unknown')).not.toThrow()
    expect(() => suspendNode('unknown')).not.toThrow()
  })

  it('is a no-op when hooks are not defined', () => {
    registerLifecycleController('test-node', {})
    expect(() => resumeNode('test-node')).not.toThrow()
    expect(() => suspendNode('test-node')).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// retryNode
// ---------------------------------------------------------------------------

describe('retryNode', () => {
  beforeEach(() => {
    unregisterLifecycleController('test-node')
  })

  it('calls retry and returns its result', async () => {
    registerLifecycleController('test-node', {
      async retry() { return true },
    })
    expect(await retryNode('test-node')).toBe(true)
  })

  it('returns false when retry is not defined', async () => {
    registerLifecycleController('test-node', {})
    expect(await retryNode('test-node')).toBe(false)
  })

  it('returns false for unregistered nodes', async () => {
    expect(await retryNode('unknown')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// checkNodeHealth
// ---------------------------------------------------------------------------

describe('checkNodeHealth', () => {
  beforeEach(() => {
    unregisterLifecycleController('test-node')
  })

  it('returns the health status from the controller', () => {
    registerLifecycleController('test-node', {
      healthCheck() { return 'degraded' },
    })
    expect(checkNodeHealth('test-node')).toBe('degraded')
  })

  it('returns healthy when healthCheck is not defined', () => {
    registerLifecycleController('test-node', {})
    expect(checkNodeHealth('test-node')).toBe('healthy')
  })

  it('returns healthy for unregistered nodes', () => {
    expect(checkNodeHealth('unknown')).toBe('healthy')
  })
})

// ---------------------------------------------------------------------------
// PluginLifecycle on CanvaFlowPlugin
// ---------------------------------------------------------------------------

describe('PluginLifecycle interface', () => {
  it('PluginRegistry accepts plugins with lifecycle hooks', () => {
    const registry = new PluginRegistry()
    const calls: string[] = []

    const plugin: CanvaFlowPlugin = {
      id: 'test-plugin',
      nodeType: 'test-plugin',
      defaultSize: { width: 400, height: 300 },
      defaultTitle: 'Test',
      component: (() => null) as any,
      lifecycle: {
        onResume(nodeId) { calls.push(`resume:${nodeId}`) },
        onSuspend(nodeId) { calls.push(`suspend:${nodeId}`) },
        onHealthCheck(nodeId) { calls.push(`health:${nodeId}`); return 'healthy' },
      },
    }

    registry.register(plugin)
    const retrieved = registry.get('test-plugin')
    expect(retrieved).toBe(plugin)

    // Verify lifecycle hooks are callable
    retrieved!.lifecycle!.onResume!('n1')
    retrieved!.lifecycle!.onSuspend!('n1')
    const health = retrieved!.lifecycle!.onHealthCheck!('n1')

    expect(calls).toEqual(['resume:n1', 'suspend:n1', 'health:n1'])
    expect(health).toBe('healthy')
  })

  it('plugins without lifecycle still work', () => {
    const registry = new PluginRegistry()
    const plugin: CanvaFlowPlugin = {
      id: 'bare',
      nodeType: 'bare',
      defaultSize: { width: 100, height: 100 },
      defaultTitle: 'Bare',
      component: (() => null) as any,
    }
    registry.register(plugin)
    expect(registry.get('bare')?.lifecycle).toBeUndefined()
  })
})
