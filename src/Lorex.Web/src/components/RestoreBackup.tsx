import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import {
  discardBackup,
  MAX_BACKUP_BYTES,
  refusalFrom,
  restoreBackup,
  RESTORE_EXPIRED,
  validateBackup,
  type BackupPreviewCounts,
  type BackupRefusal,
  type BackupValidation,
} from '../backups/api'
import { ApiError } from '../lib/api'
import { formatDateTime } from '../lib/dates'
import type { UniverseDetail } from '../universes/types'
import { Field } from './Field'

type Stage =
  | { kind: 'choose' }
  | { kind: 'checking'; percent: number | null }
  | { kind: 'refused'; refusal: BackupRefusal }
  | { kind: 'ready'; validation: BackupValidation }
  | { kind: 'restoring'; validation: BackupValidation }

interface RestoreBackupProps {
  onCancel: () => void
  onRestored: (universe: UniverseDetail) => void
}

/**
 * Restore a backup as a new universe: choose the file, have it checked, see what it holds, name the
 * universe, restore. One panel, in place of a wizard. See ADR 0032.
 *
 * Nothing here can touch a universe that exists - there is no universe to choose, no overwrite and
 * no merge. The file goes up once; what comes back is the server's own count of what it found and a
 * token, and the restore sends only the token and the name.
 *
 * Focus follows the stage: to the preview's heading once the file is checked, to the refusal's
 * heading when it is not, to the name when the name is what is wrong. Every stage change is also
 * spoken - the progress and the busy state as status, a refusal or a failure as an alert - and no
 * state is told by colour alone.
 */
