import type { ReviewThread, ReviewMessage } from '../../../../modules/servers/canvaflow_mcp/shared/types'

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function formatMessage(msg: ReviewMessage): string {
  const tag = msg.severity ? ` [${msg.severity.toUpperCase()}]` : ''
  return `**${msg.authorName}**${tag}\n${msg.body}`
}

function formatThread(thread: ReviewThread): string {
  const header = `### ${thread.file}:${thread.line}  (thread \`${thread.id}\`)`
  const body = thread.messages.map(formatMessage).join('\n\n---\n\n')
  return `${header}\n\n${body}`
}

/**
 * Build the prompt for routing a SINGLE thread to an agent. The agent should
 * read the thread context, then call the `reply_to_review_thread` MCP tool
 * with the same `thread_id` to post its response back into the conversation.
 */
export function buildSingleThreadPrompt(opts: {
  branchName: string
  thread: ReviewThread
}): string {
  const { branchName, thread } = opts
  return [
    `You are being asked to respond to a code review comment thread on branch \`${branchName}\`.`,
    '',
    'CONTEXT — full thread history (most recent message last):',
    '',
    formatThread(thread),
    '',
    'INSTRUCTIONS:',
    `1. Read the thread above. The anchor is \`${thread.file}\` line ${thread.line}.`,
    '2. If you need to look at the actual code, open the file and read the relevant lines.',
    '3. Decide what to say or do. You can:',
    '   - Just respond with an analysis or answer.',
    '   - Make code changes to address the issue, then describe what you did.',
    '4. When done, call the `reply_to_review_thread` MCP tool with:',
    `   - \`thread_id\`: "${thread.id}"`,
    '   - `body`: your reply (markdown supported)',
    '   - `author_name`: a short label like "Claude (main)" so the user knows who replied',
    '',
    'Your reply will appear in the same thread alongside the original review comment.',
  ].join('\n')
}

/**
 * Build the prompt for routing the ENTIRE review (all threads) to an agent.
 * The agent gets the full picture and can reply to multiple threads in turn.
 */
export function buildFullReviewPrompt(opts: {
  branchName: string
  threads: ReviewThread[]
}): string {
  const { branchName, threads } = opts
  if (threads.length === 0) {
    return `The code review on branch \`${branchName}\` has no comments yet.`
  }
  return [
    `You are being asked to address a full code review for branch \`${branchName}\`.`,
    `There are ${threads.length} comment thread${threads.length === 1 ? '' : 's'}.`,
    '',
    'CONTEXT — all threads in this review:',
    '',
    threads.map(formatThread).join('\n\n========\n\n'),
    '',
    'INSTRUCTIONS:',
    '1. Read every thread carefully.',
    '2. For each thread you want to respond to, call the `reply_to_review_thread` MCP tool with:',
    '   - `thread_id`: the exact ID shown in the thread header above',
    '   - `body`: your reply (markdown supported)',
    '   - `author_name`: a short label like "Claude (main)" so the user knows who replied',
    '3. You may also make code changes to address the findings. Describe what you did in the replies.',
    '4. You do NOT need to reply to every thread — only the ones where you have something useful to add.',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

const BRACKETED_PASTE_OPEN = '\x1b[200~'
const BRACKETED_PASTE_CLOSE = '\x1b[201~'

/**
 * Send a built prompt to an already-running agent. We write directly to the
 * PTY using bracketed paste mode (so multi-line content is treated as one
 * input chunk) and follow with a carriage return to submit it.
 *
 * Why not the coordinator? The coordinator's task injection only fires during
 * the agent's initial boot sequence — once the READY prompt has been seen
 * once and the task is dispatched, it transitions to `working` and won't
 * re-inject. For routing a message to a running agent we don't need the
 * boot-time orchestration; we just need to type the message into its prompt.
 *
 * If the agent is idle at its prompt, the input gets typed and submitted.
 * If the agent is busy, claude queues the input — same behavior as if the
 * user typed while it was working.
 */
export function dispatchToAgent(nodeId: string, prompt: string): void {
  window.terminal.write(nodeId, BRACKETED_PASTE_OPEN + prompt + BRACKETED_PASTE_CLOSE)
  // Small delay before the Enter so claude finishes processing the paste
  // before receiving the submit signal.
  setTimeout(() => {
    window.terminal.write(nodeId, '\r')
  }, 150)
}
