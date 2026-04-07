import React, { useEffect, useState } from 'react'
import type { ParsedFileDiff } from './types'
import type { ReviewThread } from '../../../../modules/servers/canvaflow_mcp/shared/types'
import type { NodeData } from '../../stores/nodeStore'
import { DiffLineRow } from './DiffLineRow'
import { ThreadCard } from './ThreadCard'
import { langForFile } from './shikiHighlighter'

const STATUS_LABEL: Record<string, string> = {
  A: 'Added', M: 'Modified', D: 'Deleted', R: 'Renamed', C: 'Copied',
}

const STATUS_COLOR: Record<string, string> = {
  A: '#73c991', M: '#e2c08d', D: '#f44747', R: '#73c991', C: '#73c991',
}

export function FileDiffView({
  file,
  status,
  worktreePath,
  baseRef,
  headRef,
  threads,
  reviewId,
  branchName,
  agents,
}: {
  file: string
  status: string
  worktreePath: string
  baseRef: string
  headRef: string
  threads: ReviewThread[]
  reviewId: string
  branchName: string
  agents: NodeData[]
}): React.ReactElement {
  const [diff, setDiff] = useState<ParsedFileDiff | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setDiff(null)
    let cancelled = false
    window.git.fileDiff(worktreePath, baseRef, headRef, file).then((result) => {
      if (cancelled) return
      setDiff(result)
      setLoading(false)
    }).catch(() => {
      if (cancelled) return
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [worktreePath, baseRef, headRef, file])

  const language = langForFile(file)

  // Group threads by anchor line for fast lookup
  const threadsByLine = new Map<number, ReviewThread[]>()
  for (const t of threads) {
    const list = threadsByLine.get(t.line) ?? []
    list.push(t)
    threadsByLine.set(t.line, list)
  }

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      minWidth: 0,
      overflow: 'auto',
    }}>
      {/* File header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 2,
        padding: '8px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', gap: 8,
        background: '#0d0d0d',
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: 9, fontWeight: 700,
          color: STATUS_COLOR[status] ?? 'rgba(255,255,255,0.5)',
          padding: '1px 5px', borderRadius: 3,
          background: 'rgba(255,255,255,0.06)',
          fontFamily: 'monospace',
        }}>
          {STATUS_LABEL[status] ?? 'Changed'}
        </span>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', fontFamily: 'monospace' }}>
          {file}
        </span>
      </div>

      {/* Diff content */}
      {loading ? (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'rgba(255,255,255,0.3)', fontSize: 12,
        }}>
          Loading diff...
        </div>
      ) : !diff || diff.hunks.length === 0 ? (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'rgba(255,255,255,0.3)', fontSize: 12,
        }}>
          No changes
        </div>
      ) : (
        <div style={{ paddingBottom: 40 }}>
          {diff.hunks.map((hunk, hi) => (
            <div key={hi}>
              {/* Hunk header */}
              <div style={{
                padding: '4px 16px 4px 124px',
                background: 'rgba(110,118,129,0.08)',
                borderTop: hi > 0 ? '1px solid rgba(255,255,255,0.04)' : undefined,
                fontSize: 11,
                fontFamily: "'JetBrains Mono', monospace",
                color: 'rgba(139,148,158,0.7)',
                userSelect: 'none',
              }}>
                @@ -{hunk.oldStart},{hunk.oldCount} +{hunk.newStart},{hunk.newCount} @@ {hunk.header}
              </div>
              {/* Hunk lines + inline comment threads */}
              {hunk.lines.map((line, li) => {
                // Threads are anchored to modified-file line numbers
                const lineThreads = line.newLine != null
                  ? threadsByLine.get(line.newLine) ?? []
                  : []
                return (
                  <React.Fragment key={li}>
                    <DiffLineRow line={line} language={language} />
                    {lineThreads.length > 0 && (
                      <div style={{
                        padding: '6px 16px 6px 124px',
                        background: '#0d0d0d',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}>
                        {lineThreads.map((t) => (
                          <ThreadCard
                            key={t.id}
                            thread={t}
                            reviewId={reviewId}
                            branchName={branchName}
                            agents={agents}
                          />
                        ))}
                      </div>
                    )}
                  </React.Fragment>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
