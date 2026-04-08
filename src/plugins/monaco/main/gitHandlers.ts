import { readFile, readdir, symlink, mkdir, unlink, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import simpleGit from 'simple-git'
import type { IpcMainLike } from '../../types'

export interface WorktreeEntry {
  path: string
  head: string
  branch: string
}

const gitCache = new Map<string, ReturnType<typeof simpleGit>>()

function git(rootPath: string) {
  if (!gitCache.has(rootPath)) gitCache.set(rootPath, simpleGit(rootPath))
  return gitCache.get(rootPath)!
}

/**
 * Symlink gitignored files/directories from the original repo into a worktree.
 * If .worktreeinclude exists, only those patterns are linked; otherwise all
 * top-level gitignored items are linked (skipping common junk).
 */
async function symlinkGitignoredFiles(
  rootPath: string,
  worktreePath: string,
  g: ReturnType<typeof simpleGit>,
): Promise<void> {
  try {
    const includeFile = join(rootPath, '.worktreeinclude')
    let items: string[] = []

    if (existsSync(includeFile)) {
      const content = await readFile(includeFile, 'utf-8')
      const patterns = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
      // Expand glob-like patterns by listing matching files in rootPath
      for (const pattern of patterns) {
        // Simple: treat each pattern as a literal path (covers .env, node_modules, prisma/generated, etc.)
        if (existsSync(join(rootPath, pattern))) {
          items.push(pattern)
        }
      }
    } else {
      // Fallback: get all top-level gitignored items. Skip `.worktrees`
      // explicitly — symlinking it into the new worktree would create a
      // recursive self-reference, and it's never something the worktree
      // actually needs.
      const skipRe = /^\.(claude|venv|pythonenv|idea|vscode|DS_Store|worktrees)$|^(bin|lib|__pycache__)$/
      try {
        const output = await g.raw(['ls-files', '--others', '--ignored', '--exclude-standard', '--directory'])
        const seen = new Set<string>()
        for (const line of output.split('\n')) {
          const item = line.replace(/\/$/, '').trim()
          if (!item) continue
          // Only top-level entries
          const topLevel = item.split('/')[0]
          if (seen.has(topLevel)) continue
          seen.add(topLevel)
          if (skipRe.test(topLevel)) continue
          items.push(topLevel)
        }
      } catch { /* ignore */ }
    }

    for (const item of items) {
      // Never symlink the worktrees directory into a worktree — recursive.
      if (item === '.worktrees' || item === '.worktrees/') continue
      const original = join(rootPath, item)
      const target = join(worktreePath, item)
      if (!existsSync(original) || existsSync(target)) continue
      await mkdir(dirname(target), { recursive: true })
      await symlink(original, target)
    }
  } catch { /* non-fatal — worktree still usable, just missing some files */ }
}

/**
 * Common build/cache artifacts that should never show up as untracked in a
 * worktree, regardless of whether the underlying project's .gitignore lists
 * them. Written to the worktree's per-worktree info/exclude (scoped to that
 * worktree only — does not touch the committed .gitignore).
 */
const WORKTREE_LOCAL_EXCLUDES = [
  '.worktrees',
  'node_modules',
  '.turbo',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.cache',
  '.parcel-cache',
  'dist',
  'build',
  'out',
  'target',
  '.venv',
  '__pycache__',
  '*.log',
  '.DS_Store',
]

/**
 * Make sure the project's committed `.gitignore` contains `.worktrees/`. If
 * the file doesn't exist we create it; if the pattern is missing we append it.
 * Idempotent — matches any of the common forms (`.worktrees`, `.worktrees/`,
 * `/.worktrees`, `/.worktrees/`).
 */
async function ensureWorktreesIgnored(rootPath: string): Promise<void> {
  try {
    const gitignorePath = join(rootPath, '.gitignore')
    let existing = ''
    try { existing = await readFile(gitignorePath, 'utf-8') } catch { /* missing → create */ }
    const lines = existing.split('\n').map(l => l.trim())
    const hasWorktrees = lines.some(l => /^\/?\.worktrees\/?$/.test(l))
    if (hasWorktrees) return
    const needsLeadingNewline = existing.length > 0 && !existing.endsWith('\n')
    const addition = (needsLeadingNewline ? '\n' : '') + '.worktrees/\n'
    await writeFile(gitignorePath, existing + addition, 'utf-8')
  } catch (e) {
    console.error('[gitHandlers] ensureWorktreesIgnored failed:', e)
  }
}

async function writeWorktreeLocalExcludes(
  worktreePath: string,
  g: ReturnType<typeof simpleGit>,
): Promise<void> {
  try {
    // Resolve the worktree's own info/exclude path (worktrees have their own)
    const wtGit = simpleGit(worktreePath)
    const relPath = (await wtGit.raw(['rev-parse', '--git-path', 'info/exclude'])).trim()
    if (!relPath) return
    const excludePath = relPath.startsWith('/') ? relPath : join(worktreePath, relPath)
    await mkdir(dirname(excludePath), { recursive: true })
    let existing = ''
    try { existing = await readFile(excludePath, 'utf-8') } catch { /* new file */ }
    const existingLines = new Set(existing.split('\n').map(l => l.trim()))
    const toAdd = WORKTREE_LOCAL_EXCLUDES.filter(p => !existingLines.has(p))
    if (toAdd.length === 0) return
    const header = '\n# canvaflow: worktree-local excludes (build/cache artifacts)\n'
    const addition = (existing.endsWith('\n') || existing === '' ? '' : '\n') + header + toAdd.join('\n') + '\n'
    await writeFile(excludePath, existing + addition, 'utf-8')
  } catch { /* non-fatal */ }
  void g
}

// ---------------------------------------------------------------------------
// Unified diff parser
// ---------------------------------------------------------------------------

export type DiffLineKind = 'add' | 'del' | 'ctx'

export interface DiffLine {
  kind: DiffLineKind
  /** Line number in the original file (null for added lines) */
  oldLine: number | null
  /** Line number in the modified file (null for deleted lines) */
  newLine: number | null
  /** The line content WITHOUT the leading +/-/space marker */
  content: string
}

export interface DiffHunk {
  /** Header text from the @@ line (e.g. "@@ -10,5 +10,8 @@ function foo()") */
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

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/

/** Parse a unified diff (git diff output) into structured hunks. */
export function parseUnifiedDiff(raw: string): ParsedFileDiff {
  const hunks: DiffHunk[] = []
  if (!raw) return { hunks }

  const lines = raw.split('\n')
  let current: DiffHunk | null = null
  let oldCursor = 0
  let newCursor = 0

  for (const line of lines) {
    // Skip diff headers (--- a/foo, +++ b/foo, diff --git, index ..., etc.)
    if (line.startsWith('diff ') || line.startsWith('index ') ||
        line.startsWith('--- ') || line.startsWith('+++ ') ||
        line.startsWith('new file ') || line.startsWith('deleted file ') ||
        line.startsWith('similarity ') || line.startsWith('rename ')) {
      continue
    }

    const hunkMatch = HUNK_RE.exec(line)
    if (hunkMatch) {
      current = {
        header: hunkMatch[5].trim(),
        oldStart: parseInt(hunkMatch[1], 10),
        oldCount: parseInt(hunkMatch[2] ?? '1', 10),
        newStart: parseInt(hunkMatch[3], 10),
        newCount: parseInt(hunkMatch[4] ?? '1', 10),
        lines: [],
      }
      hunks.push(current)
      oldCursor = current.oldStart
      newCursor = current.newStart
      continue
    }

    if (!current) continue

    // \ No newline at end of file — informational, ignore
    if (line.startsWith('\\')) continue

    if (line.startsWith('+')) {
      current.lines.push({ kind: 'add', oldLine: null, newLine: newCursor, content: line.slice(1) })
      newCursor++
    } else if (line.startsWith('-')) {
      current.lines.push({ kind: 'del', oldLine: oldCursor, newLine: null, content: line.slice(1) })
      oldCursor++
    } else if (line.startsWith(' ') || line === '') {
      current.lines.push({ kind: 'ctx', oldLine: oldCursor, newLine: newCursor, content: line.slice(1) })
      oldCursor++
      newCursor++
    }
  }

  return { hunks }
}

/** Parse merge-tree output to extract conflicting files (exported for testing) */
export function parseMergeTreeConflicts(output: string): string[] {
  const files: string[] = []
  const seen = new Set<string>()
  for (const line of output.split('\n')) {
    const conflictMatch = line.match(/CONFLICT.*?:\s*Merge conflict in (.+)/)
    if (conflictMatch) {
      const f = conflictMatch[1].trim()
      if (!seen.has(f)) { seen.add(f); files.push(f) }
      continue
    }
    const rawMatch = line.match(/^\d{6}\s+[0-9a-f]+\s+[123]\t(.+)/)
    if (rawMatch) {
      const f = rawMatch[1].trim()
      if (!seen.has(f)) { seen.add(f); files.push(f) }
    }
  }
  return files
}

export function registerGitHandlers(ipc: IpcMainLike): void {
  ipc.handle('git:isRepo', async (_e, rootPath: string): Promise<boolean> => {
    try { await git(rootPath).revparse(['--git-dir']); return true } catch { return false }
  })

  ipc.handle('git:status', async (_e, rootPath: string) => {
    try {
      const s = await git(rootPath).status()
      return {
        branch: s.current || 'HEAD',
        ahead: s.ahead,
        behind: s.behind,
        files: s.files.map(f => ({ path: f.path, index: f.index || ' ', working: f.working_dir || ' ' })),
      }
    } catch { return { branch: '', ahead: 0, behind: 0, files: [] } }
  })

  ipc.handle('git:fileAtHead', async (_e, rootPath: string, filePath: string): Promise<string | null> => {
    try {
      const rel = filePath.startsWith(rootPath) ? filePath.slice(rootPath.length).replace(/^\//, '') : filePath
      return await git(rootPath).show([`HEAD:${rel}`])
    } catch { return null }
  })

  ipc.handle('git:fileAtRef', async (_e, rootPath: string, ref: string, filePath: string): Promise<string | null> => {
    try {
      const rel = filePath.startsWith(rootPath) ? filePath.slice(rootPath.length).replace(/^\//, '') : filePath
      return await git(rootPath).show([`${ref}:${rel}`])
    } catch { return null }
  })

  /**
   * Returns parsed unified diff hunks for a single file between two refs.
   * Each hunk is a list of lines tagged as 'add' | 'del' | 'ctx' with their
   * old/new line numbers — ready to render as a row-based diff view.
   */
  ipc.handle('git:fileDiff', async (_e, rootPath: string, baseRef: string, headRef: string, filePath: string) => {
    try {
      const g = git(rootPath)
      const raw = await g.raw(['diff', '--unified=3', baseRef, headRef, '--', filePath])
      return parseUnifiedDiff(raw)
    } catch (e) {
      console.error('[git:fileDiff]', e)
      return { hunks: [] }
    }
  })

  ipc.handle('git:diffBranchFiles', async (_e, rootPath: string, branchName: string, baseBranch: string = 'main') => {
    try {
      const g = git(rootPath)
      const headRef = branchName || 'HEAD'
      // Resolve the base ref — worktrees may not have local main/master,
      // so try multiple candidates in order of likelihood
      const candidates = [
        `origin/${baseBranch}`,
        baseBranch,
        'origin/main',
        'origin/master',
        'main',
        'master',
      ]
      let baseRef = ''
      for (const candidate of candidates) {
        try {
          await g.raw(['rev-parse', '--verify', candidate])
          baseRef = candidate
          break
        } catch { /* try next */ }
      }
      if (!baseRef) throw new Error(`Could not find base branch ref (tried: ${candidates.join(', ')})`)
      // Find the merge base
      const mergeBase = (await g.raw(['merge-base', baseRef, headRef])).trim()
      // Get the list of changed files with status
      const output = await g.raw(['diff', '--name-status', mergeBase, headRef])
      const files: Array<{ path: string; status: string }> = []
      for (const line of output.split('\n')) {
        if (!line.trim()) continue
        const [status, ...pathParts] = line.split('\t')
        const filePath = pathParts.join('\t')
        if (filePath) files.push({ path: filePath, status: status.charAt(0) })
      }
      // Get diff stats (additions/deletions per file)
      const statOutput = await g.raw(['diff', '--numstat', mergeBase, headRef])
      const stats: Record<string, { additions: number; deletions: number }> = {}
      for (const line of statOutput.split('\n')) {
        if (!line.trim()) continue
        const [add, del, ...pathParts] = line.split('\t')
        const fp = pathParts.join('\t')
        if (fp) stats[fp] = { additions: parseInt(add) || 0, deletions: parseInt(del) || 0 }
      }
      return {
        mergeBase,
        branch: headRef,
        files: files.map(f => ({
          ...f,
          additions: stats[f.path]?.additions ?? 0,
          deletions: stats[f.path]?.deletions ?? 0,
        })),
      }
    } catch (e) {
      console.error('[git:diffBranchFiles]', e)
      return { mergeBase: '', branch: '', files: [] }
    }
  })

  ipc.handle('git:diff', async (_e, rootPath: string, filePath: string, staged: boolean): Promise<string> => {
    try {
      return staged
        ? await git(rootPath).diff(['--cached', '--', filePath])
        : await git(rootPath).diff(['--', filePath])
    } catch { return '' }
  })

  ipc.handle('git:stage', async (_e, rootPath: string, filePaths: string[]): Promise<void> => {
    try { await git(rootPath).add(filePaths) } catch (e) { console.error('[git:stage]', e) }
  })

  ipc.handle('git:unstage', async (_e, rootPath: string, filePaths: string[]): Promise<void> => {
    try { await git(rootPath).reset(['HEAD', '--', ...filePaths]) } catch (e) { console.error('[git:unstage]', e) }
  })

  ipc.handle('git:commit', async (_e, rootPath: string, message: string): Promise<void> => {
    await git(rootPath).commit(message)
  })

  ipc.handle('git:push', async (_e, rootPath: string): Promise<{ error?: string }> => {
    try {
      await git(rootPath).push()
      return {}
    } catch (e: any) {
      return { error: e?.message ?? String(e) }
    }
  })

  ipc.handle('git:branches', async (_e, rootPath: string) => {
    try {
      const status = await git(rootPath).status()
      const current = status.current || ''
      const output = await git(rootPath).raw([
        'for-each-ref', '--sort=-committerdate',
        '--format=%(refname:short)\t%(authorname)\t%(subject)\t%(committerdate:relative)',
        'refs/heads',
      ])
      if (!output.trim()) return []
      return output.trim().split('\n').map(line => {
        const parts = line.split('\t')
        const name = parts[0]?.trim() ?? ''
        return {
          name,
          author: parts[1]?.trim() ?? '',
          subject: parts[2]?.trim() ?? '',
          timeAgo: parts[3]?.trim() ?? '',
          isCurrent: name === current,
        }
      }).filter(b => b.name)
    } catch (e) {
      console.error('[git:branches]', e)
      return []
    }
  })

  ipc.handle('git:checkoutBranch', async (_e, rootPath: string, name: string, createNew: boolean) => {
    const g = git(rootPath)
    if (createNew) {
      const branches = await g.branchLocal()
      if (branches.all.includes(name)) {
        await g.checkout(name)
      } else {
        await g.checkoutLocalBranch(name)
      }
    } else {
      await g.checkout(name)
    }
  })

  ipc.handle('git:discard', async (_e, rootPath: string, filePaths: string[]): Promise<void> => {
    const g = git(rootPath)
    const s = await g.status()
    for (const fp of filePaths) {
      const f = s.files.find(sf => sf.path === fp)
      if (!f) continue
      if (f.working_dir === '?' || f.index === '?') {
        // Untracked file — delete it
        try { await unlink(join(rootPath, fp)) } catch { /* already gone */ }
      } else {
        // Tracked — restore working tree
        try { await g.checkout(['--', fp]) } catch (e) { console.error('[git:discard]', e) }
      }
    }
  })

  ipc.handle('git:log', async (_e, rootPath: string, maxCount = 50) => {
    try {
      const r = await git(rootPath).log({ maxCount })
      return r.all.map(e => ({ hash: e.hash.slice(0, 7), date: e.date, message: e.message, author: e.author_name }))
    } catch { return [] }
  })

  ipc.handle('git:remoteUrl', async (_e, rootPath: string): Promise<string | null> => {
    try {
      const remotes = await git(rootPath).getRemotes(true)
      const origin = remotes.find(r => r.name === 'origin')
      if (!origin?.refs?.push) return null
      let url = origin.refs.push
      // Convert SSH to HTTPS
      if (url.startsWith('git@')) {
        url = url.replace(':', '/').replace('git@', 'https://')
      }
      // Strip .git suffix
      url = url.replace(/\.git$/, '')
      return url
    } catch { return null }
  })

  ipc.handle('git:logGraph', async (_e, rootPath: string, maxCount = 150) => {
    try {
      const output = await git(rootPath).raw([
        'log', '--all', `--max-count=${maxCount}`,
        '--pretty=format:%H|%P|%an|%s|%D',
      ])
      if (!output.trim()) return []
      return output.trim().split('\n').map(line => {
        const i1 = line.indexOf('|')
        const i2 = line.indexOf('|', i1 + 1)
        const i3 = line.indexOf('|', i2 + 1)
        const i4 = line.indexOf('|', i3 + 1)
        const fullHash = line.slice(0, i1)
        const parentsStr = line.slice(i1 + 1, i2)
        return {
          hash: fullHash.slice(0, 7),
          fullHash,
          parents: parentsStr ? parentsStr.split(' ').filter(Boolean) : [],
          author: line.slice(i2 + 1, i3),
          subject: line.slice(i3 + 1, i4),
          refs: line.slice(i4 + 1),
        }
      })
    } catch { return [] }
  })

  // ---------------------------------------------------------------------------
  // Git Worktree handlers
  // ---------------------------------------------------------------------------

  ipc.handle('git:wt:add', async (_e, rootPath: string, branchName: string, baseBranch?: string): Promise<string> => {
    const g = git(rootPath)

    // Ensure `.worktrees/` is in the project's committed .gitignore before we
    // create anything inside it — otherwise every worktree directory shows up
    // as untracked in the project's main branch, which is extremely annoying.
    await ensureWorktreesIgnored(rootPath)

    // Find a unique branch name: append -1, -2, etc. if it already exists
    let finalName = branchName
    let suffix = 1
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        await g.raw(['rev-parse', '--verify', `refs/heads/${finalName}`])
        // Branch exists — try next suffix
        finalName = `${branchName}-${suffix++}`
      } catch {
        break // Branch doesn't exist, we can use it
      }
    }

    const worktreePath = join(rootPath, '.worktrees', finalName)
    const args = ['worktree', 'add', '-b', finalName, worktreePath]
    if (baseBranch) args.push(baseBranch)
    await g.raw(args)

    // Symlink gitignored files so the worktree is runnable immediately
    await symlinkGitignoredFiles(rootPath, worktreePath, g)

    // Add common build/cache patterns to this worktree's info/exclude so that
    // things like .turbo or a re-created node_modules never show up as
    // untracked when the user installs packages inside the worktree.
    await writeWorktreeLocalExcludes(worktreePath, g)

    return worktreePath
  })

  ipc.handle('git:wt:remove', async (_e, rootPath: string, worktreePath: string): Promise<void> => {
    await git(rootPath).raw(['worktree', 'remove', worktreePath, '--force'])
  })

  ipc.handle('git:wt:list', async (_e, rootPath: string): Promise<WorktreeEntry[]> => {
    try {
      const result = await git(rootPath).raw(['worktree', 'list', '--porcelain'])
      const worktrees: WorktreeEntry[] = []
      const blocks = result.trim().split('\n\n')
      for (const block of blocks) {
        const lines = block.split('\n')
        const wt: Partial<WorktreeEntry> = {}
        for (const line of lines) {
          if (line.startsWith('worktree ')) wt.path = line.slice(9)
          if (line.startsWith('HEAD ')) wt.head = line.slice(5)
          if (line.startsWith('branch ')) wt.branch = line.slice(7).replace('refs/heads/', '')
        }
        if (wt.path && wt.head && wt.branch) worktrees.push(wt as WorktreeEntry)
      }
      return worktrees
    } catch { return [] }
  })

  // ---------------------------------------------------------------------------
  // Merge conflict detection
  // ---------------------------------------------------------------------------

  /** Run merge-tree and return conflicting files (empty array if clean merge) */
  async function detectConflicts(g: ReturnType<typeof simpleGit>, targetBranch: string, branch: string): Promise<string[]> {
    try {
      // simple-git raw() resolves even on non-zero exit for merge-tree
      const output = await g.raw(['merge-tree', '--write-tree', targetBranch, branch])
      return parseMergeTreeConflicts(output)
    } catch {
      // merge-tree not available — fallback to diff overlap heuristic
      try {
        const mergeBase = await g.raw(['merge-base', targetBranch, branch])
        const base = mergeBase.trim()
        if (!base) return []
        const targetDiff = await g.raw(['diff', '--name-only', base, targetBranch])
        const branchDiff = await g.raw(['diff', '--name-only', base, branch])
        const targetFiles = new Set(targetDiff.trim().split('\n').filter(Boolean))
        return branchDiff.trim().split('\n').filter(Boolean).filter(f => targetFiles.has(f))
      } catch {
        return []
      }
    }
  }

  ipc.handle('git:checkMergeConflicts', async (
    _e,
    rootPath: string,
    branchName: string,
    targetBranch = 'main',
  ): Promise<{ hasConflicts: boolean; conflictingFiles: string[] }> => {
    const files = await detectConflicts(git(rootPath), targetBranch, branchName)
    return { hasConflicts: files.length > 0, conflictingFiles: files }
  })

  ipc.handle('git:checkAllWorktreeConflicts', async (
    _e,
    rootPath: string,
    targetBranch = 'main',
  ): Promise<Record<string, string[]>> => {
    const g = git(rootPath)
    const conflicts: Record<string, string[]> = {}
    try {
      const result = await g.raw(['worktree', 'list', '--porcelain'])
      const blocks = result.trim().split('\n\n')
      for (const block of blocks) {
        const lines = block.split('\n')
        let branch = ''
        for (const line of lines) {
          if (line.startsWith('branch ')) branch = line.slice(7).replace('refs/heads/', '')
        }
        if (!branch || branch === targetBranch) continue
        const files = await detectConflicts(g, targetBranch, branch)
        if (files.length > 0) conflicts[branch] = files
      }
    } catch { /* no worktrees */ }
    return conflicts
  })
}
