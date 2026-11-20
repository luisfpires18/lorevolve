import { useEffect, useState } from 'react'
import { History } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'
import { VersionActor } from '../VersionActor'
import { t, useI18n } from '../../i18n'
import { ApiError } from '../../lib/api'
import { confirmAction } from '../../lib/confirm'
import { isChangedElsewhere } from '../../lib/editConflict'
import { RevisionKind } from '../../lore/revisions'
import {
  getProgressionRevision,
  listProgressionRevisions,
  PROGRESSION_CHANGED,
  restoreProgressionRevision,
} from '../../progression/api'
import type {
  Progression,
  ProgressionRevisionDetail,
  ProgressionRevisionSummary,
} from '../../progression/types'
import { LoadingNote } from '../LoadingNote'
import { DateText } from '../DateText'

/** The progression's own history: each saved version with when and by whom, readable in place and put back on request. */
export function ProgressionHistory({
  universeId,
  entityId,
  currentVersion,
  onRestored,
  onStale,
}: {
  universeId: string
  entityId: string
  currentVersion: number
  onRestored: (progression: Progression) => void
  onStale: () => void
}) {
  useI18n() // Re-renders on a language change; the words are read through the module's t.
  const [open, setOpen] = useState(false)
  const [revisions, setRevisions] = useState<ProgressionRevisionSummary[] | null>(null)
  const [opened, setOpened] = useState<ProgressionRevisionDetail | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    listProgressionRevisions(universeId, entityId, controller.signal)
      .then(setRevisions)
      .catch(() => {
        if (!controller.signal.aborted) setMessage(t('progression.history.readFailed'))
      })
    return () => controller.abort()
  }, [open, universeId, entityId])

  async function view(revision: ProgressionRevisionSummary) {
    if (opened?.id === revision.id) {
      setOpened(null)
      return
    }
    setMessage(null)
    try {
      setOpened(await getProgressionRevision(universeId, entityId, revision.id))
    } catch {
      setMessage(t('progression.history.versionReadFailed'))
    }
  }

  async function restore(revision: ProgressionRevisionSummary) {
    if (
      !(await confirmAction({
        title: t('progression.history.restore.title', { number: revision.number }),
        message: t('progression.history.restore.message'),
        confirmLabel: t('progression.history.restore.confirm'),
      }))
    ) {
      return
    }
    setMessage(null)
    try {
      onRestored(
        await restoreProgressionRevision(universeId, entityId, revision.id, currentVersion),
      )
    } catch (error: unknown) {
      if (isChangedElsewhere(error, PROGRESSION_CHANGED)) {
        setMessage(t('progression.history.stale'))
        onStale()
      } else {
        setMessage(
          error instanceof ApiError ? error.message : t('progression.history.restoreFailed'),
        )
      }
    }
  }

  return (
    <details
      className="erahistory"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      data-testid="era-history"
    >
      <summary className="erahistory__summary">
        <ActionIcon icon={History} />
        {t('progression.history.title')}
      </summary>
      {message ? (
        <p className="form__message" role="alert">
          {message}
        </p>
      ) : null}
      {revisions === null ? (
        open ? (
          <LoadingNote>{t('progression.history.reading')}</LoadingNote>
        ) : null
      ) : (
        <ol className="history__list">
          {revisions.map((revision, index) => (
            <li
              className="history__item"
              key={revision.id}
              data-testid={`era-version-${revision.number}`}
            >
              <p className="history__line">
                <strong>{t('progression.history.version', { number: revision.number })}</strong>{' '}
                {revision.kind === RevisionKind.Created
                  ? t('progression.history.kind.created')
                  : revision.kind === RevisionKind.Restored
                    ? t('progression.history.kind.restored')
                    : t('progression.history.kind.changed')}{' '}
                <DateText value={revision.createdAt} withTime />{' '}
                <VersionActor name={revision.actorName} />
              </p>
              <div className="history__actions">
                <button
                  className="linkbutton"
                  type="button"
                  aria-label={t(
                    opened?.id === revision.id
                      ? 'progression.history.hideVersion'
                      : 'progression.history.viewVersion',
                    { number: revision.number },
                  )}
                  onClick={() => void view(revision)}
                >
                  {opened?.id === revision.id
                    ? t('progression.history.hide')
                    : t('progression.history.view')}
                </button>
                {index > 0 ? (
                  <button
                    className="linkbutton"
                    type="button"
                    aria-label={t('progression.history.restoreVersion', {
                      number: revision.number,
                    })}
                    onClick={() => void restore(revision)}
                    data-testid={`restore-era-version-${revision.number}`}
                  >
                    {t('progression.history.restoreButton')}
                  </button>
                ) : null}
              </div>
              {opened?.id === revision.id ? (
                <ul className="namelist" data-testid={`era-version-${revision.number}-eras`}>
                  {opened.eras.length === 0 ? (
                    <li>{t('progression.history.noStages')}</li>
                  ) : (
                    opened.eras.map((era) => <li key={era.id}>{era.name}</li>)
                  )}
                  {opened.forms.map((form) => (
                    <li key={form.id}>{t('progression.history.formItem', { name: form.name })}</li>
                  ))}
                  {opened.abilities.map((ability) => (
                    <li key={ability.id}>
                      {t('progression.history.abilityItem', { name: ability.name })}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </details>
  )
}
