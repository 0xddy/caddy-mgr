export function parseSystemdProperties(output: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of output.split(/\r?\n/)) {
    const index = line.indexOf('=');
    if (index > 0) values[line.slice(0, index)] = line.slice(index + 1);
  }
  return values;
}

export function shellWords(input: string): string[] {
  const words: string[] = [];
  let value = '';
  let quote: "'" | '"' | null = null;
  let escaping = false;
  for (const character of input) {
    if (escaping) {
      value += character;
      escaping = false;
    } else if (character === '\\' && quote !== "'") {
      escaping = true;
    } else if (quote) {
      if (character === quote) quote = null;
      else value += character;
    } else if (character === "'" || character === '"') {
      quote = character;
    } else if (/\s/.test(character)) {
      if (value) {
        words.push(value);
        value = '';
      }
    } else {
      value += character;
    }
  }
  if (value) words.push(value);
  return words;
}

export function extractExecCommand(value: string): string[] {
  const argv = value.match(/argv\[\]=([^;}]*)/)?.[1]?.trim() ?? value.replace(/^\{\s*path=[^;]+;/, '').replace(/\}$/, '').trim();
  return shellWords(argv);
}

export function flagValue(argv: string[], name: string): string | undefined {
  return flagValues(argv, name).at(-1);
}

/** Returns flag values in argv order; an empty value marks a malformed flag. */
export function flagValues(argv: string[], name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const part = argv[index];
    if (part === name) {
      values.push(argv[index + 1] ?? '');
      index += 1;
    } else if (part.startsWith(`${name}=`)) {
      values.push(part.slice(name.length + 1));
    }
  }
  return values;
}

export function decodeSystemdEscapes(value: string): string {
  return value
    .replace(/\\x([0-9a-fA-F]{2})/g, (_match, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\s/g, ' ')
    .replace(/\\\\/g, '\\');
}

/** Parses the serialized `systemctl show -p EnvironmentFiles` representation. */
export function parseEnvironmentFiles(value: string): string[] {
  const files: string[] = [];
  const pattern = /(-?\/\S+?)\s+\(ignore_errors=(yes|no)\)/g;
  for (const match of value.matchAll(pattern)) {
    const decoded = decodeSystemdEscapes(match[1]);
    const path = decoded.startsWith('-') ? decoded.slice(1) : decoded;
    if (!path.startsWith('/') || path.includes('\u0000') || path.includes('\n')) continue;
    files.push(`${match[2] === 'yes' ? '-' : ''}${path}`);
  }
  return files;
}
