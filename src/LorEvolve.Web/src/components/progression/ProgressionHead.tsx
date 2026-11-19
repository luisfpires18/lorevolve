import { useI18n } from '../../i18n'
import { useUniverseAccess } from '../../universes/access'
import type { useProgressionState } from '../../progression/useProgressionState'
import { NewButton } from '../NewButton'

/** The progression's heading, with Add era for whoever edits content. */
export function ProgressionHead({
  access,
  setEditing,
}: {
  access: ReturnType<typeof useUniverseAccess>
  setEditing: ReturnType<typeof useProgressionState>['setEditing']
}) {
  const { t } = useI18n()
  return (
    <div className="progression__head">
      <h2 className="progression__title" id="progression-heading">
        {t('progression.view.title')}
      </h2>
      {access.editContent ? (
        <NewButton
          tone="secondary"
          size="sm"
          onClick={() => setEditing('new')}
          data-testid="add-era"
        >
          {t('progression.view.addStage')}
        </NewButton>
      ) : null}
    </div>
  )
}
