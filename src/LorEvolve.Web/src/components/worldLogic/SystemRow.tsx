import { useId, useState } from 'react'
import { t, useI18n } from '../../i18n'
import { useUniverseAccess } from '../../universes/access'
import { getSystem } from '../../worldLogic/api'
import type { SystemSummary } from '../../worldLogic/types'
import { useReadOnOpen } from '../../lib/useReadOnOpen'
import { LinkRow } from '../LinkRow'
import { Button } from '../Button'
import { Callout } from '../Callout'
import { DisclosurePanel } from '../DisclosurePanel'

/**
 * One System, and the rule definitions it references once the author opens it.
 *
 * Its rules are read when it is opened rather than with the list, because a universe's Systems are a list of names
 * and its rules are not: reading every System's rules to draw a list of names would be most of the page's work for
 * none of its content.
 */
export function SystemRow({ universeId, system }: { universeId: string; system: SystemSummary }) {
  const { tn } = useI18n()
  const [open, setOpen] = useState(false)
  const { detail, failed } = useReadOnOpen(open, (signal) =>
    getSystem(universeId, system.id, signal),
  )
  const panelId = useId()
  const access = useUniverseAccess()

  return (
    <LinkRow
      look="rule"
      testId="world-logic-system-row"
      data-name={system.name}
      title={system.name}
      titleTestId="world-logic-system-toggle"
      expanded={open}
      controls={panelId}
      onToggle={() => setOpen((current) => !current)}
      excerpt={system.excerpt}
      excerptShortened={system.isExcerptShortened}
      meta={
        <>
          <span className="rulerow__check" data-testid="world-logic-system-scope">
            {system.scope === 'Project'
              ? t('canon.worldLogic.scopes.project')
              : t('canon.worldLogic.scopes.universe')}
          </span>
          {tn('canon.worldLogic.systems.ruleCount', system.ruleCount, { count: system.ruleCount })}
        </>
      }
    >
      {access.editContent ? (
        <Button
          tone="secondary"
          to={`/app/universes/${universeId}/world-logic/systems/${system.id}`}
          data-testid="world-logic-system-edit"
        >
          {t('canon.worldLogic.systems.edit')}
        </Button>
      ) : null}

      <DisclosurePanel
        id={panelId}
        open={open}
        loaded={!!detail}
        failed={failed}
        failedText={t('canon.worldLogic.systems.readFailed')}
        loadingText={t('canon.worldLogic.systems.loading')}
        testId="world-logic-system-rules"
      >
        {detail && detail.rules.length > 0 ? (
          <ul className="rulelist">
            {detail.rules.map((rule) => (
              <LinkRow
                look="rule"
                key={rule.id}
                testId="world-logic-system-rule"
                title={rule.title}
                meta={
                  <>
                    {rule.hasCondition ? (
                      <span className="rulerow__check">{t('canon.worldLogic.hasCondition')}</span>
                    ) : (
                      <span className="rulerow__check">{t('canon.worldLogic.wordsOnly')}</span>
                    )}
                    {tn('canon.worldLogic.systems.sharedWith', rule.systemCount, {
                      count: rule.systemCount,
                    })}
                  </>
                }
              />
            ))}
          </ul>
        ) : null}

        {detail && detail.rules.length === 0 ? (
          <Callout look="notice" as="p" testId="world-logic-system-no-rules">
            {t('canon.worldLogic.systems.noRules')}
          </Callout>
        ) : null}
      </DisclosurePanel>
    </LinkRow>
  )
}
