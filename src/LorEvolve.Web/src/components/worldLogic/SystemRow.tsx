import { useEffect, useId, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'
import { t, useI18n } from '../../i18n'
import { useUniverseAccess } from '../../universes/access'
import { getSystem } from '../../worldLogic/api'
import type { SystemDetail, SystemSummary } from '../../worldLogic/types'
import { Button } from '../Button'

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
  const [detail, setDetail] = useState<SystemDetail | null>(null)
  const [failed, setFailed] = useState(false)
  const panelId = useId()
  const access = useUniverseAccess()

  useEffect(() => {
    if (!open || detail) return

    const controller = new AbortController()

    getSystem(universeId, system.id, controller.signal)
      .then((read) => setDetail(read))
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true)
      })

    return () => {
      controller.abort()
    }
  }, [open, detail, universeId, system.id])

  return (
    <li className="rulerow" data-testid="world-logic-system-row" data-name={system.name}>
      <button
        className="rulerow__title rulerow__toggle"
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        data-testid="world-logic-system-toggle"
      >
        <ActionIcon icon={open ? ChevronDown : ChevronRight} />
        <bdi>{system.name}</bdi>
      </button>

      {system.excerpt ? (
        <p className="rulerow__excerpt" dir="auto">
          {system.excerpt}
          {system.isExcerptShortened ? '…' : null}
        </p>
      ) : null}

      <p className="rulerow__meta">
        <span className="rulerow__check" data-testid="world-logic-system-scope">
          {system.scope === 'Project'
            ? t('canon.worldLogic.scopes.project')
            : t('canon.worldLogic.scopes.universe')}
        </span>
        {tn('canon.worldLogic.systems.ruleCount', system.ruleCount, { count: system.ruleCount })}
      </p>

      {access.editContent ? (
        <Button
          tone="secondary"
          to={`/app/universes/${universeId}/world-logic/systems/${system.id}`}
          data-testid="world-logic-system-edit"
        >
          {t('canon.worldLogic.systems.edit')}
        </Button>
      ) : null}

      <div id={panelId} hidden={!open} data-testid="world-logic-system-rules">
        {failed ? (
          <p className="notice notice--error" role="alert">
            {t('canon.worldLogic.systems.readFailed')}
          </p>
        ) : null}

        {open && !detail && !failed ? (
          <p className="notice" role="status">
            {t('canon.worldLogic.systems.loading')}
          </p>
        ) : null}

        {detail && detail.rules.length > 0 ? (
          <ul className="rulelist">
            {detail.rules.map((rule) => (
              <li className="rulerow" key={rule.id} data-testid="world-logic-system-rule">
                <p className="rulerow__title">
                  <bdi>{rule.title}</bdi>
                </p>
                <p className="rulerow__meta">
                  {rule.hasCondition ? (
                    <span className="rulerow__check">{t('canon.worldLogic.hasCondition')}</span>
                  ) : (
                    <span className="rulerow__check">{t('canon.worldLogic.wordsOnly')}</span>
                  )}
                  {tn('canon.worldLogic.systems.sharedWith', rule.systemCount, {
                    count: rule.systemCount,
                  })}
                </p>
              </li>
            ))}
          </ul>
        ) : null}

        {detail && detail.rules.length === 0 ? (
          <p className="notice" data-testid="world-logic-system-no-rules">
            {t('canon.worldLogic.systems.noRules')}
          </p>
        ) : null}
      </div>
    </li>
  )
}
