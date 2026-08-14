export type DiffKind = 'equal' | 'add' | 'remove'

export interface DiffLine {
  kind: DiffKind
  text: string
  oldNumber: number | null
  newNumber: number | null
}

/** Creates a stable line-level diff. Large files use a bounded fallback. */
export function createLineDiff(before: string, after: string): DiffLine[] {
  const oldLines = before.split('\n')
  const newLines = after.split('\n')

  if (oldLines.length * newLines.length > 1_000_000)
    return boundedDiff(oldLines, newLines)

  const table = Array.from({ length: oldLines.length + 1 }, () => new Uint32Array(newLines.length + 1))
  for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex--) {
    for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex--) {
      table[oldIndex]![newIndex] = oldLines[oldIndex] === newLines[newIndex]
        ? table[oldIndex + 1]![newIndex + 1]! + 1
        : Math.max(table[oldIndex + 1]![newIndex]!, table[oldIndex]![newIndex + 1]!)
    }
  }

  const result: DiffLine[] = []
  let oldIndex = 0
  let newIndex = 0
  while (oldIndex < oldLines.length && newIndex < newLines.length) {
    if (oldLines[oldIndex] === newLines[newIndex]) {
      result.push({ kind: 'equal', text: oldLines[oldIndex]!, oldNumber: oldIndex + 1, newNumber: newIndex + 1 })
      oldIndex++
      newIndex++
    }
    else if (table[oldIndex + 1]![newIndex]! >= table[oldIndex]![newIndex + 1]!) {
      result.push({ kind: 'remove', text: oldLines[oldIndex]!, oldNumber: oldIndex + 1, newNumber: null })
      oldIndex++
    }
    else {
      result.push({ kind: 'add', text: newLines[newIndex]!, oldNumber: null, newNumber: newIndex + 1 })
      newIndex++
    }
  }
  while (oldIndex < oldLines.length)
    result.push({ kind: 'remove', text: oldLines[oldIndex]!, oldNumber: ++oldIndex, newNumber: null })
  while (newIndex < newLines.length)
    result.push({ kind: 'add', text: newLines[newIndex]!, oldNumber: null, newNumber: ++newIndex })
  return result
}

function boundedDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  let prefix = 0
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix])
    prefix++

  let suffix = 0
  while (
    suffix < oldLines.length - prefix
    && suffix < newLines.length - prefix
    && oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) suffix++

  const result: DiffLine[] = []
  for (let index = 0; index < prefix; index++)
    result.push({ kind: 'equal', text: oldLines[index]!, oldNumber: index + 1, newNumber: index + 1 })
  for (let index = prefix; index < oldLines.length - suffix; index++)
    result.push({ kind: 'remove', text: oldLines[index]!, oldNumber: index + 1, newNumber: null })
  for (let index = prefix; index < newLines.length - suffix; index++)
    result.push({ kind: 'add', text: newLines[index]!, oldNumber: null, newNumber: index + 1 })
  for (let offset = suffix; offset > 0; offset--) {
    const oldIndex = oldLines.length - offset
    const newIndex = newLines.length - offset
    result.push({ kind: 'equal', text: oldLines[oldIndex]!, oldNumber: oldIndex + 1, newNumber: newIndex + 1 })
  }
  return result
}
