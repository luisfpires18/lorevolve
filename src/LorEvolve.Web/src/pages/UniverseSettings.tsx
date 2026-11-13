import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { useI18n } from '../i18n'
import { CollaboratorsPanel } from '../components/CollaboratorsPanel'
import { UniverseForm } from '../components/UniverseForm'
import { downloadReadableExport, downloadUniverseBackup } from '../export/api'
import { discardUniverseDrafts } from '../lib/localDrafts'
import { getPublication } from '../publishing/api'
import { Visibility } from '../publishing/types'
import { deleteUniverse, setUniverseArchived, updateUniverse } from '../universes/api'
import { PageHeader } from '../components/PageHeader'
import { QueryTabList, TabPanel } from '../components/QueryTabs'
import { useQueryTab } from '../lib/queryTab'
import type { WorkspaceContext } from './UniverseWorkspace'

const TAB_IDS = ['general', 'appearance', 'collaborators', 'data', 'advanced'] as const

type TabId = (typeof TAB_IDS)[number]

/**
 * A universe's Settings (UI refinement 014; Collaborators since 030): five tabs rather than one long page, in the workspace's one page shell - the
 * title where every section's is, the tabs under it - with only the forms kept to a readable column. Publishing has a
 * page of its own, Publish, and the chronology is worldbuilding, not configuration - it is its own section, Chronology.
 *
 * General is the universe's name and description; Appearance its colour (the author's own, no palette; LorEvolve's Light and
 * Dark theme is the account's, not a universe's); Data its backup and restore; Advanced its archive
 * and, once archived, delete - the one thing that cannot be taken back, set apart in the danger panel.
 *
 * Every panel stays mounted and is only hidden, so an unsaved form keeps its text and its leave guard across tab
 * changes, and switching tabs is never a departure. The chosen tab is in the address (`?tab=`) so it can be linked to,
 * but switching replaces rather than adds a history entry: Back leaves Settings, as it always has.
 */
