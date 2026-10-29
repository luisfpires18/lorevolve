import { Link } from 'react-router-dom'
import { findMentions, markedPieces } from '../lore/mentions'

/**
 * A manuscript as a reader reads it: the prose as written, each Lore mention as a link to its entry, named as the prose
 * names it (issue 31). The stored text is not changed; a mention that names a removed entry still links, and its entry
 * page says it is gone.
 */
export function MentionProse({ universeId, text }: { universeId: string; text: string }) {
  const parts: React.ReactNode[] = []
  let at = 0
  for (const mention of findMentions(text)) {
    if (mention.start > at) parts.push(text.slice(at, mention.start))
    parts.push(
      <Link
        key={mention.start}
        className="mention"
        to={`/app/universes/${universeId}/lore/${mention.entityId}`}
        data-testid="manuscript-mention"
      >
        {mention.name}
      </Link>,
    )
    at = mention.start + mention.length
  }
  if (at < text.length) parts.push(text.slice(at))
  return <>{parts}</>
}

/**
 * The Write view's backdrop (ADR 0058 amendment): the draft drawn character for character under a text box whose own
 * text is transparent, so each mention's name stands out and its markup fades back while the caret, selection, undo and
 * the stored text stay the text box's own. Nothing may change a glyph's width here, or the two drift apart.
 */
export function MentionMarks({ text }: { text: string }) {
  return (
    <>
      {markedPieces(text).map((piece, at) =>
        piece.part ? (
          <span
            key={at}
            className={`mentionmark__${piece.part}`}
            data-testid={piece.part === 'name' ? 'manuscript-mark' : undefined}
          >
            {piece.text}
          </span>
        ) : (
          piece.text
        ),
      )}
      {/* A text box shows the empty line after a final line break; a block only does with something on it. */}
      {'\u200b'}
    </>
  )
}
