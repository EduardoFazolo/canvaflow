import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock electron
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  const handleHandlers = new Map<string, (...args: any[]) => any>()

  const webContents = {
    send: vi.fn(),
    isDestroyed: vi.fn(() => false),
  }

  return {
    handleHandlers,
    webContents,
    ipcMain: {
      handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
        handleHandlers.set(channel, handler)
      }),
      on: vi.fn(),
    },
    reset() {
      handleHandlers.clear()
      webContents.send.mockReset()
      webContents.isDestroyed.mockReset()
      webContents.isDestroyed.mockReturnValue(false)
      this.ipcMain.handle.mockClear()
      this.ipcMain.on.mockClear()
    },
  }
})

vi.mock('electron', () => ({
  ipcMain: mocks.ipcMain,
  WebContents: class {},
}))

// ---------------------------------------------------------------------------
// Import the coordinator (after mocks are in place)
// ---------------------------------------------------------------------------

import {
  setupCoordinatorHandlers,
  coordinatorOnData,
  isCoordinated,
} from '../main/agentCoordinator'

// Helpers
function getHandle(channel: string) {
  const handler = mocks.handleHandlers.get(channel)
  if (!handler) throw new Error(`Missing ipcMain.handle for ${channel}`)
  return handler
}

/** Simulate registering an agent via the IPC handler */
async function registerAgent(nodeId: string, task: string) {
  await getHandle('coordinator:register')(undefined, nodeId, task)
}

/** Simulate unregistering an agent via the IPC handler */
async function unregisterAgent(nodeId: string) {
  await getHandle('coordinator:unregister')(undefined, nodeId)
}

/** Simulate PTY data arriving — this is what pty.ts calls */
function emitData(nodeId: string, data: string, writeFn: ReturnType<typeof vi.fn>) {
  coordinatorOnData(nodeId, data, writeFn)
}

