import { getIndentation, indentUnit } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { caddyfileLanguage, collectCaddyfileTokens } from '../app/utils/caddyfile-language'

describe('Caddyfile highlighting', () => {
  it('highlights site addresses, directives, placeholders and comments', () => {
    const tokens = collectCaddyfileTokens(`# gateway
example.com {
	reverse_proxy localhost:8080
	header X-Real-IP {http.request.remote.host}
}
`)
    const byText = Object.fromEntries(tokens.map(token => [token.text, token.name]))
    expect(byText['# gateway']).toBe('comment')
    expect(byText['example.com']).toBe('string')
    expect(byText.reverse_proxy).toBe('keyword')
    expect(byText['localhost:8080']).toBe('string')
    expect(byText['{http.request.remote.host}']).toBe('variableName')
  })

  it('highlights named matchers and snippet labels', () => {
    const tokens = collectCaddyfileTokens(`(static) {
	@assets path /assets/*
	handle @assets {
		file_server
	}
}
`)
    const names = tokens.map(token => `${token.name}:${token.text}`)
    expect(names).toContain('labelName:(static)')
    expect(names).toContain('atom:@assets')
    expect(names).toContain('keyword:handle')
    expect(names).toContain('keyword:file_server')
  })

  it('indents one tab per open block', () => {
    const state = EditorState.create({
      doc: 'example.com {\n',
      extensions: [caddyfileLanguage, indentUnit.of('\t'), EditorState.tabSize.of(4)],
    })
    expect(getIndentation(state, state.doc.length)).toBe(4)
  })

  it('loads as a CodeMirror language extension', () => {
    const state = EditorState.create({
      doc: 'localhost {\n\trespond "ok"\n}\n',
      extensions: [caddyfileLanguage],
    })
    expect(state.doc.toString()).toContain('respond')
  })
})
