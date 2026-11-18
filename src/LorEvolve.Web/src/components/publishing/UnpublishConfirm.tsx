import { useI18n } from '../../i18n'
import type { PublicationState } from '../../publishing/types'
import type { usePublishState } from '../../publishing/usePublishState'
import { Button } from '../Button'

/** The confirm before making the universe private. */
export function UnpublishConfirm({
  state,
  panel,
  busy,
  unpublish,
  setConfirming,
}: Pick<ReturnType<typeof usePublishState>, 'panel' | 'busy' | 'setConfirming'> & {
  state: PublicationState
  unpublish: () => Promise<void>
}) {
  const { t, tx } = useI18n()

  return (
    <div
      className="publication__confirm"
      role="group"
      aria-labelledby="unpublish-confirm-title"
      tabIndex={-1}
      ref={panel}
      data-testid="unpublish-confirm"
    >
      <h3 className="publication__confirmtitle" id="unpublish-confirm-title">
        {tx('universe.publish.unpublish.title', { name: <bdi>{state.name}</bdi> })}
      </h3>
      <p className="settings__note">{t('universe.publish.unpublish.note')}</p>
      <div className="form__actions">
        <Button disabled={busy} onClick={() => void unpublish()} data-testid="confirm-unpublish">
          {busy ? t('universe.publish.unpublish.working') : t('universe.publish.unpublish.confirm')}
        </Button>
        <Button tone="secondary" disabled={busy} onClick={() => setConfirming(null)}>
          {t('universe.publish.unpublish.keep')}
        </Button>
      </div>
    </div>
  )
}