export function RestoreBackup({ onCancel, onRestored }: RestoreBackupProps) {
  const fileId = useId()
  const hintId = useId()
  const [file, setFile] = useState<File | null>(null)
  const [stage, setStage] = useState<Stage>({ kind: 'choose' })
  const [chooseError, setChooseError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string | undefined>(undefined)
  const [failure, setFailure] = useState<string | null>(null)

  const fileInput = useRef<HTMLInputElement>(null)
  const readyHeading = useRef<HTMLHeadingElement>(null)
  const refusedHeading = useRef<HTMLHeadingElement>(null)
  const upload = useRef<AbortController | null>(null)

  // The token of a checked file nobody has restored yet, so leaving lets the server drop it.
  const waiting = useRef<string | null>(null)

  useEffect(
    () => () => {
      upload.current?.abort()
      if (waiting.current) void discardBackup(waiting.current)
    },
    [],
  )

  useEffect(() => {
    if (stage.kind === 'ready') readyHeading.current?.focus()
    if (stage.kind === 'refused') refusedHeading.current?.focus()
  }, [stage.kind])

  function forgetWaiting() {
    if (waiting.current) {
      void discardBackup(waiting.current)
      waiting.current = null
    }
  }

  async function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setChooseError(null)

    if (!file) {
      setChooseError('Choose a backup file first.')
      fileInput.current?.focus()
      return
    }

    if (file.size > MAX_BACKUP_BYTES) {
      setChooseError(
        `That file is larger than Lorex restores (${MAX_BACKUP_BYTES / (1024 * 1024)} MB).`,
      )
      fileInput.current?.focus()
      return
    }

    forgetWaiting()
    const controller = new AbortController()
    upload.current = controller
    setStage({ kind: 'checking', percent: 0 })

    try {
      const validation = await validateBackup(file, {
        signal: controller.signal,
        onProgress: ({ ratio }) =>
          setStage({
            kind: 'checking',
            percent: ratio === null || ratio >= 1 ? null : Math.round(ratio * 100),
          }),
      })

      waiting.current = validation.token
      setName(validation.preview.universeName)
      setNameError(
        validation.preview.nameAvailable
          ? undefined
          : 'You already have a universe with that name. Choose another name for the restored one.',
      )
      setFailure(null)
      setStage({ kind: 'ready', validation })
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setStage({ kind: 'choose' })
        return
      }

      const refusal = refusalFrom(error)
      setStage({
        kind: 'refused',
        refusal: refusal ?? {
          code: error instanceof ApiError ? error.code : null,
          detail:
            error instanceof ApiError && error.status === 413
              ? 'This backup is larger than Lorex restores.'
              : error instanceof ApiError && error.status !== 0
                ? error.message
                : 'The backup could not be sent. Check your connection and try again.',
          issues: [],
          moreIssues: 0,
        },
      })
    } finally {
      upload.current = null
    }
  }

  function chooseAnother() {
    forgetWaiting()
    setFile(null)
    setFailure(null)
    setNameError(undefined)
    setStage({ kind: 'choose' })
    requestAnimationFrame(() => fileInput.current?.focus())
  }

  async function restore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (stage.kind !== 'ready') return

    const validation = stage.validation
    setFailure(null)
    setNameError(undefined)
    setStage({ kind: 'restoring', validation })

    try {
      const universe = await restoreBackup(validation.token, name.trim())
      waiting.current = null
      onRestored(universe)
    } catch (error: unknown) {
      if (error instanceof ApiError && error.code === RESTORE_EXPIRED) {
        waiting.current = null
        setFile(null)
        setStage({ kind: 'choose' })
        setChooseError(error.message)
        requestAnimationFrame(() => fileInput.current?.focus())
        return
      }

      const refusal = refusalFrom(error)
      if (refusal) {
        waiting.current = null
        setStage({ kind: 'refused', refusal })
        return
      }

      setStage({ kind: 'ready', validation })

      if (error instanceof ApiError && error.fieldErrors.name) {
        setNameError(error.fieldErrors.name)
        requestAnimationFrame(() => document.getElementById('restore-name')?.focus())
      } else {
        setFailure(
          error instanceof ApiError && error.status !== 0
            ? error.message
            : 'The backup could not be restored. Check your connection and try again.',
        )
      }
    }
  }

  const busy = stage.kind === 'checking' || stage.kind === 'restoring'

  return (
    <section className="composer restore" aria-label="Restore a backup" data-testid="restore-panel">
      <h2 className="composer__title">Restore a backup</h2>
      <p className="restore__lead">
        A backup becomes a new universe of its own. Nothing you already have is changed, replaced or
        merged.
      </p>

      {stage.kind === 'choose' || stage.kind === 'checking' ? (
        <form className="form" onSubmit={check} noValidate>
          <div className="field">
            <label className="field__label" htmlFor={fileId}>
              Backup file
            </label>
            <p className="field__hint" id={hintId}>
              The .zip file Lorex downloaded from a universe&rsquo;s Settings.
            </p>
            <input
              ref={fileInput}
              id={fileId}
              className="restore__file"
              type="file"
              accept=".zip,.json,application/zip,application/json"
              aria-describedby={chooseError ? `${hintId} ${fileId}-error` : hintId}
              aria-invalid={chooseError ? true : undefined}
              disabled={busy}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null)
                setChooseError(null)
              }}
              data-testid="restore-file"
            />
            {chooseError ? (
              <p className="field__error" id={`${fileId}-error`} role="alert">
                {chooseError}
              </p>
            ) : null}
          </div>

          {stage.kind === 'checking' ? (
            <div className="restore__progress" data-testid="restore-checking">
              <div
                className="progressbar"
                role="progressbar"
                aria-label={stage.percent === null ? 'Checking the backup' : 'Uploading the backup'}
                aria-valuemin={stage.percent === null ? undefined : 0}
                aria-valuemax={stage.percent === null ? undefined : 100}
                aria-valuenow={stage.percent ?? undefined}
                aria-valuetext={stage.percent === null ? undefined : `${stage.percent}%`}
                data-state={stage.percent === null ? 'working' : 'sending'}
              >
                <span
                  className="progressbar__fill"
                  style={stage.percent === null ? undefined : { width: `${stage.percent}%` }}
                />
              </div>
              <p className="restore__stage" role="status">
                {stage.percent === null
                  ? 'Checking the backup…'
                  : `Uploading the backup… ${stage.percent}%`}
              </p>
            </div>
          ) : null}

          <div className="form__actions">
            <button className="button" type="submit" disabled={busy} data-testid="restore-check">
              {stage.kind === 'checking' ? 'Checking' : 'Check backup'}
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => (stage.kind === 'checking' ? upload.current?.abort() : onCancel())}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {stage.kind === 'refused' ? (
        <div className="restore__refused" role="alert" data-testid="restore-refused">
          <h3 className="restore__heading" ref={refusedHeading} tabIndex={-1}>
            This backup cannot be restored
          </h3>
          <p className="form__message">{stage.refusal.detail}</p>
          {stage.refusal.issues.length > 1 ? (
            <ul className="restore__issues" data-testid="restore-issues">
              {stage.refusal.issues.map((issue, index) => (
                <li key={`${issue.code}-${index}`} dir="auto">
                  {issue.message}
                </li>
              ))}
            </ul>
          ) : null}
          {stage.refusal.moreIssues > 0 ? (
            <p className="restore__more">
              and {stage.refusal.moreIssues} more{' '}
              {stage.refusal.moreIssues === 1 ? 'problem' : 'problems'}.
            </p>
          ) : null}
          <p className="restore__note">No universe was created.</p>
          <div className="form__actions">
            <button
              className="button button--secondary"
              type="button"
              onClick={chooseAnother}
              data-testid="restore-choose-another"
            >
              Choose another file
            </button>
            <button className="button button--secondary" type="button" onClick={onCancel}>
              Close
            </button>
          </div>
        </div>
      ) : null}

      {stage.kind === 'ready' || stage.kind === 'restoring' ? (
        <form
          className="form"
          onSubmit={restore}
          noValidate
          aria-busy={stage.kind === 'restoring' || undefined}
          data-testid="restore-preview"
        >
          <div className="restore__summary">
            <h3 className="restore__heading" ref={readyHeading} tabIndex={-1}>
              Ready to restore
            </h3>
            <dl className="restore__facts">
              <div className="restore__fact">
                <dt>Universe</dt>
                <dd data-testid="restore-universe-name">
                  <bdi>{stage.validation.preview.universeName}</bdi>
                </dd>
              </div>
              <div className="restore__fact">
                <dt>Backed up</dt>
                <dd>{formatDateTime(stage.validation.preview.generatedAt)}</dd>
              </div>
              <div className="restore__fact">
                <dt>Backup format</dt>
                <dd>Version {stage.validation.preview.formatVersion}</dd>
              </div>
              {summaryRows(stage.validation.preview.counts).map(([label, value]) => (
                <div className="restore__fact" key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            {stage.validation.preview.isArchived ? (
              <p className="restore__note">
                This universe was archived when it was backed up, and is restored archived.
              </p>
            ) : null}
          </div>

          <Field
            label="Name of the new universe"
            name="restore-name"
            required
            maxLength={120}
            dir="auto"
            value={name}
            error={nameError}
            disabled={stage.kind === 'restoring'}
            onChange={(event) => {
              setName(event.target.value)
              setNameError(undefined)
            }}
          />

          {failure ? (
            <p className="form__message" role="alert" data-testid="restore-failure">
              {failure}
            </p>
          ) : null}

          {stage.kind === 'restoring' ? (
            <p className="restore__stage" role="status" data-testid="restore-restoring">
              Restoring the universe… A large backup can take a little while.
            </p>
          ) : null}

          <div className="form__actions">
            <button
              className="button"
              type="submit"
              disabled={stage.kind === 'restoring'}
              data-testid="restore-submit"
            >
              {stage.kind === 'restoring' ? 'Restoring' : 'Restore as a new universe'}
            </button>
            <button
              className="button button--secondary"
              type="button"
              disabled={stage.kind === 'restoring'}
              onClick={chooseAnother}
            >
              Choose another file
            </button>
          </div>
        </form>
      ) : null}
    </section>
  )
}

function plural(count: number, one: string, many: string) {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`
}

/** What the backup holds, a line per part of a world, leaving out what it has none of. */
function summaryRows(counts: BackupPreviewCounts): [string, string][] {
  const rows: [string, string][] = []

  const lore = [
    plural(counts.entries, 'entry', 'entries'),
    plural(counts.entityTypes, 'type', 'types'),
    counts.relationships > 0 ? plural(counts.relationships, 'relationship', 'relationships') : null,
    counts.timelineEntries > 0 ? plural(counts.timelineEntries, 'moment', 'moments') : null,
    counts.eras > 0 ? plural(counts.eras, 'date period', 'date periods') : null,
    counts.articles > 0 ? plural(counts.articles, 'article', 'articles') : null,
  ]
  rows.push(['Lore', lore.filter(Boolean).join(', ')])

  if (counts.images > 0) {
    rows.push(['Pictures', plural(counts.images, 'picture', 'pictures')])
  }

  if (counts.stories + counts.scenes > 0) {
    rows.push([
      'Stories',
      [
        plural(counts.stories, 'story', 'stories'),
        counts.chapters > 0 ? plural(counts.chapters, 'chapter', 'chapters') : null,
        plural(counts.scenes, 'scene', 'scenes'),
        counts.plotArcs > 0 ? plural(counts.plotArcs, 'arc', 'arcs') : null,
        counts.plotBeats > 0 ? plural(counts.plotBeats, 'beat', 'beats') : null,
        counts.manuscripts > 0
          ? plural(counts.manuscripts, 'scene with prose', 'scenes with prose')
          : null,
      ]
        .filter(Boolean)
        .join(', '),
    ])
  }

  if (counts.ideas + counts.ideasDeleted > 0) {
    rows.push([
      'Ideas',
      [
        plural(counts.ideas, 'idea', 'ideas'),
        counts.ideasDeleted > 0 ? `${counts.ideasDeleted.toLocaleString()} recently deleted` : null,
      ]
        .filter(Boolean)
        .join(', '),
    ])
  }

  if ((counts.ideaBoards ?? 0) > 0) {
    rows.push(['Idea boards', plural(counts.ideaBoards ?? 0, 'board', 'boards')])
  }

  if (counts.worldRules > 0) {
    rows.push(['World Rules', plural(counts.worldRules, 'world rule', 'world rules')])
  }

  if ((counts.maps ?? 0) > 0) {
    rows.push([
      'Maps',
      [plural(counts.maps ?? 0, 'map', 'maps'), plural(counts.mapPins ?? 0, 'pin', 'pins')].join(
        ', ',
      ),
    ])
  }

  const history = counts.entryVersions + counts.articleVersions + counts.manuscriptVersions
  if (history > 0) {
    rows.push(['Saved versions', plural(history, 'saved version', 'saved versions')])
  }

  const trash = counts.entriesInTrash + counts.storyItemsInTrash + counts.worldRulesInTrash
  if (trash > 0) {
    rows.push(['In the Trash', plural(trash, 'item', 'items')])
  }

  return rows
}
