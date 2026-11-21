import { useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { getPublicUniverse } from '../portal/api'
import { useI18n } from '../i18n'
import { PublicReadGate } from '../components/portal/PublicReadGate'
import { World } from '../components/portal/World'

/**
 * One public universe at `/worlds/{slug}` (Task 011): where an Explore card leads. The author's artwork behind a
 * cinematic hero - the public 16:10 card, drawn crisp at no more than its own width and, blurred, as the backdrop, so
 * nothing is enlarged into softness and the private original is never needed - with the name, the author, what kind of
 * world it is and its public summary. Under it, what the author published inside it: lore, then stories, each a page at
 * a time with Show more.
 *
 * Only what is public, and nothing about what is not: a section with nothing published is left out, one with nothing
 * at all says so plainly, and no count of anything private exists to show. Private and missing worlds are the same
 * page. The owner, signed in, gets one quiet way back to the workspace; nobody else learns who the owner is.
 */
export default function PublicWorldPage() {
  const { t } = useI18n()
  const { slug = '' } = useParams<{ slug: string }>()
  const read = useCallback((signal: AbortSignal) => getPublicUniverse(slug, signal), [slug])

  return (
    <PublicReadGate
      readKey={slug}
      read={read}
      missing={{ title: t('portal.world.missing'), testId: 'world-missing' }}
      skeleton="hero"
      opening={t('portal.world.opening')}
    >
      {(world) => <World world={world} />}
    </PublicReadGate>
  )
}
