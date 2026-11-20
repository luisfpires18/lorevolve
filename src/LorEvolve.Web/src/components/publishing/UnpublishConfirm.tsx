import { useI18n } from '../../i18n'
import type { PublicationState } from '../../publishing/types'
import type { usePublishState } from '../../publishing/usePublishState'
import { FormActions } from '../FormActions'
import { InlineConfirm } from '../InlineConfirm'

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
    <InlineConfirm
      look="publication"
      titleAs="h3"
      title={tx('universe.publish.unpublish.title', { name: <bdi>{state.name}</bdi> })}
      panelRef={panel}
      onKeep={() => setConfirming(null)}
      busy={busy}
      testId="unpublish-confirm"
    >
      <p className="settings__note">{t('universe.publish.unpublish.note')}</p>
      <FormActions
        submitLabel={t('universe.publish.unpublish.confirm')}
        busy={busy}
        busyLabel={t('universe.publish.unpublish.working')}
        onSubmit={() => void unpublish()}
        submitTestId="confirm-unpublish"
        onCancel={() => setConfirming(null)}
        cancelLabel={t('universe.publish.unpublish.keep')}
        lockCancel
        inline
      />
    </InlineConfirm>
  )
}
