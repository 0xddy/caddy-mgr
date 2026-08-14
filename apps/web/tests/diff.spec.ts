import { describe, expect, it } from 'vitest'
import { createLineDiff } from '../app/utils/diff'

describe('createLineDiff', () => {
  it('keeps line numbers for unchanged content', () => {
    expect(createLineDiff('a\nb', 'a\nb')).toEqual([
      { kind: 'equal', text: 'a', oldNumber: 1, newNumber: 1 },
      { kind: 'equal', text: 'b', oldNumber: 2, newNumber: 2 },
    ])
  })

  it('marks removed and inserted Caddyfile directives', () => {
    const result = createLineDiff('example.com {\n\trespond "old"\n}', 'example.com {\n\trespond "new"\n}')
    expect(result.map(line => line.kind)).toEqual(['equal', 'remove', 'add', 'equal'])
    expect(result[1]?.oldNumber).toBe(2)
    expect(result[2]?.newNumber).toBe(2)
  })

  it('uses a bounded diff for very large files', () => {
    const before = Array.from({ length: 1001 }, (_, index) => `old-${index}`).join('\n')
    const after = Array.from({ length: 1001 }, (_, index) => `new-${index}`).join('\n')
    const result = createLineDiff(before, after)
    expect(result).toHaveLength(2002)
    expect(result[0]?.kind).toBe('remove')
    expect(result.at(-1)?.kind).toBe('add')
  })
})
