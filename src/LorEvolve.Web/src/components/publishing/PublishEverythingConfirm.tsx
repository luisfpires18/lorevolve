import type { RefObject } from 'react'
import { useI18n } from '../../i18n'
import type { PublishEverythingPreview } from '../../publishing/types'
import { FormActions } from '../FormActions'

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
    <div
      className="publication__confirm"
      role="group"
      aria-labelledby="publish-everything-title"
      tabIndex={-1}
      ref={panel}
      data-testid="publish-everything-confirm"
    >
      <h3 className="publication__confirmtitle" id="publish-everything-title">
        {nothing
          ? t('universe.publish.everything.nothingTitle')
          : t('universe.publish.everything.title')}
      </h3>
      {nothing ? (
        <p className="settings__note">{t('universe.publish.everything.allPublic')}</p>
      ) : (
        <>
          <p className="settings__note">{t('universe.publish.everything.anyone')}</p>
          {preview.lore.length > 0 ? (
            <div className="publication__selected">
              <p className="settings__note" id="publish-everything-lore">
                <strong>
                  {tn('universe.publish.everything.loreHeading', preview.lore.length, {
                    n: preview.lore.length,
                  })}
                </strong>
              </p>
              <ul
                className="publication__selectedlist"
                aria-labelledby="publish-everything-lore"
                tabIndex={0}
              >
                {preview.lore.map((entry) => (
                  <li key={entry.id} data-testid="publish-everything-entry">
                    <bdi>{entry.name}</bdi>{' '}
                    <span className="publication__selectedtype">
                      · <bdi>{entry.typeName}</bdi>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {preview.stories.length > 0 ? (
            <div className="publication__selected">
              <p className="settings__note" id="publish-everything-stories">
                <strong>
                  {tn('universe.publish.everything.storiesHeading', preview.stories.length, {
                    n: preview.stories.length,
                  })}
                </strong>
              </p>
              <ul
                className="publication__selectedlist"
                aria-labelledby="publish-everything-stories"
                tabIndex={0}
              >
                {preview.stories.map((story) => (
                  <li key={story.id} data-testid="publish-everything-story">
                    <bdi>{story.title}</bdi>{' '}
                    <span className="publication__selectedtype">
                      ·{' '}
                      {tn('universe.publish.everything.storyScenes', story.scenes, {
                        n: story.scenes,
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
      {preview.skippedStories.length > 0 ? (
        <div className="publication__selected" data-testid="publish-everything-skipped">
          <p className="settings__note" id="publish-everything-skipped">
            <strong>{t('universe.publish.everything.skipped')}</strong>{' '}
            {t('universe.publish.everything.skippedNote')}
          </p>
          <ul
            className="publication__selectedlist"
            aria-labelledby="publish-everything-skipped"
            tabIndex={0}
          >
            {preview.skippedStories.map((story) => (
              <li key={story.id}>
                <bdi>{story.title}</bdi>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <FormActions
        submitLabel={nothing ? undefined : t('universe.publish.everything.confirm')}
        busy={busy}
        busyLabel={t('universe.publish.everything.publishing')}
        onSubmit={() => void confirm()}
        submitTestId="publish-everything-confirm-button"
        onCancel={() => setPreview(null)}
        dismiss={nothing ? 'close' : 'cancel'}
        cancelLabel={nothing ? undefined : t('universe.publish.everything.keepPrivate')}
        lockCancel
        inline
      />
      {nothing ? null : <p className="settings__note">{t('universe.publish.everything.again')}</p>}
    </div>
  )
}
