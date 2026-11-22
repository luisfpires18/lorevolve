import { useI18n } from '../../i18n'
import type { PublicationState } from '../../publishing/types'
import type { usePublishState } from '../../publishing/usePublishState'
import { QuietNote } from '../QuietNote'
import { PublicationConfirm } from './PublicationConfirm'

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
    <PublicationConfirm
      title={tx('universe.publish.unpublish.title', { name: <bdi>{state.name}</bdi> })}
      testId="unpublish-confirm"
      panel={panel}
      busy={busy}
      onKeep={() => setConfirming(null)}
      actions={{
        submitLabel: t('universe.publish.unpublish.confirm'),
        busyLabel: t('universe.publish.unpublish.working'),
        onSubmit: () => void unpublish(),
        submitTestId: 'confirm-unpublish',
        cancelLabel: t('universe.publish.unpublish.keep'),
      }}
    >
      <QuietNote spacing="block">{t('universe.publish.unpublish.note')}</QuietNote>
    </PublicationConfirm>
  )
}
