import { useRef, useEffect, useCallback } from 'react'
import type { NodeLifecycleController, NodeHealthStatus } from '../../../plugins/types'

/**
 * Global registry mapping nodeId → lifecycle controller.
 * Built-in nodes (terminal, browser) register here directly.
 * Plugin nodes register via their PluginLifecycle hooks (adapted in NodeLayer).
 */
const controllers = new Map<string, NodeLifecycleController>()

export function registerLifecycleController(nodeId: string, controller: NodeLifecycleController): void {
  controllers.set(nodeId, controller)
}

export function unregisterLifecycleController(nodeId: string): void {
  controllers.delete(nodeId)
}

export function getLifecycleController(nodeId: string): NodeLifecycleController | undefined {
  return controllers.get(nodeId)
}

/**
 * Notify a node that it entered the viewport.
 */
export function resumeNode(nodeId: string): void {
  controllers.get(nodeId)?.resume?.()
}

/**
 * Notify a node that it left the viewport.
 */
export function suspendNode(nodeId: string): void {
  controllers.get(nodeId)?.suspend?.()
}

/**
 * Attempt crash recovery for a node.
 */
export async function retryNode(nodeId: string): Promise<boolean> {
  return (await controllers.get(nodeId)?.retry?.()) ?? false
}

/**
 * Check the health of a node.
 */
export function checkNodeHealth(nodeId: string): NodeHealthStatus {
  return controllers.get(nodeId)?.healthCheck?.() ?? 'healthy'
}

/**
 * Hook that tracks whether a node is "visible" (in the viewport or keep-alive)
 * and calls suspend/resume on transitions.
 */
export function useNodeVisibility(nodeId: string, isVisible: boolean): void {
  const prevVisible = useRef(isVisible)

  useEffect(() => {
    if (isVisible && !prevVisible.current) {
      resumeNode(nodeId)
    } else if (!isVisible && prevVisible.current) {
      suspendNode(nodeId)
    }
    prevVisible.current = isVisible
  }, [nodeId, isVisible])

  // Suspend on unmount
  useEffect(() => {
    return () => {
      suspendNode(nodeId)
    }
  }, [nodeId])
}
