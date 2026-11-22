import { useRef, useState } from 'react'
import { Globe } from 'lucide-react'
import { useI18n } from '../../i18n'
import { getPublishEverything, publishEverything } from '../../publishing/api'
import type { PublishEverythingPreview, PublishEverythingResult } from '../../publishing/types'
import { PublishEverythingConfirm } from './PublishEverythingConfirm'
import { Button } from '../Button'
import { errorText } from '../../lib/errorText'
import { useConfirmFocus } from '../../lib/useConfirmFocus'
import { FormMessage } from '../FormMessage'
import { QuietNote } from '../QuietNote'

/**
 * Publish everything: every Canon lore entry and every Complete story, with its scenes and their text, in one action. The
 * confirmation names each of them, read fresh from the server, and the stories skipped for want of a public summary. It
 * only adds: Idea and Draft lore, unfinished stories, plot arcs and anything already public are left as they are.
 */
export function PublishEverything({
  universeId,
  onPublished,
}: {
  universeId: string
  onPublished: () => void
}) {
  const { t, tn } = useI18n()

  function publishedSentence({ lore, stories, scenes }: PublishEverythingResult) {
    if (lore + stories + scenes === 0) return t('universe.publish.everything.nothingPublished')
    return t('universe.publish.everything.publishedSentence', {
      lore: tn('universe.publish.everything.publishedLore', lore, { n: lore }),
      stories: tn('universe.publish.everything.publishedStories', stories, { n: stories }),
      scenes: tn('universe.publish.everything.publishedScenes', scenes, { n: scenes }),
    })
  }

  const [preview, setPreview] = useState<PublishEverythingPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const panel = useRef<HTMLDivElement>(null)

  useConfirmFocus(preview, panel)

  async function ask() {
    setError(null)
    setDone(null)
    setBusy(true)
    try {
      setPreview(await getPublishEverything(universeId))
    } catch (failure: unknown) {
      setError(errorText(failure, t('universe.publish.everything.checkFailed')))
    } finally {
      setBusy(false)
    }
  }

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      const result = await publishEverything(universeId)
      setPreview(null)
      setDone(publishedSentence(result))
      onPublished()
    } catch (failure: unknown) {
      setError(errorText(failure, t('universe.publish.everything.publishFailed')))
    } finally {
      setBusy(false)
    }
  }

  const nothing = preview !== null && preview.lore.length === 0 && preview.stories.length === 0

  return (
    <div className="publish__everything" data-testid="publish-everything">
      <QuietNote spacing="block">{t('universe.publish.everything.note')}</QuietNote>
      {!preview ? (
        <Button
          tone="secondary"
          icon={Globe}
          busy={busy}
          onClick={() => void ask()}
          data-testid="publish-everything-open"
        >
          {t('universe.publish.everything.open')}
        </Button>
      ) : null}

      {error ? <FormMessage testId="publish-everything-error">{error}</FormMessage> : null}
      {done ? (
        <QuietNote tone="saved" role="status" testId="publish-everything-done">
          {done}
        </QuietNote>
      ) : null}

      {preview ? (
        <PublishEverythingConfirm
          preview={preview}
          nothing={nothing}
          panel={panel}
          busy={busy}
          confirm={confirm}
          setPreview={setPreview}
        />
      ) : null}
    </div>
  )
}
