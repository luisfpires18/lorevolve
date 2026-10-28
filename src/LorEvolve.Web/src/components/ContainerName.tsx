import { chapterNumber, UNCHAPTERED } from '../stories/format'

/**
 * Where a scene sits, drawn: "Chapter 3: The Fall", or "Unchaptered". The number is LorEvolve's and the title the
 * author's, isolated in a `<bdi>`, so a title written right to left cannot pull the number, the colon or whatever
 * follows the label into its own direction. `chapterLabel` is the same words as plain text, for where no markup can go.
 */
export function ContainerName({ chapter }: { chapter: { index: number; title: string } | null }) {
  if (chapter === null) return UNCHAPTERED
  return (
    <>
      {chapterNumber(chapter.index)}: <bdi>{chapter.title}</bdi>
    </>
  )
}
