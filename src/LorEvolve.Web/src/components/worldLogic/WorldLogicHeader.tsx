import { PageHeader } from '../PageHeader'
import { t } from '../../i18n'
import type { useUniverseAccess } from '../../universes/access'
import { NewButton } from '../NewButton'

/** The World Logic page's header, with New System on the Systems tab and New rule on the others. */
export function WorldLogicHeader({
  headingId,
  access,
  tab,
  base,
}: {
  headingId: string
  access: ReturnType<typeof useUniverseAccess>
  tab: string
  base: string
}) {
  return (
    <PageHeader
      title={t('canon.worldLogic.title')}
      titleId={headingId}
      lede={t('canon.worldLogic.lede')}
      actions={
        access.editContent ? (
          tab === 'systems' ? (
            <NewButton to={`${base}/world-logic/systems/new`} data-testid="world-logic-new-system">
              {t('canon.worldLogic.systems.newSystem')}
            </NewButton>
          ) : (
            <NewButton to={`${base}/world-rules/new`} data-testid="world-logic-new-rule">
              {t('canon.rules.newRule')}
            </NewButton>
          )
        ) : undefined
      }
    />
  )
}
