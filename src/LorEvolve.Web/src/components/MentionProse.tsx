import { Link } from 'react-router-dom'
import { findMentions } from '../lore/mentions'

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
