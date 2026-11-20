import { Field } from '../Field'
import { MomentPick } from '../MomentPick'
import { ScenePicks } from '../ScenePicks'
import { useI18n } from '../../i18n'
import type { Progression } from '../../progression/types'
import type { ItemDraft, Kind } from '../../progression/itemDraft'

/** When a form or ability was first unlocked: an era of the entry, a scene and a moment, each optional. */
export function ItemUnlockField({
  universeId,
  kind,
  base,
  draft,
  edit,
  errorOf,
}: {
  universeId: string
  kind: Kind
  base: Progression
  draft: ItemDraft
  edit: (change: Partial<ItemDraft>) => void
  errorOf: (part: string) => string | undefined
}) {
  const { t } = useI18n()
  return (
    <Field
      label={t('progression.item.unlock.title')}
      group="fieldset"
      className="itemunlock"
      data-testid={`${kind}-unlock`}
      hint={t('progression.item.unlock.hint')}
    >
      <Field
        as="select"
        label={t('progression.item.unlock.stage')}
        id="item-unlock-era"
        error={errorOf('unlockEraId')}
        value={draft.unlockEraId}
        onChange={(event) => edit({ unlockEraId: event.target.value })}
        data-testid={`${kind}-unlock-era`}
      >
        <option value="">
          {base.eras.length === 0
            ? t('progression.item.unlock.noStages')
            : t('progression.item.unlock.notSaid')}
        </option>
        {base.eras.map((era) => (
          <option key={era.id} value={era.id}>
            {era.name}
          </option>
        ))}
      </Field>

      <ScenePicks
        universeId={universeId}
        label={t('progression.item.unlock.scene')}
        value={draft.unlockScene}
        onChange={(unlockScene) => edit({ unlockScene })}
        single
        error={errorOf('unlockSceneId')}
        testId={`${kind}-unlock-scene`}
      />

      <MomentPick
        universeId={universeId}
        label={t('progression.item.unlock.moment')}
        value={draft.unlockMoment}
        onChange={(unlockMoment) => edit({ unlockMoment })}
        error={errorOf('unlockMomentId')}
        testId={`${kind}-unlock-moment`}
      />
    </Field>
  )
}