export default function UniverseSettings() {
  const { universe, refresh } = useOutletContext<WorkspaceContext>()
  const { user } = useAuth()
  const { t, tx } = useI18n()
  const navigate = useNavigate()
  const TABS = TAB_IDS.map((id) => ({ id, label: t(`universe.settings.tabs.${id}`) }))
  const [tab, choose] = useQueryTab(TABS)

  const [savedDetails, setSavedDetails] = useState(false)
  const [savedColour, setSavedColour] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [confirmingArchive, setConfirmingArchive] = useState(false)
  const [isPublic, setIsPublic] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const archiveConfirm = useRef<HTMLDivElement>(null)
  const archiveButton = useRef<HTMLButtonElement>(null)
  const deleteConfirm = useRef<HTMLDivElement>(null)
  const deleteButton = useRef<HTMLButtonElement>(null)
  const hadDeleteConfirm = useRef(false)

  // Whether the universe is public, for the archive's words. Publication itself is on Publish.
  useEffect(() => {
    const controller = new AbortController()
    getPublication(universe.id, controller.signal)
      .then((state) => setIsPublic(state.visibility === Visibility.Public))
      .catch(() => undefined)
    return () => {
      controller.abort()
    }
  }, [universe.id])

  // A confirmation takes the focus when it opens; Cancel hands the focus back to what opened it, which is only mounted
  // again after the render.
  const archiveCancelled = useRef(false)
  useEffect(() => {
    if (confirmingArchive) {
      archiveConfirm.current?.focus()
    } else if (archiveCancelled.current) {
      archiveCancelled.current = false
      archiveButton.current?.focus()
    }
  }, [confirmingArchive])

  useEffect(() => {
    if (confirmingDelete) {
      hadDeleteConfirm.current = true
      deleteConfirm.current?.focus()
    } else if (hadDeleteConfirm.current) {
      hadDeleteConfirm.current = false
      deleteButton.current?.focus()
    }
  }, [confirmingDelete])

  const [exporting, setExporting] = useState<'backup' | 'readable' | null>(null)
  const [exportedAs, setExportedAs] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  async function exportFile(kind: 'backup' | 'readable') {
    setExporting(kind)
    setExportedAs(null)
    setExportError(null)
    try {
      setExportedAs(
        await (kind === 'backup' ? downloadUniverseBackup : downloadReadableExport)(universe.id),
      )
    } catch (problem: unknown) {
      setExportError(
        problem instanceof Error ? problem.message : t('universe.settings.exportFailed'),
      )
    } finally {
      setExporting(null)
    }
  }

  async function toggleArchived() {
    setBusy(true)
    setError(null)
    try {
      refresh(await setUniverseArchived(universe.id, !universe.isArchived))
      setConfirmingArchive(false)
    } catch (problem: unknown) {
      setError(problem instanceof Error ? problem.message : t('universe.settings.changeFailed'))
    } finally {
      setBusy(false)
    }
  }

  /**
   * Archive and publication are separate (ADR 0036): an archived universe that is public stays public until its author
   * makes it private. So archiving a public universe asks first and says so, read fresh from the server, rather than
   * letting "archived" be mistaken for "taken down". Restoring from the archive changes nothing public and never asks.
   */
  async function askToArchive() {
    if (universe.isArchived) {
      await toggleArchived()
      return
    }
    setBusy(true)
    setError(null)
    let publicNow: boolean | null = null
    try {
      publicNow = (await getPublication(universe.id)).visibility === Visibility.Public
      setIsPublic(publicNow)
    } catch {
      // Unknown: ask anyway rather than archive a possibly public universe without a word.
    }
    if (publicNow === false) {
      await toggleArchived()
      return
    }
    setConfirmingArchive(true)
    setBusy(false)
  }

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await deleteUniverse(universe.id)
      // Nothing is left to recover unsaved writing into, so this device lets the universe's recovery copies go too.
      if (user) void discardUniverseDrafts(user.id, universe.id).catch(() => undefined)
      await navigate('/app', { replace: true })
    } catch (problem: unknown) {
      setError(problem instanceof Error ? problem.message : t('universe.settings.deleteFailed'))
      setBusy(false)
    }
  }

  const publishPath = `/app/universes/${universe.id}/publish`

  return (
    <article className="settings settings--tabbed">
      <PageHeader title={t('universe.settings.title')} lede={<p>{t('universe.settings.lede')}</p>}>
        <QueryTabList
          label={t('universe.settings.tabsLabel')}
          idPrefix="settings"
          tabs={TABS}
          tab={tab}
          onChoose={choose}
        />
      </PageHeader>

      {/* One outer shell for every workspace page; only the forms keep a readable column. */}
      <div className="settings__body">
        <Panel id="general" tab={tab}>
          <section className="settings__section">
            <h2 className="settings__heading">{t('universe.settings.details')}</h2>
            {savedDetails ? (
              <p className="settings__saved" role="status" data-testid="settings-saved">
                {t('universe.settings.detailsSaved')}
              </p>
            ) : null}
            <UniverseForm
              key={`${universe.name}\u0000${universe.description ?? ''}`}
              fields="details"
              initial={{
                name: universe.name,
                description: universe.description,
                accentColor: universe.accentColor,
                aiHelp: universe.aiHelp,
              }}
              submitLabel={t('universe.settings.detailsSave')}
              busyLabel={t('universe.settings.detailsSaving')}
              onSubmit={async (input) => {
                // The colour is Appearance's: what is stored now, never what this form opened on.
                const updated = await updateUniverse(universe.id, {
                  ...input,
                  accentColor: universe.accentColor,
                })
                refresh(updated)
                setSavedDetails(true)
              }}
            />
          </section>
        </Panel>

        <Panel id="appearance" tab={tab}>
          <section className="settings__section">
            <h2 className="settings__heading">{t('universe.settings.colour')}</h2>
            <p className="settings__note">{t('universe.settings.colourNote')}</p>
            {savedColour ? (
              <p className="settings__saved" role="status" data-testid="settings-colour-saved">
                {t('universe.settings.colourSaved')}
              </p>
            ) : null}
            <UniverseForm
              key={universe.accentColor ?? ''}
              fields="colour"
              initial={{
                name: universe.name,
                description: universe.description,
                accentColor: universe.accentColor,
              }}
              submitLabel={t('universe.settings.colourSave')}
              busyLabel={t('universe.settings.colourSaving')}
              onSubmit={async (input) => {
                const updated = await updateUniverse(universe.id, {
                  name: universe.name,
                  description: universe.description,
                  accentColor: input.accentColor,
                })
                refresh(updated)
                setSavedColour(true)
              }}
            />
          </section>
        </Panel>

        <Panel id="collaborators" tab={tab}>
          <CollaboratorsPanel universeId={universe.id} />
        </Panel>

        <Panel id="data" tab={tab}>
          <section className="settings__section">
            <h2 className="settings__heading">{t('universe.settings.backup')}</h2>
            <p className="settings__note">{t('universe.settings.backupNote')}</p>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => void exportFile('backup')}
              disabled={exporting !== null}
              data-testid="export-universe"
            >
              {exporting === 'backup'
                ? t('universe.settings.backupPreparing')
                : t('universe.settings.backupDownload')}
            </button>
            <p className="settings__note">{t('universe.settings.readableNote')}</p>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => void exportFile('readable')}
              disabled={exporting !== null}
              data-testid="export-readable"
            >
              {exporting === 'readable'
                ? t('universe.settings.readablePreparing')
                : t('universe.settings.readableDownload')}
            </button>
            {exportedAs ? (
              <p className="settings__saved" role="status" data-testid="export-done">
                {t('universe.settings.exportSaved', { name: exportedAs })}
              </p>
            ) : null}
            {exportError ? (
              <p className="form__message" role="alert" data-testid="export-error">
                {exportError}
              </p>
            ) : null}
          </section>

          <section className="settings__section">
            <h2 className="settings__heading">{t('universe.settings.restore')}</h2>
            <p className="settings__note">{t('universe.settings.restoreNote')}</p>
            <Link
              className="button button--secondary"
              to="/app?restore"
              data-testid="settings-restore-link"
            >
              {t('universe.settings.restoreLink')}
            </Link>
          </section>
        </Panel>

        <Panel id="advanced" tab={tab}>
          <section className="settings__section" data-testid="archive-section">
            <h2 className="settings__heading">
              {universe.isArchived
                ? t('universe.settings.restoreHeading')
                : t('universe.settings.archiveHeading')}
            </h2>
            <p className="settings__note">
              {universe.isArchived
                ? t('universe.settings.archivedNote')
                : t('universe.settings.archiveNote')}
            </p>
            {universe.isArchived && isPublic ? (
              <p className="settings__note" data-testid="archived-still-public">
                {tx('universe.settings.stillPublic', {
                  still: <strong>{t('universe.settings.stillPublicLead')}</strong>,
                  link: <Link to={publishPath}>{t('universe.settings.stillPublicLink')}</Link>,
                })}
              </p>
            ) : null}
            {confirmingArchive ? (
              <div
                className="settings__confirm"
                role="group"
                aria-labelledby="archive-confirm-title"
                tabIndex={-1}
                ref={archiveConfirm}
                data-testid="archive-public-confirm"
              >
                <p className="settings__confirmtitle" id="archive-confirm-title">
                  {tx(
                    isPublic
                      ? 'universe.settings.archiveConfirmPublic'
                      : 'universe.settings.archiveConfirm',
                    { name: <bdi>{universe.name}</bdi> },
                  )}
                </p>
                <p className="settings__note">
                  {isPublic
                    ? t('universe.settings.archiveConfirmPublicNote')
                    : t('universe.settings.archiveConfirmUnknownNote')}
                </p>
                <div className="form__actions">
                  <button
                    className="button"
                    type="button"
                    onClick={() => void toggleArchived()}
                    disabled={busy}
                    data-testid="confirm-archive"
                  >
                    {busy
                      ? t('universe.settings.archiving')
                      : isPublic
                        ? t('universe.settings.archiveKeepPublic')
                        : t('universe.settings.archiveConfirmButton')}
                  </button>
                  <Link
                    className="button button--secondary"
                    to={publishPath}
                    data-testid="archive-go-private"
                  >
                    {t('universe.settings.makePrivateFirst')}
                  </Link>
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() => {
                      archiveCancelled.current = true
                      setConfirmingArchive(false)
                    }}
                    data-testid="cancel-archive"
                  >
                    {t('universe.settings.archiveCancel')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                ref={archiveButton}
                className="button button--secondary"
                type="button"
                onClick={() => void askToArchive()}
                disabled={busy}
                data-testid="toggle-archive"
              >
                {universe.isArchived
                  ? t('universe.settings.restoreUniverse')
                  : t('universe.settings.archiveUniverse')}
              </button>
            )}
          </section>

          {universe.isArchived ? (
            <section
              className="settings__section settings__section--danger"
              aria-labelledby="danger-heading"
              data-testid="danger-section"
            >
              <h2 className="settings__heading" id="danger-heading">
                {t('universe.settings.deleteHeading')}
              </h2>
              <p className="settings__note">
                {isPublic
                  ? t('universe.settings.deleteNotePublic')
                  : t('universe.settings.deleteNote')}
              </p>
              <p className="settings__note" data-testid="delete-ideas-note">
                {t('universe.settings.deleteIdeasNote')}
              </p>
              {confirmingDelete ? (
                <div
                  className="settings__confirm"
                  role="group"
                  aria-labelledby="delete-confirm-title"
                  tabIndex={-1}
                  ref={deleteConfirm}
                >
                  <p className="settings__confirmtitle" id="delete-confirm-title">
                    {tx('universe.settings.deleteConfirm', { name: <bdi>{universe.name}</bdi> })}
                  </p>
                  <div className="form__actions">
                    <button
                      className="button button--danger"
                      type="button"
                      onClick={remove}
                      disabled={busy}
                      data-testid="confirm-delete"
                    >
                      {t('universe.settings.deleteConfirmButton')}
                    </button>
                    <button
                      className="button button--secondary"
                      type="button"
                      onClick={() => setConfirmingDelete(false)}
                    >
                      {t('universe.settings.deleteKeep')}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  ref={deleteButton}
                  className="button button--secondary button--danger-quiet"
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  data-testid="delete-universe"
                >
                  {t('universe.settings.deleteButton')}
                </button>
              )}
            </section>
          ) : (
            <p className="settings__note" data-testid="delete-needs-archive">
              {t('universe.settings.deleteNeedsArchive')}
            </p>
          )}

          {error ? (
            <p className="form__message" role="alert">
              {error}
            </p>
          ) : null}
        </Panel>
      </div>
    </article>
  )
}

/** One tab's panel: always mounted, hidden unless chosen, so what is typed in it is kept. */
function Panel({ id, tab, children }: { id: TabId; tab: TabId; children: ReactNode }) {
  return (
    <TabPanel idPrefix="settings" id={id} tab={tab}>
      {children}
    </TabPanel>
  )
}
