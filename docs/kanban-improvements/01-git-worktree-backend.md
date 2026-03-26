# 01 — Git Worktree Backend

**Status:** TODO
**Depends on:** nothing

## Goal

Add IPC handlers so the renderer can create, list, and remove git worktrees. The existing git handler file already uses `simple-git` which supports worktree commands. We just need to add three new channels and expose them in the preload bridge.

## Architecture

```
Renderer                     Preload                          Main (simple-git)
window.git.worktreeAdd() --> ipcRenderer.invoke('git:wt:add') --> git.raw(['worktree','add',...])
window.git.worktreeRemove()--> ipcRenderer.invoke('git:wt:rm') --> git.raw(['worktree','remove',...])
window.git.worktreeList() --> ipcRenderer.invoke('git:wt:list')--> git.raw(['worktree','list',...])
```

Worktrees live at `.worktrees/<branch-name>/` relative to the workspace root. This directory already exists in the repo.

## Tasks

### 1. Add worktree IPC handlers

**File:** `src/plugins/monaco/main/gitHandlers.ts`
**Where:** Inside `registerGitHandlers(ipc)`, after the existing `git:remoteUrl` handler (bottom of the function).

Add three new `ipc.handle()` calls:

#### `git:wt:add`

```ts
ipc.handle('git:wt:add', async (_e, rootPath: string, branchName: string, baseBranch?: string) => {
  const worktreePath = path.join(rootPath, '.worktrees', branchName)
  const git = getGit(rootPath) // use the existing gitCache helper

  // If baseBranch provided (e.g. 'main'), create branch from that base
  // Otherwise branch from current HEAD
  const args = ['worktree', 'add', '-b', branchName, worktreePath]
  if (baseBranch) args.push(baseBranch)

  await git.raw(args)
  return worktreePath
})
```

- `getGit()` is the existing helper that caches `simpleGit` instances per path.
- Returns the absolute worktree path so the renderer can use it immediately.
- The `-b` flag creates a new branch. If the branch already exists, this will error — handle that in the renderer.

#### `git:wt:remove`

```ts
ipc.handle('git:wt:remove', async (_e, rootPath: string, worktreePath: string) => {
  const git = getGit(rootPath)
  await git.raw(['worktree', 'remove', worktreePath, '--force'])
})
```

- `--force` removes even if the worktree has changes. We want cleanup to always succeed.

#### `git:wt:list`

```ts
ipc.handle('git:wt:list', async (_e, rootPath: string) => {
  const git = getGit(rootPath)
  const result = await git.raw(['worktree', 'list', '--porcelain'])
  // Parse porcelain output into structured data
  // Format: blocks separated by empty lines, each block has:
  //   worktree <path>
  //   HEAD <sha>
  //   branch refs/heads/<name>
  const worktrees: Array<{ path: string; head: string; branch: string }> = []
  const blocks = result.trim().split('\n\n')
  for (const block of blocks) {
    const lines = block.split('\n')
    const wt: any = {}
    for (const line of lines) {
      if (line.startsWith('worktree ')) wt.path = line.slice(9)
      if (line.startsWith('HEAD ')) wt.head = line.slice(5)
      if (line.startsWith('branch ')) wt.branch = line.slice(7).replace('refs/heads/', '')
    }
    if (wt.path) worktrees.push(wt)
  }
  return worktrees
})
```

### 2. Expose in preload bridge

**File:** `src/preload/index.ts`
**Where:** Inside the `contextBridge.exposeInMainWorld('git', { ... })` block, add after `remoteUrl`:

```ts
worktreeAdd: (rootPath: string, branchName: string, baseBranch?: string): Promise<string> =>
  ipcRenderer.invoke('git:wt:add', rootPath, branchName, baseBranch),
worktreeRemove: (rootPath: string, worktreePath: string): Promise<void> =>
  ipcRenderer.invoke('git:wt:remove', rootPath, worktreePath),
worktreeList: (rootPath: string): Promise<Array<{ path: string; head: string; branch: string }>> =>
  ipcRenderer.invoke('git:wt:list', rootPath),
```

### 3. Add TypeScript types for the window API

**File:** `src/preload/index.d.ts` (or wherever the `Window` interface augmentation lives)

Add to the git interface:

```ts
worktreeAdd(rootPath: string, branchName: string, baseBranch?: string): Promise<string>
worktreeRemove(rootPath: string, worktreePath: string): Promise<void>
worktreeList(rootPath: string): Promise<Array<{ path: string; head: string; branch: string }>>
```

### 4. Ensure `.worktrees/` is in `.gitignore`

Check that `.worktrees/` is already in the project's `.gitignore`. If not, add it. We don't want worktree directories committed.

## Acceptance Criteria

- `window.git.worktreeAdd('/path/to/repo', 'my-branch')` creates `.worktrees/my-branch/` and returns its path
- `window.git.worktreeAdd('/path/to/repo', 'my-branch', 'main')` branches from main instead of HEAD
- `window.git.worktreeList('/path/to/repo')` returns all worktrees with path, head sha, and branch name
- `window.git.worktreeRemove('/path/to/repo', '/path/to/repo/.worktrees/my-branch')` cleans up the worktree
- Errors (branch already exists, path conflicts) propagate as rejected promises
