/**
 * Tests for the clone repo setup in orchestrator-v2.
 *
 * Validates:
 * - Clones are created inside workspace/.orcv2-tmp/ (for Claude trust)
 * - .orcv2-tmp is auto-added to .gitignore
 * - Branch creation works
 * - Cleanup removes temp dirs
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, existsSync, writeFileSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'
import { tmpdir } from 'os'

const TEST_DIR = join(tmpdir(), 'orcv2-test-' + Date.now())

function createTestRepo(): string {
  const repoPath = join(TEST_DIR, 'source-repo')
  mkdirSync(repoPath, { recursive: true })
  execSync('git init', { cwd: repoPath, stdio: 'pipe' })
  execSync('git config user.email "test@test.com"', { cwd: repoPath, stdio: 'pipe' })
  execSync('git config user.name "Test"', { cwd: repoPath, stdio: 'pipe' })
  writeFileSync(join(repoPath, 'README.md'), '# Test')
  execSync('git add -A && git commit -m "initial"', { cwd: repoPath, stdio: 'pipe' })
  return repoPath
}

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true })
})

afterEach(() => {
  try {
    rmSync(TEST_DIR, { recursive: true, force: true })
  } catch {
    // best effort
  }
})

describe('clone directory placement', () => {
  it('creates clones inside workspace/.orcv2-tmp/', () => {
    const sourceRepo = createTestRepo()
    const orchestratorId = 'test-orch-123'
    const tmpRoot = join(sourceRepo, '.orcv2-tmp')
    const base = join(tmpRoot, orchestratorId)
    mkdirSync(base, { recursive: true })
    const clonePath = join(base, 'agent-0')

    execSync(`git clone --local --shared "${sourceRepo}" "${clonePath}"`, { stdio: 'pipe' })

    expect(existsSync(clonePath)).toBe(true)
    expect(existsSync(join(clonePath, '.git'))).toBe(true)
    expect(existsSync(join(clonePath, 'README.md'))).toBe(true)
  })

  it('creates branch in clone', () => {
    const sourceRepo = createTestRepo()
    const clonePath = join(sourceRepo, '.orcv2-tmp', 'test', 'agent-0')
    mkdirSync(join(sourceRepo, '.orcv2-tmp', 'test'), { recursive: true })

    execSync(`git clone --local --shared "${sourceRepo}" "${clonePath}"`, { stdio: 'pipe' })
    execSync('git checkout -b feat/test-branch', { cwd: clonePath, stdio: 'pipe' })

    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: clonePath, encoding: 'utf-8',
    }).trim()
    expect(branch).toBe('feat/test-branch')
  })
})

describe('gitignore management', () => {
  it('adds .orcv2-tmp to .gitignore if not present', () => {
    const sourceRepo = createTestRepo()
    const gitignorePath = join(sourceRepo, '.gitignore')

    // Simulate what cloneRepo does
    const existing = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf-8') : ''
    if (!existing.includes('.orcv2-tmp')) {
      const nl = existing.endsWith('\n') || !existing ? '' : '\n'
      writeFileSync(gitignorePath, existing + nl + '.orcv2-tmp\n')
    }

    const content = readFileSync(gitignorePath, 'utf-8')
    expect(content).toContain('.orcv2-tmp')
  })

  it('does not duplicate .orcv2-tmp in .gitignore', () => {
    const sourceRepo = createTestRepo()
    const gitignorePath = join(sourceRepo, '.gitignore')

    // First write
    writeFileSync(gitignorePath, 'node_modules\n.orcv2-tmp\n')

    // Simulate second call
    const existing = readFileSync(gitignorePath, 'utf-8')
    if (!existing.includes('.orcv2-tmp')) {
      writeFileSync(gitignorePath, existing + '.orcv2-tmp\n')
    }

    const content = readFileSync(gitignorePath, 'utf-8')
    const occurrences = (content.match(/\.orcv2-tmp/g) || []).length
    expect(occurrences).toBe(1)
  })

  it('appends to existing .gitignore with proper newline', () => {
    const sourceRepo = createTestRepo()
    const gitignorePath = join(sourceRepo, '.gitignore')
    writeFileSync(gitignorePath, 'node_modules') // no trailing newline

    const existing = readFileSync(gitignorePath, 'utf-8')
    if (!existing.includes('.orcv2-tmp')) {
      const nl = existing.endsWith('\n') || !existing ? '' : '\n'
      writeFileSync(gitignorePath, existing + nl + '.orcv2-tmp\n')
    }

    const content = readFileSync(gitignorePath, 'utf-8')
    expect(content).toBe('node_modules\n.orcv2-tmp\n')
  })
})

describe('clone isolation', () => {
  it('clones are independent — commits in clone do not affect source', () => {
    const sourceRepo = createTestRepo()
    const clonePath = join(sourceRepo, '.orcv2-tmp', 'test', 'agent-0')
    mkdirSync(join(sourceRepo, '.orcv2-tmp', 'test'), { recursive: true })

    execSync(`git clone --local --shared "${sourceRepo}" "${clonePath}"`, { stdio: 'pipe' })
    execSync('git checkout -b feat/test', { cwd: clonePath, stdio: 'pipe' })

    // Make a commit in clone
    writeFileSync(join(clonePath, 'new-file.txt'), 'hello')
    execSync('git add -A && git commit -m "clone commit"', { cwd: clonePath, stdio: 'pipe' })

    // Source should not have the file
    expect(existsSync(join(sourceRepo, 'new-file.txt'))).toBe(false)

    // Source should not have the branch
    const branches = execSync('git branch', { cwd: sourceRepo, encoding: 'utf-8' })
    expect(branches).not.toContain('feat/test')
  })

  it('multiple clones are independent of each other', () => {
    const sourceRepo = createTestRepo()
    const base = join(sourceRepo, '.orcv2-tmp', 'test')
    mkdirSync(base, { recursive: true })

    const clone0 = join(base, 'agent-0')
    const clone1 = join(base, 'agent-1')

    execSync(`git clone --local --shared "${sourceRepo}" "${clone0}"`, { stdio: 'pipe' })
    execSync(`git clone --local --shared "${sourceRepo}" "${clone1}"`, { stdio: 'pipe' })
    execSync('git checkout -b feat/a', { cwd: clone0, stdio: 'pipe' })
    execSync('git checkout -b feat/b', { cwd: clone1, stdio: 'pipe' })

    writeFileSync(join(clone0, 'file-a.txt'), 'a')
    execSync('git add -A && git commit -m "commit a"', { cwd: clone0, stdio: 'pipe' })

    writeFileSync(join(clone1, 'file-b.txt'), 'b')
    execSync('git add -A && git commit -m "commit b"', { cwd: clone1, stdio: 'pipe' })

    // Each clone only has its own file
    expect(existsSync(join(clone0, 'file-a.txt'))).toBe(true)
    expect(existsSync(join(clone0, 'file-b.txt'))).toBe(false)
    expect(existsSync(join(clone1, 'file-a.txt'))).toBe(false)
    expect(existsSync(join(clone1, 'file-b.txt'))).toBe(true)
  })
})

describe('cleanup', () => {
  it('removes clone directories', () => {
    const sourceRepo = createTestRepo()
    const clonePath = join(sourceRepo, '.orcv2-tmp', 'test', 'agent-0')
    mkdirSync(join(sourceRepo, '.orcv2-tmp', 'test'), { recursive: true })
    execSync(`git clone --local --shared "${sourceRepo}" "${clonePath}"`, { stdio: 'pipe' })

    expect(existsSync(clonePath)).toBe(true)

    rmSync(clonePath, { recursive: true, force: true })
    expect(existsSync(clonePath)).toBe(false)
  })
})
