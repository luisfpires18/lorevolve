import { useI18n } from '../../i18n'
import { categoryLabel, genreLabel } from '../../publishing/types'
import type { Confirming, usePublishState } from '../../publishing/usePublishState'
import { SelectedLoreReview } from './SelectedLoreReview'
import { PublicationConfirm } from './PublicationConfirm'
import { QuietNote } from '../QuietNote'
import { Fact } from '../Fact'
import { FactList } from '../FactList'

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
    <PublicationConfirm
      title={tx('universe.publish.confirm.title', { name: <bdi>{confirming.state.name}</bdi> })}
      testId="publish-confirm"
      panel={panel}
      busy={busy}
      onKeep={() => setConfirming(null)}
      actions={{
        submitLabel: t('universe.publish.confirm.publish'),
        busyLabel: t('universe.publish.confirm.publishing'),
        onSubmit: () => void publish(),
        submitTestId: 'confirm-publish',
        cancelLabel: t('universe.publish.confirm.keepPrivate'),
      }}
    >
      <QuietNote spacing="block">{t('universe.publish.confirm.anyone')}</QuietNote>
      <FactList look="labelled">
        <Fact name={t('universe.publish.confirm.titleLabel')}>
          <bdi>{confirming.state.name}</bdi>
        </Fact>
        <Fact name={t('universe.publish.confirm.summary')} valueClassName="prose">
          {confirming.state.publicSummary}
        </Fact>
        <Fact name={t('universe.publish.confirm.artwork')}>
          {t('universe.publish.confirm.artworkValue')}
        </Fact>
        <Fact name={t('universe.publish.confirm.category')}>
          {confirming.state.category ? categoryLabel(confirming.state.category) : ''}
        </Fact>
        <Fact name={t('universe.publish.confirm.genres')}>
          {confirming.state.genres.map(genreLabel).join(', ')}
        </Fact>
        {confirming.state.originalCreator ? (
          <>
            <Fact name={t('universe.publish.confirm.basedOn')}>
              {confirming.state.originalWork ? (
                tx('universe.publish.confirm.basedOnValue', {
                  creator: <bdi>{confirming.state.originalCreator}</bdi>,
                  work: <bdi>{confirming.state.originalWork}</bdi>,
                })
              ) : (
                <bdi>{confirming.state.originalCreator}</bdi>
              )}
            </Fact>
            <Fact name={t('universe.publish.confirm.curator')}>
              <bdi>{confirming.state.authorDisplayName}</bdi>
            </Fact>
          </>
        ) : (
          <Fact name={t('universe.publish.confirm.author')}>
            <bdi>{confirming.state.authorDisplayName}</bdi>
          </Fact>
        )}
      </FactList>
      <SelectedLoreReview selected={confirming.selected} />
      <QuietNote spacing="block">
        <strong>{t('universe.publish.confirm.notPublished')}</strong>{' '}
        {t('universe.publish.confirm.staysPrivate')}
      </QuietNote>
    </PublicationConfirm>
  )
}
