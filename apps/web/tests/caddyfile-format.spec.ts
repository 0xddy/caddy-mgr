import { describe, expect, it } from 'vitest'
import { formatCaddyfile } from '../app/utils/caddyfile-format'

describe('formatCaddyfile', () => {
  it('normalizes spacing without changing tokens', () => {
    expect(formatCaddyfile('abc def\n g hi jkl\nmn')).toBe('abc def\ng hi jkl\nmn\n')
  })

  it('indents blocks with tabs and puts braces on their own lines', () => {
    expect(formatCaddyfile('e { f\n}')).toBe('e {\n\tf\n}\n')
    expect(formatCaddyfile('g {\nh {\ni\n}\n}')).toBe('g {\n\th {\n\t\ti\n\t}\n}\n')
    expect(formatCaddyfile('a{\n b\n}')).toBe('a {\n\tb\n}\n')
  })

  it('inserts a blank line between adjacent top-level blocks', () => {
    expect(formatCaddyfile('abc {\n def\n}ghi{\n jkl mno\npqr}')).toBe(
      'abc {\n\tdef\n}\n\nghi {\n\tjkl mno\n\tpqr\n}\n',
    )
  })

  it('keeps placeholders glued to surrounding tokens', () => {
    expect(formatCaddyfile('foo {bar}')).toBe('foo {bar}\n')
    expect(formatCaddyfile('foo{bar} foo{bar}baz')).toBe('foo{bar} foo{bar}baz\n')
    expect(formatCaddyfile(':{$PORT}')).toBe(':{$PORT}\n')
  })

  it('treats a spaced brace as a real block', () => {
    expect(formatCaddyfile('foo{bar} foo{ bar}baz')).toBe('foo{bar} foo {\n\tbar\n}\n\nbaz\n')
  })

  it('does not treat # inside a token as a comment', () => {
    expect(formatCaddyfile('redir / /some/#/path')).toBe('redir / /some/#/path\n')
  })

  it('does not fold a following brace into a comment', () => {
    expect(formatCaddyfile('# comment\n{\n foo\n}')).toBe('# comment\n{\n\tfoo\n}\n')
  })

  it('preserves quoted strings and escaped quotes', () => {
    expect(formatCaddyfile('bar "{\\"key\\":34}"')).toBe('bar "{\\"key\\":34}"\n')
    expect(formatCaddyfile('foo \\"literal\\"')).toBe('foo \\"literal\\"\n')
  })

  it('keeps heredoc bodies untouched', () => {
    const input = `example.com {
respond <<HTML
<html>
	<body>Hi</body>
</html>
HTML 200
}
`
    expect(formatCaddyfile(input)).toBe(`example.com {
	respond <<HTML
<html>
	<body>Hi</body>
</html>
HTML 200
}
`)
  })

  it('normalizes CRLF to LF and always ends with a newline', () => {
    expect(formatCaddyfile('a {\r\n  b\r\n}')).toBe('a {\n\tb\n}\n')
    expect(formatCaddyfile('')).toBe('\n')
  })

  it('is idempotent on already-formatted Caddyfile', () => {
    const formatted = formatCaddyfile(`example.com {
    reverse_proxy localhost:8080
    header X-Real-IP {http.request.remote.host}
}
`)
    expect(formatCaddyfile(formatted)).toBe(formatted)
  })
})
