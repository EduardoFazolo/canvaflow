# Standardized Node Lifecycle Hooks

## Problem

Each node type manages its own lifecycle independently. There's no consistent way to pause, resume, retry, or inspect the health of a node. This makes features like off-screen suspension and crash recovery harder to implement per-node-type.

## Proposal

Extend the plugin interface with standardized lifecycle hooks that the canvas layer can call.

### New Hooks on `CanvaFlowPlugin`

```typescript
interface CanvaFlowPlugin {
  // existing fields...

  lifecycle?: {
    /** Called when node enters the viewport */
    onResume?: (nodeId: string) => void

    /** Called when node leaves the viewport */
    onSuspend?: (nodeId: string) => void

    /** Called to attempt recovery after a crash */
    onRetry?: (nodeId: string) => Promise<boolean>

    /** Called periodically to check if the node is healthy */
    onHealthCheck?: (nodeId: string) => Promise<'healthy' | 'degraded' | 'dead'>
  }
}
```

### Built-in Node Types

Terminal and Browser nodes aren't plugins, but they should implement the same interface internally. Create a `NodeLifecycleController` that wraps each node type:

```typescript
interface NodeLifecycleController {
  suspend(): void
  resume(): void
  retry(): Promise<boolean>
  healthCheck(): Promise<'healthy' | 'degraded' | 'dead'>
}
```

### Integration with NodeLayer

`NodeLayer` already tracks which nodes are visible. Wire visibility changes to the lifecycle hooks:

1. Node enters viewport → call `resume()`
2. Node leaves viewport → call `suspend()`
3. Health check timer → call `healthCheck()` for visible nodes
4. Health check returns `dead` → call `retry()`, show recovery overlay if it fails

## Impact

- Provides the foundation for both off-screen suspension (doc 01) and crash recovery (doc 02)
- Makes the plugin system more robust — third-party plugins get lifecycle management for free
- Single place to add future lifecycle features (e.g., serialization, migration)

## Complexity

Low-medium. The interface is small. The real work is implementing it per node type, which is covered in docs 01 and 02.

## Suggested Order

Implement this first, then 01 (suspension) and 02 (crash recovery) build on top of it.
