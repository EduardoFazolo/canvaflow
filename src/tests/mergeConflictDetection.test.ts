import { describe, it, expect, beforeEach, vi } from 'vitest'
import { parseMergeTreeConflicts } from '../plugins/monaco/main/gitHandlers'

// ---------------------------------------------------------------------------
// parseMergeTreeConflicts — unit tests for the parser
// ---------------------------------------------------------------------------

describe('parseMergeTreeConflicts', () => {
  it('parses CONFLICT lines from merge-tree output', () => {
    const output = [
      '9450bc5c63ee242c88245d50ff3167c0ba87b4a6',
      '',
      'Auto-merging src/plugins/kanban/renderer/KanbanNode.tsx',
      'CONFLICT (content): Merge conflict in src/plugins/kanban/renderer/KanbanNode.tsx',
    ].join('\n')

    const files = parseMergeTreeConflicts(output)
    expect(files).toEqual(['src/plugins/kanban/renderer/KanbanNode.tsx'])
  })

  it('parses raw stage lines (100644 hash stage\\tfile)', () => {
    const output = [
      '9450bc5c63ee242c88245d50ff3167c0ba87b4a6',
      '100644 9e5736d047804435904dfaa99a733ab3825ded5b 1\tsrc/components/App.tsx',
      '100644 253d0a1271eb2f14547bb00a675db266caaefebe 2\tsrc/components/App.tsx',
      '100644 3139c104ffc17af4928ec43f8863421b6b340644 3\tsrc/components/App.tsx',
    ].join('\n')

    const files = parseMergeTreeConflicts(output)
    expect(files).toEqual(['src/components/App.tsx'])
  })

  it('deduplicates files that appear in both CONFLICT and raw lines', () => {
    const output = [
      '9450bc5c63ee242c88245d50ff3167c0ba87b4a6',
      '100644 aaa 1\tsrc/foo.ts',
      '100644 bbb 2\tsrc/foo.ts',
      '100644 ccc 3\tsrc/foo.ts',
      '',
      'Auto-merging src/foo.ts',
      'CONFLICT (content): Merge conflict in src/foo.ts',
    ].join('\n')

    const files = parseMergeTreeConflicts(output)
    expect(files).toEqual(['src/foo.ts'])
  })

  it('handles multiple conflicting files', () => {
    const output = [
      'abc123',
      '100644 aaa 1\tsrc/a.ts',
      '100644 bbb 2\tsrc/a.ts',
      '100644 ccc 3\tsrc/a.ts',
      '100644 ddd 1\tsrc/b.ts',
      '100644 eee 2\tsrc/b.ts',
      '100644 fff 3\tsrc/b.ts',
      '',
      'Auto-merging src/a.ts',
      'CONFLICT (content): Merge conflict in src/a.ts',
      'Auto-merging src/b.ts',
      'CONFLICT (content): Merge conflict in src/b.ts',
    ].join('\n')

    const files = parseMergeTreeConflicts(output)
    expect(files).toEqual(['src/a.ts', 'src/b.ts'])
  })

  it('returns empty array for clean merge output', () => {
    const output = 'abc123def456789\n'
    const files = parseMergeTreeConflicts(output)
    expect(files).toEqual([])
  })

  it('returns empty array for empty string', () => {
    expect(parseMergeTreeConflicts('')).toEqual([])
  })

  it('handles CONFLICT (add/add) type', () => {
    const output = 'CONFLICT (add/add): Merge conflict in new-file.ts\n'
    const files = parseMergeTreeConflicts(output)
    expect(files).toEqual(['new-file.ts'])
  })

  it('handles CONFLICT (modify/delete) type', () => {
    const output = 'CONFLICT (modify/delete): Merge conflict in deleted-file.ts\n'
    const files = parseMergeTreeConflicts(output)
    expect(files).toEqual(['deleted-file.ts'])
  })

  it('handles files with spaces in their names', () => {
    const output = 'CONFLICT (content): Merge conflict in src/my component.tsx\n'
    const files = parseMergeTreeConflicts(output)
    expect(files).toEqual(['src/my component.tsx'])
  })

  it('ignores Auto-merging lines (no conflict)', () => {
    const output = [
      'abc123',
      'Auto-merging src/clean-file.ts',
    ].join('\n')

    const files = parseMergeTreeConflicts(output)
    expect(files).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Kanban store conflicts state
// ---------------------------------------------------------------------------

// Mock window.appState before importing the store
vi.stubGlobal('window', {
  appState: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
  },
})

// Import after mocking window
const { useKanbanStore } = await import('../plugins/kanban/store')

describe('kanban store conflict tracking', () => {
  beforeEach(() => {
    useKanbanStore.getState().setConflicts({})
  })

  it('starts with empty conflicts', () => {
    expect(useKanbanStore.getState().conflicts).toEqual({})
  })

  it('setConflicts stores the conflict map', () => {
    const conflicts = {
      'feature-branch': ['src/app.ts', 'src/index.ts'],
      'fix-bug': ['src/utils.ts'],
    }
    useKanbanStore.getState().setConflicts(conflicts)
    expect(useKanbanStore.getState().conflicts).toEqual(conflicts)
  })

  it('setConflicts replaces previous conflicts entirely', () => {
    useKanbanStore.getState().setConflicts({ 'old-branch': ['a.ts'] })
    useKanbanStore.getState().setConflicts({ 'new-branch': ['b.ts'] })

    const conflicts = useKanbanStore.getState().conflicts
    expect(conflicts['old-branch']).toBeUndefined()
    expect(conflicts['new-branch']).toEqual(['b.ts'])
  })

  it('setConflicts with empty object clears all conflicts', () => {
    useKanbanStore.getState().setConflicts({ branch: ['file.ts'] })
    useKanbanStore.getState().setConflicts({})
    expect(useKanbanStore.getState().conflicts).toEqual({})
  })
})
