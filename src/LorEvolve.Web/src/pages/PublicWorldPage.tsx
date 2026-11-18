import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { PortalError, PortalMissing } from '../components/PortalMissing'
import { getPublicUniverse, type PublicUniverse } from '../portal/api'
import { useI18n } from '../i18n'
import { World } from '../components/portal/World'

type LoadState =
  | { slug: string; kind: 'ready'; world: PublicUniverse }
  | { slug: string; kind: 'missing' }
  | { slug: string; kind: 'error' }

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
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<LoadState | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    getPublicUniverse(slug, controller.signal)
      .then((world) => setState({ slug, kind: 'ready', world }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({
          slug,
          kind: (error as { status?: number }).status === 404 ? 'missing' : 'error',
        })
      })
    return () => {
      controller.abort()
    }
  }, [slug, attempt])

  const current = state?.slug === slug ? state : null

  if (current?.kind === 'missing') {
    return <PortalMissing title={t('portal.world.missing')} testId="world-missing" />
  }

  if (current?.kind === 'error') {
    return <PortalError onRetry={() => setAttempt((value) => value + 1)} />
  }

  if (!current) {
    return (
      <div className="pworld pworld--loading" role="status" aria-label={t('portal.world.opening')}>
        <div className="pworld-hero pworld-hero--skeleton" />
      </div>
    )
  }

  return <World world={current.world} />
}
