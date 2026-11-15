import { useCallback, useEffect, useState } from 'react'
import { useUniverseAccess } from '../universes/access'
import { useOutletContext } from 'react-router-dom'
import {
  dismissCanonConflict,
  evaluateCanonIntegrity,
  listCanonConflicts,
  reopenCanonConflict,
} from '../canon/api'
import {
  CanonConflictStatus,
  CONFLICT_STATUS_LABELS,
  SEVERITY_HINTS,
  SEVERITY_LABELS,
  SEVERITY_ORDER,
} from '../canon/types'
import type {
  CanonConflictPage,
  CanonConflictStatusValue,
  CanonEvaluation,
  CanonSeverityValue,
} from '../canon/types'
import { ConflictEntry } from '../components/ConflictEntry'
import { ApiError } from '../lib/api'
import { t, useI18n } from '../i18n'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { WipBadge } from '../components/WipBadge'
import type { WorkspaceContext } from './UniverseWorkspace'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; page: CanonConflictPage }
  | { kind: 'error'; message: string }

/**
 * The status filters, in the order an author works through them. `null` is deliberately
 * not offered as "Any": the three states mean different things and mixing them puts a
 * closed finding next to a live one with nothing but a chip to tell them apart.
 */
const STATUS_TABS: CanonConflictStatusValue[] = [
  CanonConflictStatus.Pending,
  CanonConflictStatus.Dismissed,
  CanonConflictStatus.Resolved,
]

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

  const [status, setStatus] = useState<CanonConflictStatusValue>(CanonConflictStatus.Pending)
  const [severity, setSeverity] = useState<CanonSeverityValue | null>(null)
  const [page, setPage] = useState(1)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [reloads, setReloads] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [evaluation, setEvaluation] = useState<CanonEvaluation | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    listCanonConflicts(universe.id, { severity, status, page }, controller.signal)
      .then((result) => setState({ kind: 'ready', page: result }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : t('canon.page.readFailed'),
        })
      })

    return () => {
      controller.abort()
    }
  }, [universe.id, severity, status, page, reloads])

  const reload = useCallback(() => setReloads((count) => count + 1), [])

  const result = state.kind === 'ready' ? state.page : null

  async function evaluate() {
    setMessage(null)
    setIsEvaluating(true)
    try {
      setEvaluation(await evaluateCanonIntegrity(universe.id))
      setPage(1)
      reload()
    } catch (error: unknown) {
      setMessage(error instanceof ApiError ? error.message : t('canon.page.evaluateFailed'))
    } finally {
      setIsEvaluating(false)
    }
  }

  /**
   * A transition answers with the conflict as it now stands, but the list it belongs to is
   * filtered by status, so the row usually has to leave. Reloading is both simpler and
   * more honest than patching it in place under a filter it no longer matches.
   */
  async function transition(conflictId: string, action: 'dismiss' | 'reopen') {
    setMessage(null)
    setBusyId(conflictId)
    try {
      await (action === 'dismiss'
        ? dismissCanonConflict(universe.id, conflictId)
        : reopenCanonConflict(universe.id, conflictId))

      if (result && result.items.length === 1 && page > 1) {
        setPage(page - 1)
      } else {
        reload()
      }
    } catch (error: unknown) {
      setMessage(error instanceof ApiError ? error.message : t('canon.page.changeFailed'))
    } finally {
      setBusyId(null)
    }
  }

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
            <button
              className="button"
              type="button"
              onClick={() => void evaluate()}
              disabled={isEvaluating}
              aria-busy={isEvaluating}
              data-testid="evaluate-canon"
            >
              {isEvaluating ? t('canon.page.evaluating') : t('canon.page.evaluate')}
            </button>
          ) : undefined
        }
      />

      <p className="callout integrity__law">
        {tx('canon.page.law', { high: <strong>{t('canon.page.lawHigh')}</strong> })}
      </p>

      <div className="controls">
        <div className="controls__filters">
          <div className="segmented" role="group" aria-label={t('canon.page.statusGroup')}>
            {STATUS_TABS.map((option) => (
              <button
                key={option}
                type="button"
                className="segmented__option"
                aria-pressed={status === option}
                onClick={() => {
                  setStatus(option)
                  setPage(1)
                }}
                data-testid={`canon-status-${option}`}
              >
                {CONFLICT_STATUS_LABELS[option]}
              </button>
            ))}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="canon-severity">
              {t('canon.page.severity')}
            </label>
            <select
              id="canon-severity"
              className="field__input field__input--select"
              value={severity ?? ''}
              onChange={(event) => {
                setSeverity(
                  event.target.value === ''
                    ? null
                    : (Number(event.target.value) as CanonSeverityValue),
                )
                setPage(1)
              }}
              data-testid="canon-severity"
            >
              <option value="">{t('canon.page.anySeverity')}</option>
              {SEVERITY_ORDER.map((option) => (
                <option key={option} value={option}>
                  {SEVERITY_LABELS[option]}
                </option>
              ))}
            </select>
            {severity !== null ? <p className="field__hint">{SEVERITY_HINTS[severity]}</p> : null}
          </div>
        </div>
      </div>

      {evaluation ? (
        <p className="integrity__run" role="status" data-testid="canon-run">
          {t('canon.page.run', {
            detected: evaluation.detected,
            created: evaluation.created,
            reopened: evaluation.reopened,
            resolved: evaluation.resolved,
          })}
        </p>
      ) : null}

      {message ? (
        <p className="form__message" role="alert" data-testid="canon-error">
          {message}
        </p>
      ) : null}

      {state.kind === 'loading' ? (
        <p className="notice" role="status">
          {t('canon.page.loading')}
        </p>
      ) : null}

      {state.kind === 'error' ? (
        <div className="notice notice--error" role="alert">
          <p>{state.message}</p>
          <button className="button button--secondary" type="button" onClick={reload}>
            {t('canon.page.retry')}
          </button>
        </div>
      ) : null}

      {result && result.items.length > 0 ? (
        <h2 className="visually-hidden">
          {t('canon.page.findingsHeading', { status: CONFLICT_STATUS_LABELS[status] })}
        </h2>
      ) : null}

      {result && result.items.length > 0 ? (
        <ul className="integrity__ledger" data-testid="canon-ledger">
          {result.items.map((conflict) => (
            <ConflictEntry
              key={conflict.id}
              universeId={universe.id}
              conflict={conflict}
              isBusy={busyId === conflict.id}
              onDismiss={() => void transition(conflict.id, 'dismiss')}
              onReopen={() => void transition(conflict.id, 'reopen')}
            />
          ))}
        </ul>
      ) : null}

      {result && result.items.length === 0 ? (
        <EmptyState
          testId="canon-empty"
          title={emptyLine(status, severity)}
          hint={severity !== null ? t('canon.page.otherSeverity') : hint(status)}
          action={
            access.editContent && severity === null && status === CanonConflictStatus.Pending ? (
              <button
                className="button button--secondary"
                type="button"
                onClick={() => void evaluate()}
                disabled={isEvaluating}
                data-testid="empty-evaluate-canon"
              >
                {isEvaluating ? t('canon.page.emptyEvaluating') : t('canon.page.emptyEvaluate')}
              </button>
            ) : undefined
          }
        />
      ) : null}

      {result && result.totalPages > 1 ? (
        <nav className="pager" aria-label={t('canon.page.pagination')}>
          <button
            className="button button--secondary"
            type="button"
            disabled={result.page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            {t('canon.page.previous')}
          </button>
          <span className="pager__position">
            {t('canon.page.position', { page: result.page, totalPages: result.totalPages })}
          </span>
          <button
            className="button button--secondary"
            type="button"
            disabled={result.page >= result.totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            {t('canon.page.next')}
          </button>
        </nav>
      ) : null}
    </article>
  )
}

function emptyLine(status: CanonConflictStatusValue, severity: CanonSeverityValue | null) {
  if (severity !== null) {
    return t('canon.page.emptyAtSeverity', {
      status: CONFLICT_STATUS_LABELS[status].toLowerCase(),
      severity: SEVERITY_LABELS[severity],
    })
  }

  if (status === CanonConflictStatus.Dismissed) return t('canon.page.emptyDismissed')
  if (status === CanonConflictStatus.Resolved) return t('canon.page.emptyResolved')
  return t('canon.page.emptyPending')
}

function hint(status: CanonConflictStatusValue) {
  if (status === CanonConflictStatus.Dismissed) {
    return t('canon.page.hintDismissed')
  }

  if (status === CanonConflictStatus.Resolved) {
    return t('canon.page.hintResolved')
  }

  return t('canon.page.hintPending')
}
