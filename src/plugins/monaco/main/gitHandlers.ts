import { unlink } from 'fs/promises'
import { join } from 'path'
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
    const worktreePath = join(rootPath, '.worktrees', branchName)
    const g = git(rootPath)
    const args = ['worktree', 'add', '-b', branchName, worktreePath]
    if (baseBranch) args.push(baseBranch)
    await g.raw(args)
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
}