/** Helper to wrap ANSI codes around text like a real terminal would */
function ansi(text: string): string {
  return `\x1b[1m\x1b[38;5;208m${text}\x1b[0m`
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Agent Coordinator', () => {
  beforeEach(() => {
    mocks.reset()
    setupCoordinatorHandlers(() => mocks.webContents as any)
  })

  afterEach(async () => {
    // Clean up all registered agents
    const status = await getHandle('coordinator:status')(undefined)
    for (const agent of status) {
      await unregisterAgent(agent.nodeId)
    }
  })

  // =========================================================================
  // Registration
  // =========================================================================

  describe('registration', () => {
    it('tracks registered agents', async () => {
      await registerAgent('node-1', 'fix the bug')
      expect(isCoordinated('node-1')).toBe(true)
    })

    it('unregisters agents', async () => {
      await registerAgent('node-1', 'fix the bug')
      await unregisterAgent('node-1')
      expect(isCoordinated('node-1')).toBe(false)
    })

    it('ignores data for unregistered nodes', () => {
      const write = vi.fn()
      // Should not throw or do anything
      emitData('unknown-node', 'hello', write)
      expect(write).not.toHaveBeenCalled()
    })

    it('replaces registration if same node registered twice', async () => {
      await registerAgent('node-1', 'first task')
      await registerAgent('node-1', 'second task')

      const write = vi.fn()
      // Simulate Claude ready prompt
      emitData('node-1', '❯ ', write)

      // Should get a delayed write with "second task", not "first task"
      await vi.waitFor(() => {
        expect(write).toHaveBeenCalled()
      }, { timeout: 1000 })

      const writtenData = write.mock.calls[0][0]
      expect(writtenData).toContain('second task\r')
    })
  })

  // =========================================================================
  // Bypass permissions prompt
  // =========================================================================

  describe('bypass permissions prompt', () => {
    it('auto-accepts when "Yes, I accept" appears', async () => {
      await registerAgent('node-1', 'do the thing')
      const write = vi.fn()

      emitData('node-1', [
        'WARNING: Claude Code running in Bypass Permissions mode',
        '',
        'By proceeding, you accept all responsibility...',
        '',
        '❯ 1. No, exit',
        '  2. Yes, I accept',
        '',
        'Enter to confirm',
      ].join('\r\n'), write)

      // Should send down arrow + enter after delay
      await vi.waitFor(() => {
        expect(write).toHaveBeenCalled()
      }, { timeout: 1000 })

      expect(write.mock.calls[0][0]).toBe('\x1b[B\r')
    })

    it('auto-accepts even when wrapped in ANSI escape codes', async () => {
      await registerAgent('node-1', 'do the thing')
      const write = vi.fn()

      emitData('node-1', ansi('  2. Yes, I accept') + '\r\n', write)

      await vi.waitFor(() => {
        expect(write).toHaveBeenCalled()
      }, { timeout: 1000 })

      expect(write.mock.calls[0][0]).toBe('\x1b[B\r')
    })

    it('does not fire bypass-permissions twice', async () => {
      await registerAgent('node-1', 'do the thing')
      const write = vi.fn()

      emitData('node-1', 'Yes, I accept\r\n', write)
      await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1), { timeout: 1000 })

      // Send it again — should NOT trigger
      emitData('node-1', 'Yes, I accept\r\n', write)
      await new Promise((r) => setTimeout(r, 400))
      expect(write).toHaveBeenCalledTimes(1)
    })
  })

  // =========================================================================
  // Task injection
  // =========================================================================

  describe('task injection', () => {
    it('injects task when ❯ prompt appears (clean text)', async () => {
      await registerAgent('node-1', 'fix the login bug')
      const write = vi.fn()

      emitData('node-1', '❯ ', write)

      await vi.waitFor(() => {
        expect(write).toHaveBeenCalled()
      }, { timeout: 1000 })

      expect(write.mock.calls[0][0]).toBe('fix the login bug\r')
    })

    it('injects task when ❯ prompt appears wrapped in ANSI codes', async () => {
      await registerAgent('node-1', 'fix it')
      const write = vi.fn()

      emitData('node-1', '\x1b[38;5;141m❯\x1b[0m ', write)

      await vi.waitFor(() => {
        expect(write).toHaveBeenCalled()
      }, { timeout: 1000 })

      expect(write.mock.calls[0][0]).toBe('fix it\r')
    })

    it('injects task when > prompt appears', async () => {
      await registerAgent('node-1', 'do stuff')
      const write = vi.fn()

      emitData('node-1', '> ', write)

      await vi.waitFor(() => {
        expect(write).toHaveBeenCalled()
      }, { timeout: 1000 })

      expect(write.mock.calls[0][0]).toBe('do stuff\r')
    })

    it('does NOT inject task twice', async () => {
      await registerAgent('node-1', 'fix it')
      const write = vi.fn()

      emitData('node-1', '❯ ', write)
      await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1), { timeout: 1000 })

      // Prompt appears again after task completes — should NOT re-inject
      emitData('node-1', '❯ ', write)
      await new Promise((r) => setTimeout(r, 500))
      expect(write).toHaveBeenCalledTimes(1)
    })

    it('injects task AFTER accepting permissions prompt', async () => {
      await registerAgent('node-1', 'my task')
      const write = vi.fn()

      // First: permissions prompt
      emitData('node-1', 'Yes, I accept\r\n', write)
      await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1), { timeout: 1000 })
      expect(write.mock.calls[0][0]).toBe('\x1b[B\r') // accepted

      // Then: Claude ready
      emitData('node-1', '❯ ', write)
      await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(2), { timeout: 1000 })
      expect(write.mock.calls[1][0]).toBe('my task\r')
    })
  })

  // =========================================================================
  // Prompt appears with delay / in chunks
  // =========================================================================

  describe('chunked / delayed output', () => {
    it('handles prompt split across multiple data chunks', async () => {
      await registerAgent('node-1', 'fix bug')
      const write = vi.fn()

      // "Yes, I accept" arrives in two chunks
      emitData('node-1', 'Yes, I a', write)
      expect(write).not.toHaveBeenCalled()

      emitData('node-1', 'ccept\r\n', write)
      await vi.waitFor(() => expect(write).toHaveBeenCalled(), { timeout: 1000 })
      expect(write.mock.calls[0][0]).toBe('\x1b[B\r')
    })

    it('handles ready prompt arriving in a later chunk', async () => {
      await registerAgent('node-1', 'do it')
      const write = vi.fn()

      // Boot output, no prompt yet
      emitData('node-1', 'Claude Code v2.1.84\r\nOpus 4.6\r\n', write)
      expect(write).not.toHaveBeenCalled()

      // Prompt arrives later
      emitData('node-1', '❯ ', write)
      await vi.waitFor(() => expect(write).toHaveBeenCalled(), { timeout: 1000 })
      expect(write.mock.calls[0][0]).toBe('do it\r')
    })

    it('handles permissions prompt that never appears', async () => {
      await registerAgent('node-1', 'task without perms')
      const write = vi.fn()

      // Claude boots straight to the prompt (no permissions dialog)
      emitData('node-1', 'Claude Code v2.1.84\r\n❯ ', write)

      await vi.waitFor(() => expect(write).toHaveBeenCalled(), { timeout: 1000 })
      // Should inject task directly, no accept attempt
      expect(write.mock.calls[0][0]).toBe('task without perms\r')
    })
  })

  // =========================================================================
  // Multiple concurrent agents
  // =========================================================================

  describe('multiple concurrent agents', () => {
    it('handles two agents independently', async () => {
      await registerAgent('node-1', 'task one')
      await registerAgent('node-2', 'task two')
      const write1 = vi.fn()
      const write2 = vi.fn()

      emitData('node-1', '❯ ', write1)
      emitData('node-2', '❯ ', write2)

      await vi.waitFor(() => {
        expect(write1).toHaveBeenCalled()
        expect(write2).toHaveBeenCalled()
      }, { timeout: 1000 })

      expect(write1.mock.calls[0][0]).toBe('task one\r')
      expect(write2.mock.calls[0][0]).toBe('task two\r')
    })

    it('one agent accepting permissions does not affect the other', async () => {
      await registerAgent('node-1', 'task one')
      await registerAgent('node-2', 'task two')
      const write1 = vi.fn()
      const write2 = vi.fn()

      // node-1 gets permissions prompt
      emitData('node-1', 'Yes, I accept\r\n', write1)
      // node-2 goes straight to ready
      emitData('node-2', '❯ ', write2)

      await vi.waitFor(() => {
        expect(write1).toHaveBeenCalled()
        expect(write2).toHaveBeenCalled()
      }, { timeout: 1000 })

      expect(write1.mock.calls[0][0]).toBe('\x1b[B\r') // accepted
      expect(write2.mock.calls[0][0]).toBe('task two\r') // task injected
    })
  })

  // =========================================================================
  // Mid-session y/n prompts
  // =========================================================================

  describe('mid-session prompts', () => {
    it('auto-accepts (y/n) prompt during work', async () => {
      await registerAgent('node-1', 'big refactor')
      const write = vi.fn()

      // Boot and inject task
      emitData('node-1', '❯ ', write)
      await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1), { timeout: 1000 })

      // Reset mock to track only mid-session writes
      write.mockClear()

      // Mid-session y/n prompt
      emitData('node-1', 'Apply changes? (y/n) ', write)
      await vi.waitFor(() => expect(write).toHaveBeenCalled(), { timeout: 1000 })
      expect(write.mock.calls[0][0]).toBe('y')
    })

    it('auto-accepts (Y/n) proceed prompt during work', async () => {
      await registerAgent('node-1', 'task')
      const write = vi.fn()

      emitData('node-1', '❯ ', write)
      await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1), { timeout: 1000 })
      write.mockClear()

      emitData('node-1', 'Do you want to proceed? (Y/n) ', write)
      await vi.waitFor(() => expect(write).toHaveBeenCalled(), { timeout: 1000 })
      expect(write.mock.calls[0][0]).toBe('Y')
    })
  })

  // =========================================================================
  // Status reporting
  // =========================================================================

  describe('status IPC', () => {
    it('reports status back to renderer on prompt acceptance', async () => {
      await registerAgent('node-1', 'task')
      const write = vi.fn()

      emitData('node-1', 'Yes, I accept\r\n', write)

      expect(mocks.webContents.send).toHaveBeenCalledWith(
        'coordinator:status',
        expect.objectContaining({ nodeId: 'node-1', phase: 'accepting-prompt' }),
      )
    })

    it('reports status on task injection', async () => {
      await registerAgent('node-1', 'task')
      const write = vi.fn()

      emitData('node-1', '❯ ', write)

      expect(mocks.webContents.send).toHaveBeenCalledWith(
        'coordinator:status',
        expect.objectContaining({ nodeId: 'node-1', phase: 'injecting-task' }),
      )
    })

    it('returns all agent statuses via coordinator:status', async () => {
      await registerAgent('node-1', 'task one')
      await registerAgent('node-2', 'task two')

      const status = await getHandle('coordinator:status')(undefined)
      expect(status).toHaveLength(2)
      expect(status[0].nodeId).toBe('node-1')
      expect(status[1].nodeId).toBe('node-2')
    })
  })

  // =========================================================================
  // Edge cases
  // =========================================================================

  describe('edge cases', () => {
    it('handles empty data chunks', async () => {
      await registerAgent('node-1', 'task')
      const write = vi.fn()
      emitData('node-1', '', write)
      expect(write).not.toHaveBeenCalled()
    })

    it('buffer does not grow unbounded', async () => {
      await registerAgent('node-1', 'task')
      const write = vi.fn()
      // Send 10KB of data
      const bigChunk = 'x'.repeat(10000)
      emitData('node-1', bigChunk, write)
      // The coordinator should have trimmed the buffer internally
      // (we can't inspect directly, but it shouldn't crash)
      expect(write).not.toHaveBeenCalled()
    })

    it('does not crash if webContents is destroyed', async () => {
      mocks.webContents.isDestroyed.mockReturnValue(true)
      await registerAgent('node-1', 'task')
      const write = vi.fn()
      // Should not throw
      emitData('node-1', '❯ ', write)
      await vi.waitFor(() => expect(write).toHaveBeenCalled(), { timeout: 1000 })
    })

    it('unregistering mid-session stops all handling', async () => {
      await registerAgent('node-1', 'task')
      const write = vi.fn()

      await unregisterAgent('node-1')
      emitData('node-1', '❯ ', write)
      await new Promise((r) => setTimeout(r, 500))
      expect(write).not.toHaveBeenCalled()
    })
  })
})
