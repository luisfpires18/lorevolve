import { useEffect, useState } from 'react'
import {
  createProjectEntity,
  deleteProjectEntity,
  getProjectEntity,
  listProjectEntities,
  listProjectTypes,
} from '../projectEntities/api'
import { setFieldImage } from '../lore/images'
import type { FieldImageRef } from '../lore/types'
import {
  FieldKind,
  type FieldValueInput,
  type ProjectEntityType,
  type ProjectEntitySummary,
  type ProjectField,
} from '../projectEntities/types'
import { ActionMenu } from './ActionMenu'
import { FieldImageInput, type PendingFieldImage } from './FieldImageInput'
import { EmptyState } from './EmptyState'
import { t, useI18n } from '../i18n'

/** How many entries one read shows; the next page is asked for, never loaded behind the author's back (#196). */
export const ENTRY_PAGE_SIZE = 25

/** The most rows reaching a named entry will read, matching the endpoint's own ceiling on one request. */
const ENTRY_LIST_CEILING = 500

/**
 * The entries a project holds, by type (#144).
 *
 * The type is chosen first, because an entry is of a type and its fields are that type's. Values are edited with the
 * plainest control each kind allows; nothing here infers a meaning from a field's name.
 */
export function ProjectEntries({
  projectId,
  universeId,
  fixedTypeId,
  openEntryId,
  reloadKey,
  onChanged,
}: {
  projectId: string
  /** The universe the project belongs to: an entry's pictures are stored under it. */
  universeId: string
  /** Set when the author opened one type's card: only its entries are listed and no other type is offered (#196). */
  fixedTypeId?: string
  /**
   * The entry the address names, which a link from elsewhere in the app opens (#195). Rows are read a page at a time,
   * so the one named may be past the first page: enough pages are read to reach it, and its row is marked and brought
   * into view. An entry has no screen of its own to open, so its row in its own type's list is what opening it means.
   */
  openEntryId?: string
  reloadKey: number
  /** Called after a write, so the Types panel's entry counts are re-read rather than left stale. */
  onChanged?: () => void
}) {
  useI18n()
  const [types, setTypes] = useState<ProjectEntityType[] | null>(null)
  const [typeId, setTypeId] = useState<string | null>(fixedTypeId ?? null)
  const [entries, setEntries] = useState<ProjectEntitySummary[] | null>(null)
  const [more, setMore] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [summary, setSummary] = useState('')
  const [adding, setAdding] = useState(false)
  const [values, setValues] = useState<Record<string, FieldValueInput>>({})
  // An Image field's picture waits here until the entry exists, by field id: it is its own write after the create.
  const [pendingImages, setPendingImages] = useState<Record<string, PendingFieldImage>>({})

  useEffect(() => {
    const controller = new AbortController()
    listProjectTypes(projectId, controller.signal)
      .then((read) => {
        setTypes(read)
        // A type named by the address is never swapped for another: if it is gone, the render below says so.
        if (fixedTypeId) return
        setTypeId((current) =>
          current !== null && read.some((type) => type.id === current)
            ? current
            : (read[0]?.id ?? null),
        )
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setTypes([])
        setFailed(error instanceof Error ? error.message : t('projects.entries.failed'))
      })
    return () => controller.abort()
  }, [projectId, reloadKey])

  useEffect(() => {
    // No type chosen means there is nothing to read: the empty list is derived during render rather than written here,
    // because setting state inside an effect only to say "nothing" starts a second render for no reason.
    if (typeId === null) return

    const controller = new AbortController()

    /*
     * The first page, or as many pages as it takes to include the entry the address names, so a link to an entry does
     * not land on a list that does not hold it. Bounded by the endpoint's own ceiling on one request, so a long list
     * cannot become an unbounded read. Defined here rather than beside the component, because it closes over the read
     * this effect owns and belongs to its lifetime.
     */
    const reach = async (signal: AbortSignal, forType: string) => {
      const first = await listProjectEntities(projectId, forType, signal, {
        skip: 0,
        take: ENTRY_PAGE_SIZE + 1,
      })

      if (!openEntryId) return { read: first, shown: ENTRY_PAGE_SIZE }

      let read = first
      let shown = ENTRY_PAGE_SIZE
      while (
        read.length > shown &&
        shown < ENTRY_LIST_CEILING &&
        !read.slice(0, shown).some((entry) => entry.id === openEntryId)
      ) {
        const next = await listProjectEntities(projectId, forType, signal, {
          skip: read.length,
          take: ENTRY_PAGE_SIZE + 1,
        })
        read = [...read.slice(0, shown), ...next]
        shown += ENTRY_PAGE_SIZE
      }
      return { read, shown }
    }

    reach(controller.signal, typeId)
      .then(({ read, shown }) => showing(read, shown))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setEntries([])
        setFailed(error instanceof Error ? error.message : t('projects.entries.failed'))
      })
    return () => controller.abort()
  }, [projectId, typeId, reloadKey, openEntryId])

  /** One more row than is shown is asked for, so whether another page exists is known without a count. */
  function showing(read: ProjectEntitySummary[], shown: number) {
    setEntries(read.slice(0, shown))
    setMore(read.length > shown)
  }

  function loadMore() {
    if (typeId === null || entries === null) return
    setBusy(true)
    listProjectEntities(projectId, typeId, undefined, {
      skip: entries.length,
      take: ENTRY_PAGE_SIZE + 1,
    })
      .then((read) => {
        setEntries([...entries, ...read.slice(0, ENTRY_PAGE_SIZE)])
        setMore(read.length > ENTRY_PAGE_SIZE)
        setBusy(false)
      })
      .catch(failing)
  }

  function refresh(notice: string | null = null) {
    if (typeId === null) return
    // A write re-reads as many rows as were already open, so the author keeps their place in a long list.
    const shown = Math.max(entries?.length ?? 0, ENTRY_PAGE_SIZE)
    listProjectEntities(projectId, typeId, undefined, { skip: 0, take: shown + 1 })
      .then((read) => {
        showing(read, shown)
        setBusy(false)
        setFailed(notice)
        onChanged?.()
      })
      .catch(failing)
  }

  function failing(error: unknown) {
    setBusy(false)
    setFailed(error instanceof Error ? error.message : t('projects.entries.failed'))
  }

  if (types === null) {
    return <p className="projectcard__meta">{t('projects.common.loading')}</p>
  }

  if (types.length === 0) {
    return (
      <section className="projects" data-testid="project-entries">
        <h2>{t('projects.entries.title')}</h2>
        <EmptyState
          title={t('projects.entries.needsType')}
          hint={t('projects.entries.needsTypeHint')}
          testId="project-entries-needs-type"
        />
      </section>
    )
  }

  if (fixedTypeId && !types.some((each) => each.id === fixedTypeId)) {
    return (
      <section className="projects" data-testid="project-entries">
        <h2>{t('projects.entries.title')}</h2>
        <EmptyState
          title={t('projects.entries.typeMissing')}
          hint={t('projects.entries.typeMissingHint')}
          testId="project-entries-type-missing"
        />
      </section>
    )
  }

  const type = types.find((each) => each.id === typeId) ?? null
  // A type's own fields and the ones it inherits are both filled in on an entry; they differ only in where they are
  // defined, which is the Types screen's business and not this one's.
  const fields: ProjectField[] = type ? [...type.fields, ...type.inheritedFields] : []
  const imageFieldIds = new Set(
    fields.filter((one) => one.kind === FieldKind.Image).map((one) => one.id),
  )

  return (
    <section className="projects" data-testid="project-entries">
      <header className="projects__head">
        <div className="projects__headtext">
          <h2>{t('projects.entries.title')}</h2>
          <p className="projects__lede">{t('projects.entries.lede')}</p>
        </div>
        <button
          className="button"
          type="button"
          aria-expanded={adding}
          data-testid="project-entry-add"
          onClick={() => setAdding((open) => !open)}
        >
          {t('projects.entries.add')}
        </button>
      </header>

      {failed ? (
        <p role="alert" data-testid="project-entries-failed">
          {failed}
        </p>
      ) : null}

      {fixedTypeId ? null : (
        <label className="field">
          <span className="field__label">{t('projects.entries.ofType')}</span>
          <select
            className="field__input"
            value={typeId ?? ''}
            onChange={(event) => {
              setTypeId(event.target.value)
              setValues({})
              setPendingImages({})
            }}
            data-testid="project-entries-type"
          >
            {types.map((each) => (
              <option key={each.id} value={each.id}>
                {each.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {/*
       * Asked for rather than always open. Its fields are the chosen type's, so it sits under the type above it and
       * the author reads the type's name before the boxes that belong to it.
       */}
      {adding ? (
        <form
          className="form"
          data-testid="project-entry-new"
          onSubmit={(event) => {
            event.preventDefault()
            if (busy || typeId === null) return
            setBusy(true)
            createProjectEntity(projectId, {
              entityTypeId: typeId,
              name,
              summary: summary.length > 0 ? summary : null,
              canonEntityId: null,
              // A picture is never a value: it is uploaded below, once the entry has an id.
              fields: Object.values(values).filter(
                (one) => !imageFieldIds.has(one.fieldDefinitionId),
              ),
              expectedVersion: null,
            })
              .then(async (created) => {
                // Each picture is its own write and may fail on its own: the entry is already stored.
                const refused: string[] = []
                for (const [fieldId, held] of Object.entries(pendingImages)) {
                  try {
                    await setFieldImage(universeId, created.id, fieldId, held.file, held.crop)
                  } catch {
                    refused.push(fields.find((one) => one.id === fieldId)?.name ?? '')
                  }
                }
                setName('')
                setSummary('')
                setValues({})
                setPendingImages({})
                setAdding(false)
                refresh(
                  refused.length > 0
                    ? t('entity.fieldImage.uploadFailed', { name: refused.join(', ') })
                    : null,
                )
              })
              .catch(failing)
          }}
        >
          <label className="field">
            <span className="field__label">{t('projects.entries.name')}</span>
            <input
              className="field__input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              data-testid="project-entry-new-name"
              required
            />
          </label>

          <label className="field">
            <span className="field__label">{t('projects.entries.summary')}</span>
            <input
              className="field__input"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              data-testid="project-entry-new-summary"
            />
          </label>

          {fields.length > 0 ? (
            <h4 className="sectionrule sectionrule--accent">{t('projects.entries.values')}</h4>
          ) : null}

          {fields.map((field) =>
            field.kind === FieldKind.Image ? (
              <FieldImageInput
                key={field.id}
                universeId={universeId}
                entityId={null}
                fieldId={field.id}
                name={field.name}
                shape={field.imageShape}
                image={null}
                pending={pendingImages[field.id] ?? null}
                onPending={(held) =>
                  setPendingImages((current) => {
                    const { [field.id]: _dropped, ...rest } = current
                    return held ? { ...rest, [field.id]: held } : rest
                  })
                }
                onChanged={() => undefined}
                disabled={busy}
              />
            ) : (
              <ValueField
                key={field.id}
                field={field}
                value={values[field.id]}
                onChange={(next) => setValues((current) => ({ ...current, [field.id]: next }))}
              />
            ),
          )}

          <div className="form__actions">
            <button
              className="button"
              type="submit"
              disabled={busy}
              data-testid="project-entry-new-save"
            >
              {busy ? t('projects.entries.saving') : t('projects.entries.add')}
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => setAdding(false)}
              data-testid="project-entry-new-cancel"
            >
              {t('projects.common.cancel')}
            </button>
          </div>
        </form>
      ) : null}

      {typeId !== null && entries === null ? (
        <p className="projectcard__meta">{t('projects.common.loading')}</p>
      ) : (entries ?? []).length === 0 ? (
        <EmptyState
          title={t('projects.entries.empty')}
          hint={t('projects.entries.emptyHint')}
          testId="project-entries-empty"
        />
      ) : (
        <ul className="projectcardlist" data-testid="project-entry-list">
          {(entries ?? []).map((entry) => (
            <li
              key={entry.id}
              className="projectcard"
              data-testid={`project-entry-${entry.id}`}
              // The entry the address named: marked for a screen reader as the row in view, and scrolled to, because
              // it may sit below the fold of a list that had to read several pages to include it (#195).
              aria-current={entry.id === openEntryId ? 'true' : undefined}
              ref={
                entry.id === openEntryId
                  ? (node) => node?.scrollIntoView({ block: 'center' })
                  : undefined
              }
            >
              <div className="projectcard__head">
                <h3 className="projectcard__title">{entry.name}</h3>
                <p className="projectcard__meta">
                  {entry.canonEntityName ?? t('projects.entries.canonNone')}
                </p>
                <div className="projectcard__actions">
                  <ActionMenu
                    label={t('projects.common.more', { name: entry.name })}
                    triggerTestId={`project-entry-actions-${entry.id}`}
                  >
                    <button
                      className="actionmenu__item actionmenu__item--danger"
                      type="button"
                      disabled={busy}
                      data-testid={`project-entry-delete-${entry.id}`}
                      onClick={() => {
                        setBusy(true)
                        deleteProjectEntity(projectId, entry.id)
                          .then(() => refresh())
                          .catch(failing)
                      }}
                    >
                      {t('projects.entries.delete')}
                    </button>
                  </ActionMenu>
                </div>
              </div>
              {entry.summary ? <p className="prose">{entry.summary}</p> : null}
              {imageFieldIds.size > 0 ? (
                <EntryPictures
                  projectId={projectId}
                  universeId={universeId}
                  entryId={entry.id}
                  fields={fields.filter((one) => one.kind === FieldKind.Image)}
                  busy={busy}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {more ? (
        <button
          className="button button--secondary"
          type="button"
          disabled={busy}
          data-testid="project-entries-more"
          onClick={loadMore}
        >
          {t('projects.entries.more')}
        </button>
      ) : null}
    </section>
  )
}

/**
 * An entry's pictures, one per Image field of its type: read from the entry itself, because the list carries no
 * pictures. Each is the field's own control, so a picture can be replaced, recropped or removed where it is read.
 */
function EntryPictures({
  projectId,
  universeId,
  entryId,
  fields,
  busy,
}: {
  projectId: string
  universeId: string
  entryId: string
  fields: ProjectField[]
  busy: boolean
}) {
  const [pictures, setPictures] = useState<FieldImageRef[] | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    getProjectEntity(projectId, entryId, controller.signal)
      .then((read) => setPictures(read.fieldImages))
      .catch(() => {
        if (!controller.signal.aborted) setPictures([])
      })
    return () => controller.abort()
  }, [projectId, entryId])

  if (pictures === null) return null

  return (
    <div className="entry__fieldimages" data-testid={`project-entry-images-${entryId}`}>
      {fields.map((field) => (
        <FieldImageInput
          key={field.id}
          universeId={universeId}
          entityId={entryId}
          fieldId={field.id}
          name={field.name}
          shape={field.imageShape}
          image={pictures.find((one) => one.fieldId === field.id) ?? null}
          pending={null}
          onPending={() => undefined}
          onChanged={(picture) =>
            setPictures((current) => [
              ...(current ?? []).filter((one) => one.fieldId !== field.id),
              ...(picture ? [picture] : []),
            ])
          }
          disabled={busy}
        />
      ))}
    </div>
  )
}

/** One field's control, by kind. Every value a save sends fills exactly one member of the input. */
function ValueField({
  field,
  value,
  onChange,
}: {
  field: ProjectField
  value: FieldValueInput | undefined
  onChange: (next: FieldValueInput) => void
}) {
  useI18n()
  const blank: FieldValueInput = {
    fieldDefinitionId: field.id,
    text: null,
    number: null,
    boolean: null,
    date: null,
    optionIds: null,
    referencedEntityId: null,
    eraId: null,
  }
  const current = value ?? blank
  const testId = `project-entry-value-${field.id}`

  if (field.kind === FieldKind.Select || field.kind === FieldKind.MultiSelect) {
    const chosen = current.optionIds ?? []
    return (
      <fieldset className="field" data-testid={testId}>
        <legend className="field__label">
          {field.name}
          {field.isRequired ? ' *' : ''}
        </legend>
        <div className="choices">
          {field.options.map((option) => (
            <label key={option.id} className="check">
              <input
                type="checkbox"
                checked={chosen.includes(option.id)}
                data-testid={`${testId}-${option.id}`}
                onChange={(event) =>
                  onChange({
                    ...blank,
                    // One choice replaces, several accumulate: the kind decides, not the control.
                    optionIds: event.target.checked
                      ? field.kind === FieldKind.Select
                        ? [option.id]
                        : [...chosen, option.id]
                      : chosen.filter((id) => id !== option.id),
                  })
                }
              />
              <span>{option.value}</span>
            </label>
          ))}
        </div>
      </fieldset>
    )
  }

  if (field.kind === FieldKind.Boolean) {
    return (
      <div className="field">
        <label className="check">
          <input
            type="checkbox"
            checked={current.boolean === true}
            data-testid={testId}
            onChange={(event) => onChange({ ...blank, boolean: event.target.checked })}
          />
          <span>
            {field.name}
            {field.isRequired ? ' *' : ''}
          </span>
        </label>
      </div>
    )
  }

  return (
    <label className="field">
      <span className="field__label">
        {field.name}
        {field.isRequired ? ' *' : ''}
      </span>
      {field.kind === FieldKind.LongText ? (
        <textarea
          className="field__input"
          value={current.text ?? ''}
          data-testid={testId}
          onChange={(event) => onChange({ ...blank, text: event.target.value })}
        />
      ) : (
        <input
          className="field__input"
          type={
            field.kind === FieldKind.Number
              ? 'number'
              : field.kind === FieldKind.Date
                ? 'date'
                : 'text'
          }
          value={
            field.kind === FieldKind.Number
              ? (current.number?.toString() ?? '')
              : field.kind === FieldKind.Date
                ? (current.date ?? '')
                : (current.text ?? '')
          }
          data-testid={testId}
          onChange={(event) => {
            const raw = event.target.value
            onChange(
              field.kind === FieldKind.Number
                ? { ...blank, number: raw.length > 0 ? Number(raw) : null }
                : field.kind === FieldKind.Date
                  ? { ...blank, date: raw.length > 0 ? raw : null }
                  : { ...blank, text: raw },
            )
          }}
        />
      )}
    </label>
  )
}
