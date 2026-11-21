import { useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { getPublicStory, getPublicUniverse } from '../portal/api'
import { useI18n } from '../i18n'
import { PublicReadGate } from '../components/portal/PublicReadGate'
import { Story } from '../components/portal/PublicStory'

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
  const read = useCallback(
    (signal: AbortSignal) =>
      Promise.all([getPublicUniverse(slug, signal), getPublicStory(slug, storySlug, signal)]),
    [slug, storySlug],
  )

  return (
    <PublicReadGate
      readKey={`${slug}/${storySlug}`}
      read={read}
      missing={{ title: t('portal.story.missing'), testId: 'story-missing' }}
      skeleton="page"
      opening={t('portal.story.opening')}
    >
      {([world, story]) => <Story world={world} story={story} />}
    </PublicReadGate>
  )
}
