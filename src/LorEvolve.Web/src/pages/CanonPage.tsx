import { useUniverseAccess } from '../universes/access'
import { useOutletContext } from 'react-router-dom'
import { t, useI18n } from '../i18n'
import { PageHeader } from '../components/PageHeader'
import { WipBadge } from '../components/WipBadge'
import type { WorkspaceContext } from './UniverseWorkspace'
import { useCanonConflicts } from '../canon/useCanonConflicts'
import { canonActions } from '../canon/canonActions'
import { CanonControls } from '../components/canon/CanonControls'
import { CanonResults } from '../components/canon/CanonResults'
import { Button } from '../components/Button'
import { Callout } from '../components/Callout'

/**
 * The review screen for one universe.
 *
 * It opens on what is open, because that is the only list with anything to do in it. The
 * rest of the lifecycle is reachable but not in the way: dismissals are the author's own
 * record, and resolutions are evaluation's.
 */
export default function CanonPage() {
  const { tx } = useI18n()
  const access = useUniverseAccess()
  const { universe } = useOutletContext<WorkspaceContext>()

  const canon = useCanonConflicts({ universe })
  const {
    status,
    setStatus,
    severity,
    setSeverity,
    setPage,
    state,
    message,
    isEvaluating,
    evaluation,
    busyId,
    reload,
  } = canon

  const result = state.kind === 'ready' ? state.value : null

  const { evaluate, transition } = canonActions({ ...canon, universe, result })

  return (
    <article className="integrity">
      <PageHeader
        title={
          <>
            {t('canon.page.title')}
            <WipBadge />
          </>
        }
        lede={t('canon.page.lede')}
        actions={
          // Evaluating writes the findings, so it is editing (ADR 0041); everyone reads what the last one found.
          access.editContent ? (
            <Button
              busy={isEvaluating}
              busyLabel={t('canon.page.evaluating')}
              onClick={() => void evaluate()}
              data-testid="evaluate-canon"
            >
              {t('canon.page.evaluate')}
            </Button>
          ) : undefined
        }
      />

      <Callout look="callout" as="p" className="integrity__law">
        {tx('canon.page.law', { high: <strong>{t('canon.page.lawHigh')}</strong> })}
      </Callout>

      <CanonControls
        status={status}
        setStatus={setStatus}
        severity={severity}
        setSeverity={setSeverity}
        setPage={setPage}
      />

      <CanonResults
        universe={universe}
        access={access}
        result={result}
        status={status}
        severity={severity}
        setPage={setPage}
        state={state}
        reload={reload}
        message={message}
        isEvaluating={isEvaluating}
        evaluation={evaluation}
        busyId={busyId}
        evaluate={evaluate}
        transition={transition}
      />
    </article>
  )
}
