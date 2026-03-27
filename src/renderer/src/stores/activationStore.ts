import { create } from 'zustand'
import { onCanvasInteractionStart, onCanvasInteractionEnd } from '../utils/canvasInteraction'

/**
 * Staggered activation queue for heavy nodes (browsers, terminals).
 *
 * Core principle: canvas interaction (zoom/pan) is ABSOLUTE priority.
 * While the canvas is moving, the queue is frozen — zero activations happen.
 * Once the canvas settles, the queue resumes one node at a time with a delay.
 * User clicks always bypass the queue and activate immediately.
 */

const STAGGER_DELAY_MS = 150 // ms between each node activation
const SETTLE_DELAY_MS = 300  // ms after canvas stops before resuming queue

interface ActivationState {
  activated: Record<string, true>
  activate: (nodeId: string) => void
  isActivated: (nodeId: string) => boolean
  /** Queue multiple nodes for staggered activation */
  queueActivation: (nodeIds: string[], priorityIds?: string[]) => void
  /** Immediately activate a node (user clicked it — cuts the queue) */
  activateNow: (nodeId: string) => void
}

let _queue: string[] = []
let _timer: ReturnType<typeof setTimeout> | null = null
let _paused = false
let _settleTimer: ReturnType<typeof setTimeout> | null = null

function stopTimer(): void {
  if (_timer !== null) {
    clearTimeout(_timer)
    _timer = null
  }
}

function processQueue(): void {
  _timer = null

  // Don't activate anything while canvas is moving
  if (_paused || _queue.length === 0) return

  const nodeId = _queue.shift()!
  const { activated, activate } = useActivationStore.getState()
  if (!activated[nodeId]) {
    activate(nodeId)
  }

  if (_queue.length > 0) {
    _timer = setTimeout(processQueue, STAGGER_DELAY_MS)
  }
}

function pauseQueue(): void {
  _paused = true
  stopTimer()
  if (_settleTimer !== null) {
    clearTimeout(_settleTimer)
    _settleTimer = null
  }
}

function resumeQueue(): void {
  // Don't resume immediately — wait for canvas to fully settle
  if (_settleTimer !== null) clearTimeout(_settleTimer)
  _settleTimer = setTimeout(() => {
    _settleTimer = null
    _paused = false
    if (_queue.length > 0 && _timer === null) {
      processQueue()
    }
  }, SETTLE_DELAY_MS)
}

// Listen to canvas interaction events globally
onCanvasInteractionStart(pauseQueue)
onCanvasInteractionEnd(resumeQueue)

export const useActivationStore = create<ActivationState>((set, get) => ({
  activated: {},

  activate: (nodeId) => {
    if (get().activated[nodeId]) return
    set((s) => ({ activated: { ...s.activated, [nodeId]: true } }))
  },

  isActivated: (nodeId) => !!get().activated[nodeId],

  queueActivation: (nodeIds, priorityIds) => {
    stopTimer()

    const already = get().activated

    // Priority nodes go first (e.g. visible/focused nodes)
    const prioritySet = new Set(priorityIds ?? [])
    const priority: string[] = []
    const rest: string[] = []

    for (const id of nodeIds) {
      if (already[id]) continue
      if (prioritySet.has(id)) {
        priority.push(id)
      } else {
        rest.push(id)
      }
    }

    _queue = [...priority, ...rest]

    if (!_paused) {
      processQueue()
    }
  },

  activateNow: (nodeId) => {
    if (get().activated[nodeId]) return

    // Remove from queue if pending
    _queue = _queue.filter((id) => id !== nodeId)

    // Activate immediately — user click always wins
    get().activate(nodeId)
  },
}))
