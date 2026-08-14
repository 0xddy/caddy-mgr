import type { CompletionContext } from '@codemirror/autocomplete'
import { HighlightStyle, StreamLanguage, indentUnit, syntaxHighlighting, type StreamParser, type StringStream } from '@codemirror/language'
import { tags } from '@lezer/highlight'

const DIRECTIVES = new Set([
  'abort', 'acme_server', 'admin', 'auto_https', 'basic_auth', 'basicauth', 'bind',
  'default_bind', 'default_sni', 'email', 'encode', 'error', 'file_server',
  'forward_auth', 'fs', 'grace_period', 'handle', 'handle_errors', 'handle_path',
  'header', 'import', 'intercept', 'invoke', 'local_certs', 'log', 'log_append',
  'log_credentials', 'map', 'method', 'metrics', 'ocsp', 'on_demand_tls', 'order',
  'php_fastcgi', 'pki', 'push', 'redir', 'request_body', 'request_header', 'respond',
  'reverse_proxy', 'rewrite', 'root', 'route', 'servers', 'skip_install_trust',
  'skip_log', 'storage', 'templates', 'tls', 'tracing', 'try_files', 'uri', 'vars',
])

interface CaddyfileState {
  depth: number
}

function atLineToken(stream: StringStream) {
  return !/\S/.test(stream.string.slice(0, stream.pos))
}

export const caddyfileParser: StreamParser<CaddyfileState> = {
  name: 'caddyfile',
  startState: () => ({ depth: 0 }),
  token(stream, state) {
    if (stream.eatSpace())
      return null
    if (stream.match(/^#.*/))
      return 'comment'

    const quote = stream.peek()
    if (quote === '"' || quote === "'") {
      stream.next()
      let escaped = false
      while (!stream.eol()) {
        const character = stream.next()
        if (!escaped && character === quote)
          break
        escaped = !escaped && character === '\\'
      }
      return 'string'
    }

    if (stream.match('{')) {
      const next = stream.peek()
      if (next == null || /\s/.test(next) || next === '#') {
        state.depth += 1
        return 'brace'
      }
      if (!stream.match(/^[^}\n]*}/))
        stream.skipToEnd()
      return 'variableName'
    }

    if (stream.eat('}')) {
      if (state.depth > 0)
        state.depth -= 1
      return 'brace'
    }

    if (stream.match(/^@[A-Za-z_][\w.-]*/))
      return 'atom'
    if (stream.match(/^\([A-Za-z_][\w.-]*\)/))
      return 'labelName'

    const lineStart = atLineToken(stream)
    if (!stream.match(/^[^\s#{}"']+/)) {
      stream.next()
      return null
    }

    const token = stream.current()
    if (DIRECTIVES.has(token))
      return 'keyword'
    if (lineStart && state.depth === 0)
      return 'string'
    if (lineStart)
      return 'keyword'
    if (/^\/|:\d|https?:\/\//i.test(token))
      return 'string'
    if (/^\d+(\.\d+)?[kmgt]?i?b?$/i.test(token))
      return 'number'
    return null
  },
  indent(state, textAfter, context) {
    const closer = /^\s*\}/.test(textAfter)
    return Math.max(0, state.depth - (closer ? 1 : 0)) * context.unit
  },
  languageData: {
    commentTokens: { line: '#' },
    indentOnInput: /^\s*\}$/,
    closeBrackets: { brackets: ['(', '[', '{', '"'] },
    autocomplete: (context: CompletionContext) => {
      const word = context.matchBefore(/[A-Za-z_][\w]*/)
      if (!word || (word.from === word.to && !context.explicit))
        return null
      return {
        from: word.from,
        options: [...DIRECTIVES].map(label => ({ label, type: 'keyword' })),
      }
    },
  },
}

export const caddyfileLanguage = StreamLanguage.define(caddyfileParser)

export const caddyfileHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: '#7ee0a3' },
  { tag: tags.comment, color: '#6d776f', fontStyle: 'italic' },
  { tag: tags.string, color: '#e9c887' },
  { tag: tags.variableName, color: '#9ac3fa' },
  { tag: tags.atom, color: '#d4b3ff' },
  { tag: tags.labelName, color: '#75aefa' },
  { tag: tags.brace, color: '#c8d3cc' },
  { tag: tags.number, color: '#e9c887' },
], { themeType: 'dark' })

export function caddyfileSupport() {
  return [
    caddyfileLanguage,
    indentUnit.of('\t'),
    syntaxHighlighting(caddyfileHighlight),
  ]
}

export function collectCaddyfileTokens(doc: string) {
  const tree = caddyfileLanguage.parser.parse(doc)
  const tokens: Array<{ name: string, text: string }> = []
  tree.iterate({
    enter(node) {
      if (!node.type.isError && node.from < node.to && node.name !== 'Document')
        tokens.push({ name: node.name, text: doc.slice(node.from, node.to) })
    },
  })
  return tokens
}
