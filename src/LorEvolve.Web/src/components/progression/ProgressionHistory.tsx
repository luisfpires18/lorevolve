import { useMemo, useState } from 'react'
import { History } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'
import { VersionActor } from '../VersionActor'
import { t, useI18n } from '../../i18n'
import { RevisionKind } from '../../lore/revisions'
import { useRevisionHistory } from '../../lore/useRevisionHistory'
import {
  getProgressionRevision,
  listProgressionRevisions,
  PROGRESSION_CHANGED,
  restoreProgressionRevision,
} from '../../progression/api'
import type { Progression } from '../../progression/types'
import { LoadingNote } from '../LoadingNote'
import { DateText } from '../DateText'
import { RevisionHistory } from '../RevisionHistory'

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
  const store = useMemo(
    () => ({
      list: (signal: AbortSignal) => listProgressionRevisions(universeId, entityId, signal),
      get: (revisionId: string) => getProgressionRevision(universeId, entityId, revisionId),
      restore: (revisionId: string, version: number) =>
        restoreProgressionRevision(universeId, entityId, revisionId, version),
      changedCode: PROGRESSION_CHANGED,
    }),
    [universeId, entityId],
  )
  const history = useRevisionHistory({
    store,
    // Read on opening only: a restore lands through onRestored, and the list is not read again.
    reloadKey: 0,
    currentVersion,
    onRestored,
    onStale,
    enabled: open,
    // No Canon gate answers a progression's save (ProgressionEndpoints): a refusal says the API's words.
    gated: true,
    holdWhileOpening: true,
    readFailed: t('progression.history.readFailed'),
    words: {
      openFailed: t('progression.history.versionReadFailed'),
      confirm: (revision) => ({
        title: t('progression.history.restore.title', { number: revision.number }),
        message: t('progression.history.restore.message'),
        confirmLabel: t('progression.history.restore.confirm'),
      }),
      changedElsewhere: t('progression.history.stale'),
      failed: t('progression.history.restoreFailed'),
    },
  })
  const reading = open ? <LoadingNote>{t('progression.history.reading')}</LoadingNote> : null
  // Until a read lands the reading note stays, beside the message of a read that failed.
  const loaded = history.status === 'ready' || history.revisions.length > 0

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
      <RevisionHistory
        history={history}
        reading={reading}
        failed={loaded ? undefined : reading}
        empty={<ol className="history__list" />}
        row={(revision, index, version) => (
          <li className="history__item" data-testid={`era-version-${revision.number}`}>
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
                  version.isOpen
                    ? 'progression.history.hideVersion'
                    : 'progression.history.viewVersion',
                  { number: revision.number },
                )}
                onClick={version.view}
              >
                {version.isOpen ? t('progression.history.hide') : t('progression.history.view')}
              </button>
              {index > 0 ? (
                <button
                  className="linkbutton"
                  type="button"
                  aria-label={t('progression.history.restoreVersion', {
                    number: revision.number,
                  })}
                  onClick={version.restore}
                  data-testid={`restore-era-version-${revision.number}`}
                >
                  {t('progression.history.restoreButton')}
                </button>
              ) : null}
            </div>
            {version.opened ? (
              <ul className="namelist" data-testid={`era-version-${revision.number}-eras`}>
                {version.opened.eras.length === 0 ? (
                  <li>{t('progression.history.noStages')}</li>
                ) : (
                  version.opened.eras.map((era) => <li key={era.id}>{era.name}</li>)
                )}
                {version.opened.forms.map((form) => (
                  <li key={form.id}>{t('progression.history.formItem', { name: form.name })}</li>
                ))}
                {version.opened.abilities.map((ability) => (
                  <li key={ability.id}>
                    {t('progression.history.abilityItem', { name: ability.name })}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        )}
      />
    </details>
  )
}
