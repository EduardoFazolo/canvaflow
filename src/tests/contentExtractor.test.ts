import { describe, expect, it } from 'vitest'
import { extractFromTipTap, buildTaskPrompt } from '../plugins/kanban/contentExtractor'

// ---------------------------------------------------------------------------
// extractFromTipTap
// ---------------------------------------------------------------------------

describe('extractFromTipTap', () => {
  it('returns empty for null/undefined', () => {
    expect(extractFromTipTap(null)).toEqual({ text: '', images: [] })
    expect(extractFromTipTap(undefined)).toEqual({ text: '', images: [] })
  })

  it('extracts plain text from simple paragraph', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Hello world' }],
        },
      ],
    }
    const result = extractFromTipTap(doc)
    expect(result.text).toBe('Hello world')
    expect(result.images).toEqual([])
  })

  it('extracts text from multiple paragraphs', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'First paragraph' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Second paragraph' }] },
      ],
    }
    const result = extractFromTipTap(doc)
    expect(result.text).toBe('First paragraph\nSecond paragraph')
  })

  it('extracts text longer than 200 characters without truncation', () => {
    const longText = 'A'.repeat(500)
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: longText }] },
      ],
    }
    const result = extractFromTipTap(doc)
    expect(result.text).toBe(longText)
    expect(result.text.length).toBe(500)
  })

  it('extracts image sources from content', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Check this:' }] },
        { type: 'image', attrs: { src: 'data:image/png;base64,abc123' } },
        { type: 'paragraph', content: [{ type: 'text', text: 'And this:' }] },
        { type: 'image', attrs: { src: 'data:image/jpeg;base64,xyz789' } },
      ],
    }
    const result = extractFromTipTap(doc)
    expect(result.text).toBe('Check this:\nAnd this:')
    expect(result.images).toEqual([
      'data:image/png;base64,abc123',
      'data:image/jpeg;base64,xyz789',
    ])
  })

  it('handles nested list structures', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item 1' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item 2' }] }] },
          ],
        },
      ],
    }
    const result = extractFromTipTap(doc)
    expect(result.text).toContain('Item 1')
    expect(result.text).toContain('Item 2')
  })

  it('handles headings', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', content: [{ type: 'text', text: 'My Heading' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Body text' }] },
      ],
    }
    const result = extractFromTipTap(doc)
    expect(result.text).toBe('My Heading\nBody text')
  })

  it('skips images without src', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'image', attrs: {} },
        { type: 'image' },
      ],
    }
    const result = extractFromTipTap(doc)
    expect(result.images).toEqual([])
  })

  it('collapses excessive newlines', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
        { type: 'paragraph', content: [] },
        { type: 'paragraph', content: [] },
        { type: 'paragraph', content: [] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Last' }] },
      ],
    }
    const result = extractFromTipTap(doc)
    // Should not have more than 2 consecutive newlines
    expect(result.text).not.toMatch(/\n{3,}/)
    expect(result.text).toContain('First')
    expect(result.text).toContain('Last')
  })
})

// ---------------------------------------------------------------------------
// buildTaskPrompt
// ---------------------------------------------------------------------------

describe('buildTaskPrompt', () => {
  it('uses title only when no content or description', () => {
    const result = buildTaskPrompt({ title: 'Fix the bug' })
    expect(result.text).toBe('Fix the bug')
    expect(result.images).toEqual([])
  })

  it('falls back to description when no content', () => {
    const result = buildTaskPrompt({
      title: 'Fix the bug',
      description: 'The login page is broken',
    })
    expect(result.text).toBe('Fix the bug\n\nThe login page is broken')
  })

  it('prefers full content over truncated description', () => {
    const fullText = 'When we click into a guest profile to review key details, especially when we need to move someone to a different table or check dietary restrictions, the critical information is not visible without scrolling.'
    const truncatedDesc = fullText.slice(0, 200)

    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: fullText }] },
      ],
    }

    const result = buildTaskPrompt({
      title: 'Critical Attendee info should always show up',
      description: truncatedDesc,
      content: doc,
    })

    // Must contain the FULL text, not the truncated version
    expect(result.text).toContain(fullText)
    expect(result.text.length).toBeGreaterThan(truncatedDesc.length + 50)
  })

  it('includes images from content', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'See attached screenshot' }] },
        { type: 'image', attrs: { src: 'data:image/png;base64,screenshot123' } },
      ],
    }

    const result = buildTaskPrompt({
      title: 'UI Bug',
      description: 'See attached screenshot',
      content: doc,
    })

    expect(result.images).toEqual(['data:image/png;base64,screenshot123'])
    expect(result.text).toContain('See attached screenshot')
  })

  it('handles content with multiple images', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Before:' }] },
        { type: 'image', attrs: { src: 'data:image/png;base64,before' } },
        { type: 'paragraph', content: [{ type: 'text', text: 'After:' }] },
        { type: 'image', attrs: { src: 'data:image/png;base64,after' } },
      ],
    }

    const result = buildTaskPrompt({
      title: 'Compare designs',
      content: doc,
    })

    expect(result.images).toHaveLength(2)
    expect(result.images[0]).toBe('data:image/png;base64,before')
    expect(result.images[1]).toBe('data:image/png;base64,after')
  })

  it('preserves very long task descriptions without truncation', () => {
    const longBody = Array.from({ length: 20 }, (_, i) => `Step ${i + 1}: Do something important that requires detailed instructions.`).join(' ')
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: longBody }] },
      ],
    }

    const result = buildTaskPrompt({
      title: 'Complex multi-step task',
      description: longBody.slice(0, 200), // Simulates the 200-char truncation
      content: doc,
    })

    // Full text must be preserved
    expect(result.text).toContain(longBody)
    expect(result.text.length).toBeGreaterThan(200)
  })
})
