/** One run of a prose comparison: paragraphs kept, taken out or put in. */
export interface ProsePart {
  kind: 'same' | 'removed' | 'added'
  paragraphs: string[]
}

/** Past this many changed paragraphs on a side, the middle is shown as replaced whole rather than compared line by line. */
const COMPARED_LIMIT = 400

function paragraphs(text: string) {
  return text.length === 0 ? [] : text.split(/\n{2,}/)
}

/**
 * The difference between two texts, paragraph by paragraph: the shared start and end found directly, the middle by a
 * longest-common-subsequence table when it is small enough, else shown as replaced. Plain text in, plain text out.
 */
export function compareProse(before: string, after: string): ProsePart[] {
  const a = paragraphs(before)
  const b = paragraphs(after)

  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let end = 0
  while (
    end < a.length - start &&
    end < b.length - start &&
    a[a.length - 1 - end] === b[b.length - 1 - end]
  )
    end++

  const middleA = a.slice(start, a.length - end)
  const middleB = b.slice(start, b.length - end)
  const parts: ProsePart[] = []
  const push = (kind: ProsePart['kind'], paragraph: string) => {
    const last = parts.at(-1)
    if (last?.kind === kind) last.paragraphs.push(paragraph)
    else parts.push({ kind, paragraphs: [paragraph] })
  }

  a.slice(0, start).forEach((paragraph) => push('same', paragraph))

  if (middleA.length > COMPARED_LIMIT || middleB.length > COMPARED_LIMIT) {
    middleA.forEach((paragraph) => push('removed', paragraph))
    middleB.forEach((paragraph) => push('added', paragraph))
  } else {
    // lengths[i][j]: the longest shared run of middleA from i and middleB from j.
    const lengths = Array.from({ length: middleA.length + 1 }, () =>
      new Array<number>(middleB.length + 1).fill(0),
    )
    for (let i = middleA.length - 1; i >= 0; i--) {
      for (let j = middleB.length - 1; j >= 0; j--) {
        lengths[i][j] =
          middleA[i] === middleB[j]
            ? lengths[i + 1][j + 1] + 1
            : Math.max(lengths[i + 1][j], lengths[i][j + 1])
      }
    }

    let i = 0
    let j = 0
    while (i < middleA.length || j < middleB.length) {
      if (i < middleA.length && j < middleB.length && middleA[i] === middleB[j]) {
        push('same', middleA[i++])
        j++
      } else if (
        j < middleB.length &&
        (i === middleA.length || lengths[i][j + 1] >= lengths[i + 1][j])
      ) {
        push('added', middleB[j++])
      } else {
        push('removed', middleA[i++])
      }
    }
  }

  a.slice(a.length - end).forEach((paragraph) => push('same', paragraph))
  return parts
}
