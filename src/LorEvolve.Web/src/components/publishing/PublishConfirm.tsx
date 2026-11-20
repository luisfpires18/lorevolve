import { useI18n } from '../../i18n'
import { categoryLabel, genreLabel } from '../../publishing/types'
import type { Confirming, usePublishState } from '../../publishing/usePublishState'
import { SelectedLoreReview } from './SelectedLoreReview'
import { FormActions } from '../FormActions'
import { InlineConfirm } from '../InlineConfirm'
import { QuietNote } from '../QuietNote'

/** The confirm before publishing: exactly what becomes public, read fresh, and the lore that goes with it. */
export function PublishConfirm({
  confirming,
  panel,
  busy,
  publish,
  setConfirming,
}: Pick<ReturnType<typeof usePublishState>, 'panel' | 'busy' | 'setConfirming'> & {
  confirming: Extract<Confirming, { kind: 'publish' }>
  publish: () => Promise<void>
}) {
  const { t, tx } = useI18n()

  return (
    <InlineConfirm
      look="publication"
      titleAs="h3"
      title={tx('universe.publish.confirm.title', { name: <bdi>{confirming.state.name}</bdi> })}
      panelRef={panel}
      onKeep={() => setConfirming(null)}
      busy={busy}
      testId="publish-confirm"
    >
      <QuietNote spacing="block">{t('universe.publish.confirm.anyone')}</QuietNote>
      <dl className="publication__facts">
        <div>
          <dt>{t('universe.publish.confirm.titleLabel')}</dt>
          <dd>
            <bdi>{confirming.state.name}</bdi>
          </dd>
        </div>
        <div>
          <dt>{t('universe.publish.confirm.summary')}</dt>
          <dd className="prose">{confirming.state.publicSummary}</dd>
        </div>
        <div>
          <dt>{t('universe.publish.confirm.artwork')}</dt>
          <dd>{t('universe.publish.confirm.artworkValue')}</dd>
        </div>
        <div>
          <dt>{t('universe.publish.confirm.category')}</dt>
          <dd>{confirming.state.category ? categoryLabel(confirming.state.category) : ''}</dd>
        </div>
        <div>
          <dt>{t('universe.publish.confirm.genres')}</dt>
          <dd>{confirming.state.genres.map(genreLabel).join(', ')}</dd>
        </div>
        {confirming.state.originalCreator ? (
          <>
            <div>
              <dt>{t('universe.publish.confirm.basedOn')}</dt>
              <dd>
                {confirming.state.originalWork ? (
                  tx('universe.publish.confirm.basedOnValue', {
                    creator: <bdi>{confirming.state.originalCreator}</bdi>,
                    work: <bdi>{confirming.state.originalWork}</bdi>,
                  })
                ) : (
                  <bdi>{confirming.state.originalCreator}</bdi>
                )}
              </dd>
            </div>
            <div>
              <dt>{t('universe.publish.confirm.curator')}</dt>
              <dd>
                <bdi>{confirming.state.authorDisplayName}</bdi>
              </dd>
            </div>
          </>
        ) : (
          <div>
            <dt>{t('universe.publish.confirm.author')}</dt>
            <dd>
              <bdi>{confirming.state.authorDisplayName}</bdi>
            </dd>
          </div>
        )}
      </dl>
      <SelectedLoreReview selected={confirming.selected} />
      <QuietNote spacing="block">
        <strong>{t('universe.publish.confirm.notPublished')}</strong>{' '}
        {t('universe.publish.confirm.staysPrivate')}
      </QuietNote>
      <FormActions
        submitLabel={t('universe.publish.confirm.publish')}
        busy={busy}
        busyLabel={t('universe.publish.confirm.publishing')}
        onSubmit={() => void publish()}
        submitTestId="confirm-publish"
        onCancel={() => setConfirming(null)}
        cancelLabel={t('universe.publish.confirm.keepPrivate')}
        lockCancel
        inline
      />
    </InlineConfirm>
  )
}
