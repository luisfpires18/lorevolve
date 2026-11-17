import { useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { Field } from '../components/Field'
import { QueryTabList, TabPanel } from '../components/QueryTabs'
import { SystemMachinePanel } from '../components/SystemMachinePanel'
import { PageHeader } from '../components/PageHeader'
import { t, useI18n } from '../i18n'
import { ApiError } from '../lib/api'
import { confirmAction, confirmDiscard } from '../lib/confirm'
import { useQueryTab } from '../lib/queryTab'
import { createSystem, deleteSystem, getSystem, saveSystem } from '../worldLogic/api'
import { advanceVersions, type BaseVersions } from '../worldLogic/machine'
import {
  SYSTEM_NAME_MAX_LENGTH,
  SYSTEM_SUMMARY_MAX_LENGTH,
  type SystemDetail,
} from '../worldLogic/types'
import type { WorkspaceContext } from './UniverseWorkspace'

type Load =
  | { kind: 'loading' }
  | { kind: 'ready'; system: SystemDetail | null }
  | { kind: 'missing' }
  | { kind: 'error' }

/**
 * Creates a System, or edits and deletes a saved one, at `world-logic/systems/new` or `world-logic/systems/:systemId`.
 *
 * A System is a name and a summary; the rule definitions it references are written through MCP or the API until the
 * web has an editor for them. A save names the version it was written over, so a System changed meanwhile is refused
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
  const headingId = useId()
  const nameId = useId()
  const summaryId = useId()
  const [load, setLoad] = useState<Load>(
    systemId ? { kind: 'loading' } : { kind: 'ready', system: null },
  )
  const [reads, setReads] = useState(0)
  const [name, setName] = useState('')
  const [summary, setSummary] = useState('')
  const [saved, setSaved] = useState<SystemDetail | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [saving, setSaving] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [bases, setBases] = useState<BaseVersions>({ details: 0, machine: 0 })
  const machineDirty = useRef(false)

  const tabs = [
    { id: 'details' as const, label: t('canon.worldLogic.systems.editor.tabs.details') },
    { id: 'machine' as const, label: t('canon.worldLogic.systems.editor.tabs.machine') },
  ]
  const [tab, choose] = useQueryTab(tabs)

  useEffect(() => {
    if (!systemId) return
    const controller = new AbortController()

    getSystem(universeId, systemId, controller.signal)
      .then((system) => {
        setSaved(system)
        setBases({ details: system.version, machine: system.version })
        setName(system.name)
        setSummary(system.summary)
        setLoad({ kind: 'ready', system })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setLoad(
          error instanceof ApiError && error.status === 404
            ? { kind: 'missing' }
            : { kind: 'error' },
        )
      })

    return () => {
      controller.abort()
    }
  }, [universeId, systemId, reads])

  async function reread() {
    // Reading the System again starts the Machine tab over too, so an unsaved drawing is asked about first.
    if (
      machineDirty.current &&
      !(await confirmDiscard(t('canon.worldLogic.systems.machine.discard')))
    )
      return
    machineDirty.current = false
    setConflict(false)
    setFailure(null)
    setFieldErrors({})
    setLoad({ kind: 'loading' })
    setReads((count) => count + 1)
  }

  async function save() {
    if (saving) return
    setSaving(true)
    setFailure(null)
    setFieldErrors({})
    setConflict(false)

    const input = {
      name: name.trim(),
      summary,
      projectId: saved?.projectId ?? null,
      expectedVersion: saved ? bases.details : undefined,
    }

    try {
      if (!systemId) {
        await createSystem(universeId, input)
        void navigate(listPath)
        return
      }

      const next = await saveSystem(universeId, systemId, input)
      setBases((current) =>
        advanceVersions(current, 'details', input.expectedVersion!, next.version),
      )
      setSaved(next)
      setName(next.name)
      setSummary(next.summary)
      setAnnouncement(t('canon.worldLogic.systems.editor.saved'))
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 409 && error.code === 'system_changed') {
        setConflict(true)
      } else if (
        error instanceof ApiError &&
        error.status === 409 &&
        error.code === 'system_name_taken'
      ) {
        setFieldErrors({ name: t('canon.worldLogic.systems.editor.nameTaken') })
      } else if (error instanceof ApiError && error.status === 404) {
        setFailure(t('canon.worldLogic.systems.editor.gone'))
      } else if (error instanceof ApiError && error.status === 400) {
        setFieldErrors(error.fieldErrors)
        setFailure(
          Object.keys(error.fieldErrors).length === 0
            ? error.message
            : t('canon.worldLogic.systems.editor.invalid'),
        )
      } else {
        setFailure(t('canon.worldLogic.systems.editor.saveFailed'))
      }
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!systemId || !saved) return
    await confirmAction({
      title: t('canon.worldLogic.systems.editor.delete.title'),
      message: t('canon.worldLogic.systems.editor.delete.message'),
      confirmLabel: t('canon.worldLogic.systems.editor.delete.confirm'),
      busyLabel: t('canon.worldLogic.systems.editor.delete.busy'),
      variant: 'destructive',
      action: async () => {
        await deleteSystem(universeId, systemId)
        void navigate(listPath)
      },
    })
  }

  if (load.kind === 'loading') {
    return (
      <p className="notice" role="status">
        {t('canon.worldLogic.systems.loading')}
      </p>
    )
  }

  if (load.kind === 'missing' || load.kind === 'error') {
    return (
      <div className="notice notice--error" role="alert" data-testid="system-editor-unavailable">
        <p>
          {load.kind === 'missing'
            ? t('canon.worldLogic.systems.editor.gone')
            : t('canon.worldLogic.systems.readFailed')}
        </p>
        {load.kind === 'error' ? (
          <button className="button button--secondary" type="button" onClick={() => void reread()}>
            {t('canon.rules.retry')}
          </button>
        ) : null}
        <Link className="button button--secondary" to={listPath}>
          {t('canon.worldLogic.systems.editor.back')}
        </Link>
      </div>
    )
  }

  const isNew = !systemId

  const details = (
    <>
      {conflict ? (
        <div className="manuscript__conflict" role="alert" data-testid="system-editor-conflict">
          <p className="manuscript__conflicttext">
            {t('canon.worldLogic.systems.editor.conflict')}
          </p>
          <div className="manuscript__conflictactions">
            <button
              className="button button--secondary"
              type="button"
              onClick={() => void reread()}
              data-testid="system-editor-load-saved"
            >
              {t('canon.worldLogic.systems.editor.loadSaved')}
            </button>
          </div>
        </div>
      ) : null}

      {failure ? (
        <p className="form__message" role="alert" data-testid="system-editor-error">
          {failure}
        </p>
      ) : null}

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <Field
          label={t('canon.worldLogic.systems.editor.name')}
          id={nameId}
          error={
            fieldErrors.name ? (
              <span data-testid="system-editor-name-error">{fieldErrors.name}</span>
            ) : undefined
          }
        >
          {(control) => (
            <input
              id={control.id}
              className="field__input field__input--title"
              type="text"
              dir="auto"
              value={name}
              maxLength={SYSTEM_NAME_MAX_LENGTH}
              placeholder={t('canon.worldLogic.systems.editor.namePlaceholder')}
              onChange={(event) => setName(event.target.value)}
              aria-invalid={control['aria-invalid']}
              aria-describedby={control['aria-describedby']}
              aria-required="true"
              data-testid="system-editor-name"
            />
          )}
        </Field>

        <Field
          label={t('canon.worldLogic.systems.editor.summary')}
          id={summaryId}
          error={fieldErrors.summary}
        >
          {(control) => (
            <textarea
              id={control.id}
              className="field__input field__input--area"
              rows={8}
              dir="auto"
              value={summary}
              maxLength={SYSTEM_SUMMARY_MAX_LENGTH}
              placeholder={t('canon.worldLogic.systems.editor.summaryPlaceholder')}
              onChange={(event) => setSummary(event.target.value)}
              aria-invalid={control['aria-invalid']}
              aria-describedby={control['aria-describedby']}
              data-testid="system-editor-summary"
            />
          )}
        </Field>

        <div className="form__actions">
          <button
            className="button"
            type="submit"
            disabled={saving}
            data-testid="system-editor-save"
          >
            {saving
              ? t('canon.worldLogic.systems.editor.saving')
              : isNew
                ? t('canon.worldLogic.systems.editor.create')
                : t('canon.worldLogic.systems.editor.save')}
          </button>
          {!isNew ? (
            <button
              className="button button--secondary"
              type="button"
              onClick={() => void remove()}
              data-testid="system-editor-delete"
            >
              {t('canon.worldLogic.systems.editor.delete.open')}
            </button>
          ) : null}
        </div>
      </form>
    </>
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
        actions={
          <Link className="button button--secondary" to={listPath} data-testid="system-editor-back">
            {t('canon.worldLogic.systems.editor.back')}
          </Link>
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

      <p className="visually-hidden" role="status" data-testid="system-editor-announcer">
        {announcement}
      </p>
    </section>
  )
}
