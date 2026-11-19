import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { QueryTabList, TabPanel } from '../components/QueryTabs'
import { SystemMachinePanel } from '../components/SystemMachinePanel'
import { Crumb } from '../components/Crumb'
import { PageHeader } from '../components/PageHeader'
import { t, useI18n } from '../i18n'
import { advanceVersions } from '../worldLogic/machine'
import type { WorkspaceContext } from './UniverseWorkspace'
import { useSystemEditorState } from '../worldLogic/useSystemEditorState'
import { systemEditorActions } from '../worldLogic/systemEditorActions'
import { SystemDetails } from '../components/worldLogic/SystemDetails'
import { Button } from '../components/Button'
import { LoadError } from '../components/LoadError'
import { EmptyState } from '../components/EmptyState'
import { Announce } from '../components/Announce'
import { LoadingNote } from '../components/LoadingNote'

/**
 * Creates a System, or edits and deletes a saved one, at `world-logic/systems/new` or `world-logic/systems/:systemId`.
 *
 * A System is a name and a summary; the rule definitions it references are written through MCP or the API, and a
 * transition's guard is built from blocks on the Machine tab (Issue #359). A save names the version it was written over, so a System changed meanwhile is refused
 * (`system_changed`) rather than overwritten, and the author reloads it. Its scope is fixed at creation, so this editor
 * only ever creates a universe-wide System.
 *
 * A saved System has two tabs: Details, the name and summary, and Machine, its states and transitions. Both saves name
 * the System's one version, so the editor keeps a base for each and moves the other along after a save of its own
 * (`advanceVersions`): the author is never refused by their own earlier save, and a stale draft still is.
 */
export default function SystemEditorPage({ isNew = false }: { isNew?: boolean }) {
  useI18n() // re-renders when the language changes
  const { systemId } = useParams<{ systemId: string }>()
  const { universe } = useOutletContext<WorkspaceContext>()
  const listPath = `/app/universes/${universe.id}/world-logic?tab=systems`

  return (
    <SystemEditor
      // A different System, or the new one becoming saved, is a different editor, starting from nothing.
      key={isNew ? 'new' : systemId}
      universeId={universe.id}
      systemId={isNew ? null : (systemId ?? null)}
      listPath={listPath}
    />
  )
}

function SystemEditor({
  universeId,
  systemId,
  listPath,
}: {
  universeId: string
  systemId: string | null
  listPath: string
}) {
  const navigate = useNavigate()
  const state = useSystemEditorState({ universeId, systemId })
  const {
    headingId,
    nameId,
    summaryId,
    load,
    name,
    setName,
    summary,
    setSummary,
    saved,
    fieldErrors,
    failure,
    conflict,
    saving,
    announcement,
    bases,
    setBases,
    machineDirty,
    tabs,
    tab,
    choose,
  } = state
  const { reread, save, remove } = systemEditorActions({
    ...state,
    universeId,
    systemId,
    listPath,
    navigate,
  })

  if (load.kind === 'loading') {
    return <LoadingNote>{t('canon.worldLogic.systems.loading')}</LoadingNote>
  }

  if (load.kind === 'missing') {
    return (
      <EmptyState
        title={t('canon.worldLogic.systems.editor.gone')}
        action={
          <Button tone="secondary" to={listPath}>
            {t('canon.worldLogic.systems.editor.back')}
          </Button>
        }
        testId="system-editor-unavailable"
      />
    )
  }

  if (load.kind === 'error') {
    return (
      <LoadError
        message={t('canon.worldLogic.systems.readFailed')}
        onRetry={() => void reread()}
        retryLabel={t('canon.rules.retry')}
        action={
          <Button tone="secondary" to={listPath}>
            {t('canon.worldLogic.systems.editor.back')}
          </Button>
        }
        testId="system-editor-unavailable"
      />
    )
  }

  const isNew = !systemId

  const details = (
    <SystemDetails
      conflict={conflict}
      saving={saving}
      failure={failure}
      nameId={nameId}
      summaryId={summaryId}
      fieldErrors={fieldErrors}
      name={name}
      setName={setName}
      summary={summary}
      setSummary={setSummary}
      reread={reread}
      save={save}
      remove={remove}
      isNew={isNew}
    />
  )

  return (
    <section aria-labelledby={headingId} data-testid="system-editor">
      <PageHeader
        title={
          isNew
            ? t('canon.worldLogic.systems.editor.newTitle')
            : t('canon.worldLogic.systems.editor.editTitle')
        }
        titleId={headingId}
        lede={t('canon.worldLogic.systems.editor.lede')}
        crumb={
          <Crumb
            items={[
              {
                to: listPath,
                label: t('canon.worldLogic.systems.editor.back'),
                testId: 'system-editor-back',
              },
            ]}
          />
        }
      />

      {!systemId ? (
        details
      ) : (
        <>
          <QueryTabList
            label={t('canon.worldLogic.systems.editor.editTitle')}
            idPrefix="system-editor"
            tabs={tabs}
            tab={tab}
            onChoose={choose}
          />
          <TabPanel idPrefix="system-editor" id="details" tab={tab}>
            {details}
          </TabPanel>
          <TabPanel idPrefix="system-editor" id="machine" tab={tab}>
            <SystemMachinePanel
              universeId={universeId}
              systemId={systemId}
              systemName={saved?.name ?? name}
              projectId={saved?.projectId ?? null}
              baseVersion={bases.machine}
              onLoaded={(version) => setBases((current) => ({ ...current, machine: version }))}
              onSaved={(from, to) =>
                setBases((current) => advanceVersions(current, 'machine', from, to))
              }
              onDirty={(isDirty) => {
                machineDirty.current = isDirty
              }}
            />
          </TabPanel>
        </>
      )}

      <Announce testId="system-editor-announcer">{announcement}</Announce>
    </section>
  )
}
