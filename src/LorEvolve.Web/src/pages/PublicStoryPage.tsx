import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { PortalError, PortalMissing } from '../components/PortalMissing'
import {
  getPublicStory,
  getPublicUniverse,
  type PublicStoryDetail,
  type PublicUniverse,
} from '../portal/api'
import { useI18n } from '../i18n'
import { Story } from '../components/portal/PublicStory'

type LoadState =
  | { key: string; kind: 'ready'; world: PublicUniverse; story: PublicStoryDetail }
  | { key: string; kind: 'missing' }
  | { key: string; kind: 'error' }

/**
 * One published story at `/worlds/{world}/stories/{story}` (Task 011; a reader since Product refinement 015, ADR 0039): its
 * title, the summary its author wrote for readers, who it is by - with the original creator first for a world based on
 * someone else's work - and then exactly what its author published inside it, in the author's order: the manuscript (each
 * published scene's prose under its title), the scenes' outline, and any plot arc published on purpose. A section with
 * nothing in it is not drawn, and nothing counts or hints at what is private. The world it is set in closes the page.
 * Private and missing are one page; the owner, signed in, gets "Edit in workspace".
 */
export default function PublicStoryPage() {
  const { t } = useI18n()
  const { slug = '', storySlug = '' } = useParams<{ slug: string; storySlug: string }>()
  const key = `${slug}/${storySlug}`
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<LoadState | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      getPublicUniverse(slug, controller.signal),
      getPublicStory(slug, storySlug, controller.signal),
    ])
      .then(([world, story]) => setState({ key, kind: 'ready', world, story }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({ key, kind: (error as { status?: number }).status === 404 ? 'missing' : 'error' })
      })
    return () => {
      controller.abort()
    }
  }, [slug, storySlug, key, attempt])

  const current = state?.key === key ? state : null

  if (current?.kind === 'missing') {
    return <PortalMissing title={t('portal.story.missing')} testId="story-missing" />
  }

  if (current?.kind === 'error') {
    return <PortalError onRetry={() => setAttempt((value) => value + 1)} />
  }

  if (!current) {
    return (
      <div className="pread" role="status" aria-label={t('portal.story.opening')}>
        <div className="pskeleton pskeleton--page" />
      </div>
    )
  }

  return <Story world={current.world} story={current.story} />
}
