// Shared types for the Code Review view

export type DiffLineKind = 'add' | 'del' | 'ctx'

export interface DiffLine {
  kind: DiffLineKind
  oldLine: number | null
  newLine: number | null
  content: string
}

export interface DiffHunk {
  header: string
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  lines: DiffLine[]
}

export interface ParsedFileDiff {
  hunks: DiffHunk[]
}
