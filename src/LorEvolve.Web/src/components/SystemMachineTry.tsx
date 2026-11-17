import { useEffect, useState } from 'react'
import { Check, CircleHelp, X } from 'lucide-react'
import { EntityPicker, type EntityChoice } from './EntityPicker'
import { t, useI18n } from '../i18n'
import { evaluateSystemMachine } from '../worldLogic/api'
import { markText, type GuardMarkValue } from '../worldLogic/markText'
import type { SystemMachineTryResult } from '../worldLogic/types'

const m = 'canon.worldLogic.systems.machine'

const ICONS = { holds: Check, fails: X, unknown: CircleHelp }

/**
 * One transition's mark after an entry is tried, on its canvas label and on its row. The word says it and the icon
 * differs by mark, so neither colour nor the icon carries it alone.
 */
export function GuardMark({ mark }: { mark: GuardMarkValue }) {
  const Icon = ICONS[mark.kind]
  return (
    <span className="machinecanvas__mark" data-mark={mark.kind} data-testid="machine-mark">
      <Icon aria-hidden="true" focusable="false" strokeWidth={2} />
      {markText(mark)}
    </span>
  )
}

/**
 * "Try an entry" (#360) on the Machine tab: an entry is picked, both machine checks run for it over the saved machine,
 * and the result goes to the panel, which marks each transition. Nothing is written. A save asks again (`refresh`),
 * so the marks follow the machine as stored.
 */
export function SystemMachineTry({
  universeId,
  systemId,
  refresh,
  result,
  onResult,
}: {
  universeId: string
  systemId: string
  refresh: number
  result: SystemMachineTryResult | null
  onResult: (result: SystemMachineTryResult | null) => void
}) {
  useI18n() // re-renders when the language changes
  const [entry, setEntry] = useState<EntityChoice | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!entry) return
    const controller = new AbortController()
    evaluateSystemMachine(universeId, systemId, entry.id, controller.signal)
      .then((read) => {
        setFailed(false)
        onResult(read)
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setFailed(true)
        onResult(null)
      })
    return () => controller.abort()
  }, [universeId, systemId, entry, refresh, onResult])

  /** A result belongs to one entry: it goes as soon as the entry changes. */
  function choose(next: EntityChoice | null) {
    setEntry(next)
    setFailed(false)
    onResult(null)
  }

  return (
    <section className="machinepanel__group" data-testid="machine-try">
      <h2 className="sectionrule">{t(`${m}.try.title`)}</h2>
      <EntityPicker
        label={t(`${m}.try.entry`)}
        universeId={universeId}
        value={entry}
        onChange={choose}
      />
      {failed ? (
        <p className="form__message" role="alert" data-testid="machine-try-failed">
          {t(`${m}.try.failed`)}
        </p>
      ) : null}
      <p className="field__hint" role="status" data-testid="machine-try-result">
        {entry && result ? (
          result.value === null ? (
            t(`${m}.try.outside`)
          ) : (
            <bdi>{t(`${m}.try.value`, { value: result.value })}</bdi>
          )
        ) : null}
      </p>
    </section>
  )
}
