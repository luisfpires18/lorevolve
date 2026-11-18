import { t } from '../i18n'
import type { UnlockMilestone } from './types'

export function unlockParts(unlock: UnlockMilestone) {
  return [
    unlock.era ? t('progression.unlock.era', { name: unlock.era.name }) : null,
    unlock.scene
      ? t(unlock.scene.isTrashed ? 'progression.unlock.sceneTrashed' : 'progression.unlock.scene', {
          title: unlock.scene.title,
        })
      : null,
    unlock.moment
      ? t(
          unlock.moment.isTrashed
            ? 'progression.unlock.momentTrashed'
            : 'progression.unlock.moment',
          { title: unlock.moment.title },
        )
      : null,
  ].filter((part): part is string => part !== null)
}
