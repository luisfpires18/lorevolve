import { isObject, type Json, type Path } from './guard.ts'
import { classifyNode } from './guardClassify.ts'

/** The path of every block the builder draws: editable groups open, everything else is one block. */
export function blockPaths(node: Json, path: Path = []): Path[] {
  const kind = classifyNode(node)
  const paths: Path[] = [path]
  if ((kind === 'all' || kind === 'any') && isObject(node)) {
    ;(node.of as Json[]).forEach((child, index) =>
      paths.push(...blockPaths(child, [...path, 'of', index])),
    )
  } else if (kind === 'not' && isObject(node)) {
    paths.push(...blockPaths(node.of, [...path, 'of']))
  }
  return paths
}

/** A block's address in the tree, as its `data-path` and the key its problems are grouped by. */
export function pathKey(path: Path) {
  return path.length === 0 ? 'root' : path.join('.')
}

/** The drawn block nearest to a path: the longest block path it starts with. */
export function blockFor(path: Path, blocks: Path[]): Path {
  let best: Path = []
  for (const block of blocks) {
    if (
      block.length > best.length &&
      block.length <= path.length &&
      block.every((key, at) => path[at] === key)
    ) {
      best = block
    }
  }
  return best
}

/**
 * A refusal's dotted path (`condition.of[1].left.of`) as keys into the condition, or null when it is not under the
 * condition (an exception) or does not parse.
 */
export function pathOf(serverPath: string): Path | null {
  if (!/^condition(?=$|[.[])/.test(serverPath)) return null
  const rest = serverPath.slice('condition'.length)
  const step = /\.([A-Za-z_]\w*)|\[(\d+)\]/y
  const path: Path = []
  while (step.lastIndex < rest.length) {
    const match = step.exec(rest)
    if (!match) return null
    path.push(match[1] ?? Number(match[2]))
  }
  return path
}
