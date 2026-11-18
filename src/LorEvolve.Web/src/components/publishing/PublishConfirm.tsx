import { useI18n } from '../../i18n'
import { categoryLabel, genreLabel } from '../../publishing/types'
import type { Confirming, usePublishState } from '../../publishing/usePublishState'
import { SelectedLoreReview } from './SelectedLoreReview'
import { Button } from '../Button'

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
    <div
      className="publication__confirm"
      role="group"
      aria-labelledby="publish-confirm-title"
      tabIndex={-1}
      ref={panel}
      data-testid="publish-confirm"
    >
      <h3 className="publication__confirmtitle" id="publish-confirm-title">
        {tx('universe.publish.confirm.title', { name: <bdi>{confirming.state.name}</bdi> })}
      </h3>
      <p className="settings__note">{t('universe.publish.confirm.anyone')}</p>
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
      <p className="settings__note">
        <strong>{t('universe.publish.confirm.notPublished')}</strong>{' '}
        {t('universe.publish.confirm.staysPrivate')}
      </p>
      <div className="form__actions">
        <Button disabled={busy} onClick={() => void publish()} data-testid="confirm-publish">
          {busy ? t('universe.publish.confirm.publishing') : t('universe.publish.confirm.publish')}
        </Button>
        <Button tone="secondary" disabled={busy} onClick={() => setConfirming(null)}>
          {t('universe.publish.confirm.keepPrivate')}
        </Button>
      </div>
    </div>
  )
}
