import { Plus } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'
import { useI18n } from '../../i18n'
import { useUniverseAccess } from '../../universes/access'
import type { useProgressionState } from '../../progression/useProgressionState'

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
      <h2 className="sectiontitle" id="progression-heading">
        {t('progression.view.title')}
      </h2>
      {access.editContent ? (
        <button
          className="button button--secondary button--sm"
          type="button"
          onClick={() => setEditing('new')}
          data-testid="add-era"
        >
          <ActionIcon icon={Plus} />
          {t('progression.view.addStage')}
        </button>
      ) : null}
    </div>
  )
}
