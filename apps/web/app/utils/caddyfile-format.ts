const HEREDOC_MARKER = /^[A-Za-z0-9_-]+$/

const enum Heredoc {
  Closed = 0,
  Opening = 1,
  Opened = 2,
}

function isSpace(ch: string) {
  return ch !== '' && /\p{White_Space}/u.test(ch)
}

function runesEqual(left: string[], right: string[]) {
  if (left.length !== right.length)
    return false
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index])
      return false
  }
  return true
}

/**
 * Port of Caddy v2.11 `caddyconfig/caddyfile.Format`.
 * Reformats braces and whitespace locally; does not parse or validate.
 */
export function formatCaddyfile(source: string): string {
  const chars = Array.from(source.trim())
  const out: string[] = []

  let last = ''
  let space = true
  let beginningOfLine = true
  let openBrace = false
  let openBraceWritten = false
  let openBraceSpace = false
  let newLines = 0
  let comment = false
  let quotes = ''
  let escaped = false
  let heredoc: Heredoc = Heredoc.Closed
  let heredocEscaped = false
  let heredocMarker: string[] = []
  let heredocClosingMarker: string[] = []
  let nesting = 0
  let currentToken = ''
  let currentLineFirstToken = ''
  let previousLineWasTopLevelImport = false
  let openBraceOwnLine = false

  const finishToken = () => {
    if (!currentToken)
      return
    if (!currentLineFirstToken)
      currentLineFirstToken = currentToken
    currentToken = ''
  }

  const finishLine = () => {
    finishToken()
    if (currentLineFirstToken)
      previousLineWasTopLevelImport = nesting === 0 && currentLineFirstToken === 'import'
    else if (!openBrace || !openBraceOwnLine || openBraceWritten)
      previousLineWasTopLevelImport = false
    currentLineFirstToken = ''
  }

  const write = (ch: string) => {
    out.push(ch)
    last = ch
  }

  const indent = () => {
    for (let tabs = nesting; tabs > 0; tabs--)
      write('\t')
  }

  const nextLine = () => {
    write('\n')
    beginningOfLine = true
  }

  for (const ch of chars) {
    if (quotes === '' && heredoc === Heredoc.Closed && !heredocEscaped && space && last === '<' && ch === '<') {
      write(ch)
      heredoc = Heredoc.Opening
      space = false
      continue
    }

    if (heredoc === Heredoc.Opening) {
      if (ch === '\n') {
        const marker = heredocMarker.join('')
        if (heredocMarker.length > 0 && HEREDOC_MARKER.test(marker)) {
          heredoc = Heredoc.Opened
        }
        else {
          heredocMarker = []
          heredoc = Heredoc.Closed
          nextLine()
          continue
        }
        write(ch)
        continue
      }
      if (isSpace(ch)) {
        heredocMarker = []
        heredoc = Heredoc.Closed
      }
      else {
        heredocMarker.push(ch)
        write(ch)
        continue
      }
    }

    if (heredoc === Heredoc.Opened) {
      heredocClosingMarker.push(ch)
      if (heredocClosingMarker.length > heredocMarker.length + 1)
        heredocClosingMarker = heredocClosingMarker.slice(1)
      if (isSpace(ch) && runesEqual(heredocClosingMarker.slice(0, -1), heredocMarker)) {
        heredocMarker = []
        heredocClosingMarker = []
        heredoc = Heredoc.Closed
      }
      else {
        write(ch)
        if (ch === '\n')
          heredocClosingMarker = []
        continue
      }
    }

    if (last === '<' && space)
      space = false

    if (comment) {
      if (ch === '\n') {
        comment = false
        space = true
        nextLine()
      }
      else {
        write(ch)
      }
      continue
    }

    if (!escaped && ch === '\\') {
      if (space) {
        write(' ')
        space = false
      }
      write(ch)
      escaped = true
      continue
    }

    if (escaped) {
      if (ch === '<')
        heredocEscaped = true
      write(ch)
      escaped = false
      continue
    }

    if (ch === '`') {
      if (quotes === '"`')
        quotes = '"'
      else if (quotes === '`')
        quotes = ''
      else if (quotes === '"')
        quotes = '"`'
      else
        quotes = '`'
    }

    if (quotes === '"') {
      if (ch === '"')
        quotes = ''
      write(ch)
      continue
    }

    if (ch === '"') {
      if (quotes === '') {
        if (space)
          quotes = '"'
      }
      else if (quotes === '`"') {
        quotes = '`'
      }
      else if (quotes === '"`') {
        quotes = ''
      }
    }

    if (quotes.includes('`')) {
      if (ch === '`' && space && !beginningOfLine)
        write(' ')
      write(ch)
      space = false
      continue
    }

    if (isSpace(ch)) {
      finishToken()
      space = true
      heredocEscaped = false
      if (ch === '\n') {
        finishLine()
        newLines++
      }
      continue
    }

    const spacePrior = space
    space = false

    if (ch === '#')
      comment = true

    if (openBrace && spacePrior && !openBraceWritten) {
      if (nesting === 0 && last === '}') {
        nextLine()
        nextLine()
      }

      openBrace = false
      if (openBraceOwnLine && previousLineWasTopLevelImport) {
        if (last !== '\n')
          nextLine()
        indent()
      }
      else if (beginningOfLine) {
        indent()
      }
      else if (!openBraceSpace || !isSpace(last)) {
        write(' ')
      }
      write('{')
      openBraceWritten = true
      openBraceOwnLine = false
      nextLine()
      newLines = 0
      if (nesting < 10)
        nesting++
    }

    if (ch === '{') {
      finishToken()
      openBrace = true
      openBraceSpace = spacePrior && !beginningOfLine
      openBraceOwnLine = newLines > 0
      if (openBraceSpace && newLines === 0)
        write(' ')
      openBraceWritten = false
      if (quotes === '`') {
        write('{')
        openBraceWritten = true
        openBraceOwnLine = false
      }
      continue
    }

    if (ch === '}' && (spacePrior || !openBrace)) {
      finishToken()
      if (quotes === '`') {
        write('}')
        continue
      }
      if (last !== '\n')
        nextLine()
      if (nesting > 0)
        nesting--
      indent()
      write('}')
      newLines = 0
      continue
    }

    if (newLines > 2)
      newLines = 2
    for (let index = 0; index < newLines; index++)
      nextLine()
    newLines = 0
    if (beginningOfLine)
      indent()
    if (nesting === 0 && last === '}' && beginningOfLine) {
      nextLine()
      nextLine()
    }

    if (!beginningOfLine && spacePrior)
      write(' ')

    if (openBrace && !openBraceWritten) {
      write('{')
      openBraceWritten = true
    }

    if (spacePrior && ch === '<')
      space = true

    currentToken += ch
    write(ch)
    beginningOfLine = false
  }

  return `${out.join('').trim()}\n`
}
