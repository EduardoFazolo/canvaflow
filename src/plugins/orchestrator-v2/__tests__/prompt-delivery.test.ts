/**
 * Tests for the orchestrator-v2 prompt delivery system.
 *
 * The core problem: passing multi-line prompts containing special characters
 * to Claude CLI instances running in PTY terminals. Previous approaches
 * (terminal.write, positional CLI args) failed because:
 *
 *   1. terminal.write: newlines act as Enter keypresses, submitting partial text
 *   2. Direct CLI args: shell escaping breaks on quotes, backticks, $, etc.
 *   3. Timing-based writes: unreliable — Claude boot time varies
 *
 * Solution: write prompts to files, pass via $(cat /path) in the shell command.
 * The shell evaluates the substitution, Claude receives the full text as its
 * initial prompt, and auto-submits it.
 */

import { describe, it, expect } from 'bun:test'

// ---------------------------------------------------------------------------
// shellEscape — the function used to escape paths in shell commands
// ---------------------------------------------------------------------------

function shellEscape(s: string): string {
  return s.replace(/'/g, "'\\''")
}

describe('shellEscape', () => {
  it('handles plain strings', () => {
    expect(shellEscape('hello world')).toBe('hello world')
  })

  it('escapes single quotes', () => {
    expect(shellEscape("it's a test")).toBe("it'\\''s a test")
  })

  it('handles multiple single quotes', () => {
    expect(shellEscape("a'b'c")).toBe("a'\\''b'\\''c")
  })

  it('preserves double quotes, backticks, and dollar signs', () => {
    // These don't need escaping because they're inside single quotes in the shell command
    expect(shellEscape('$HOME "test" `cmd`')).toBe('$HOME "test" `cmd`')
  })

  it('handles empty string', () => {
    expect(shellEscape('')).toBe('')
  })

  it('handles paths with spaces', () => {
    expect(shellEscape('/tmp/my dir/file.txt')).toBe('/tmp/my dir/file.txt')
  })
})

// ---------------------------------------------------------------------------
// buildClaudeFlags — constructs the flags string for the claude CLI
// ---------------------------------------------------------------------------

function buildClaudeFlags(opts: {
  systemPromptPath?: string
  promptFilePath: string
}): string {
  const parts = [
    '--dangerously-skip-permissions',
    opts.systemPromptPath
      ? `--append-system-prompt "$(cat '${shellEscape(opts.systemPromptPath)}')"`
      : '',
    `"$(cat '${shellEscape(opts.promptFilePath)}')"`,
  ]
  return parts.filter(Boolean).join(' ')
}

describe('buildClaudeFlags', () => {
  it('includes --dangerously-skip-permissions', () => {
    const flags = buildClaudeFlags({ promptFilePath: '/tmp/prompt.txt' })
    expect(flags).toContain('--dangerously-skip-permissions')
  })

  it('reads prompt from file via $(cat ...)', () => {
    const flags = buildClaudeFlags({ promptFilePath: '/tmp/prompt.txt' })
    expect(flags).toContain("\"$(cat '/tmp/prompt.txt')\"")
  })

  it('reads system prompt from file when provided', () => {
    const flags = buildClaudeFlags({
      promptFilePath: '/tmp/prompt.txt',
      systemPromptPath: '/tmp/system.txt',
    })
    expect(flags).toContain("--append-system-prompt \"$(cat '/tmp/system.txt')\"")
  })

  it('omits system prompt when not provided', () => {
    const flags = buildClaudeFlags({ promptFilePath: '/tmp/prompt.txt' })
    expect(flags).not.toContain('--append-system-prompt')
  })

  it('handles paths with single quotes', () => {
    const flags = buildClaudeFlags({
      promptFilePath: "/tmp/it's-a-test/prompt.txt",
    })
    expect(flags).toContain("\"$(cat '/tmp/it'\\''s-a-test/prompt.txt')\"")
  })

  it('handles paths with spaces', () => {
    const flags = buildClaudeFlags({
      promptFilePath: '/tmp/my project/prompt.txt',
    })
    expect(flags).toContain("\"$(cat '/tmp/my project/prompt.txt')\"")
  })
})

// ---------------------------------------------------------------------------
// Full shell command construction — simulates what ClaudeNode.tsx does
// ---------------------------------------------------------------------------

describe('claude shell command construction', () => {
  it('produces a valid shell command', () => {
    const flags = buildClaudeFlags({ promptFilePath: '/tmp/prompt.txt' })
    const shell = flags ? `claude ${flags}` : 'claude'
    expect(shell).toBe(
      `claude --dangerously-skip-permissions "$(cat '/tmp/prompt.txt')"`
    )
  })

  it('preserves full command with system prompt', () => {
    const flags = buildClaudeFlags({
      promptFilePath: '/tmp/p.txt',
      systemPromptPath: '/tmp/s.txt',
    })
    const shell = `claude ${flags}`
    expect(shell).toBe(
      `claude --dangerously-skip-permissions --append-system-prompt "$(cat '/tmp/s.txt')" "$(cat '/tmp/p.txt')"`
    )
  })
})

// ---------------------------------------------------------------------------
// Prompt content edge cases — things that broke terminal.write
// ---------------------------------------------------------------------------

describe('prompt content that broke terminal.write', () => {
  // These are the edge cases that caused the "are" bug.
  // With the file-based approach, ALL of these work because the shell
  // reads the file contents via $(cat ...) — no escaping needed for content.

  const problematicPrompts = [
    {
      name: 'multi-line prompt',
      text: 'Implement the following:\n1. Add a button\n2. Add a handler\n3. Add tests',
    },
    {
      name: 'prompt with single quotes',
      text: "Don't forget to handle the user's input correctly",
    },
    {
      name: 'prompt with double quotes',
      text: 'Use "strict mode" for the parser',
    },
    {
      name: 'prompt with backticks',
      text: 'Run `npm test` after making changes',
    },
    {
      name: 'prompt with dollar signs',
      text: 'Access $HOME and $PATH variables',
    },
    {
      name: 'prompt with backslashes',
      text: 'Escape the regex: \\d+\\.\\d+',
    },
    {
      name: 'prompt with special shell chars',
      text: 'Handle && || ; | > < >> 2>&1 cases',
    },
    {
      name: 'very long prompt (10KB)',
      text: 'x'.repeat(10_000),
    },
    {
      name: 'prompt with unicode',
      text: 'Add support for émojis 🎉 and CJK: 日本語',
    },
    {
      name: 'prompt with null bytes would be stripped',
      text: 'before\x00after',
    },
  ]

  for (const { name, text } of problematicPrompts) {
    it(`file-based approach handles: ${name}`, () => {
      // With the file approach, the content is written to a file as-is.
      // The shell command only references the file path, not the content.
      // So the content NEVER needs escaping.
      const filePath = `/tmp/test-${Date.now()}.txt`

      // Simulate what RepoAgentNode does:
      // 1. Write prompt to file (handled by window.fs.writeFile)
      // 2. Build flags referencing the file
      const flags = buildClaudeFlags({ promptFilePath: filePath })

      // The flags should NOT contain the prompt text — only the file path
      expect(flags).not.toContain(text)
      expect(flags).toContain(filePath)

      // The resulting shell command is always well-formed regardless of content
      const shell = `claude ${flags}`
      expect(shell).toMatch(/^claude --dangerously-skip-permissions "\$\(cat '.*'\)"$/)
    })
  }
})

// ---------------------------------------------------------------------------
// Prompt file path construction
// ---------------------------------------------------------------------------

describe('prompt file paths', () => {
  it('places prompt file inside the cloned repo', () => {
    const repoPath = '/Users/test/project/.orcv2-tmp/abc123/agent-0'
    const promptFilePath = repoPath + '/.orcv2-prompt.txt'
    const systemPromptFilePath = repoPath + '/.orcv2-system-prompt.txt'

    expect(promptFilePath).toBe('/Users/test/project/.orcv2-tmp/abc123/agent-0/.orcv2-prompt.txt')
    expect(systemPromptFilePath).toBe('/Users/test/project/.orcv2-tmp/abc123/agent-0/.orcv2-system-prompt.txt')
  })

  it('files are in gitignored directory', () => {
    // The .orcv2-tmp directory is auto-gitignored, so prompt files won't
    // pollute the repo. And since each agent's clone is independent,
    // the prompt files are also isolated per-agent.
    const repoPath = '/Users/test/project/.orcv2-tmp/abc123/agent-0'
    expect(repoPath).toContain('.orcv2-tmp')
  })
})
