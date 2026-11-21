import type { RefObject } from 'react'
import { useI18n } from '../../i18n'
import type { PublishEverythingPreview } from '../../publishing/types'
import { QuietNote } from '../QuietNote'
import { NameListBlock } from './NameListBlock'
import { PublicationConfirm } from './PublicationConfirm'

/** The confirm before Publish everything: each entry and story it would publish, and the stories it would skip. */
export function PublishEverythingConfirm({
  preview,
  nothing,
  panel,
  busy,
  confirm,
  setPreview,
}: {
  preview: PublishEverythingPreview
  nothing: boolean
  panel: RefObject<HTMLDivElement | null>
  busy: boolean
  confirm: () => Promise<void>
  setPreview: (value: PublishEverythingPreview | null) => void
}) {
  const { t, tn } = useI18n()

  return (
    <PublicationConfirm
      title={
        nothing
          ? t('universe.publish.everything.nothingTitle')
          : t('universe.publish.everything.title')
      }
      testId="publish-everything-confirm"
      panel={panel}
      busy={busy}
      onKeep={() => setPreview(null)}
      actions={{
        submitLabel: nothing ? undefined : t('universe.publish.everything.confirm'),
        busyLabel: t('universe.publish.everything.publishing'),
        onSubmit: () => void confirm(),
        submitTestId: 'publish-everything-confirm-button',
        dismiss: nothing ? 'close' : 'cancel',
        cancelLabel: nothing ? undefined : t('universe.publish.everything.keepPrivate'),
      }}
      after={
        nothing ? null : (
          <QuietNote spacing="block">{t('universe.publish.everything.again')}</QuietNote>
        )
      }
    >
      {nothing ? (
        <QuietNote spacing="block">{t('universe.publish.everything.allPublic')}</QuietNote>
      ) : (
        <>
          <QuietNote spacing="block">{t('universe.publish.everything.anyone')}</QuietNote>
          {preview.lore.length > 0 ? (
            <NameListBlock
              id="publish-everything-lore"
              label={tn('universe.publish.everything.loreHeading', preview.lore.length, {
                n: preview.lore.length,
              })}
              items={preview.lore.map((entry) => ({
                id: entry.id,
                name: entry.name,
                aside: <bdi>{entry.typeName}</bdi>,
                testId: 'publish-everything-entry',
              }))}
            />
          ) : null}
          {preview.stories.length > 0 ? (
            <NameListBlock
              id="publish-everything-stories"
              label={tn('universe.publish.everything.storiesHeading', preview.stories.length, {
                n: preview.stories.length,
              })}
              items={preview.stories.map((story) => ({
                id: story.id,
                name: story.title,
                aside: tn('universe.publish.everything.storyScenes', story.scenes, {
                  n: story.scenes,
                }),
                testId: 'publish-everything-story',
              }))}
            />
          ) : null}
        </>
      )}
      {preview.skippedStories.length > 0 ? (
        <NameListBlock
          id="publish-everything-skipped"
          testId="publish-everything-skipped"
          label={t('universe.publish.everything.skipped')}
          note={t('universe.publish.everything.skippedNote')}
          items={preview.skippedStories.map((story) => ({ id: story.id, name: story.title }))}
        />
      ) : null}
    </PublicationConfirm>
  )
}
