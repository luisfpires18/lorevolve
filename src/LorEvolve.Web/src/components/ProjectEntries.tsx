import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { Field } from './Field'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { ListFilter, Plus, X } from 'lucide-react'
import {
  createProjectEntity,
  deleteProjectEntity,
  getProjectEntity,
  listProjectEntities,
  listProjectTypes,
  saveProjectEntity,
} from '../projectEntities/api'
import { valuesFromDetail } from '../projectEntities/fieldRows'
import { setFieldImage } from '../lore/images'
import type { FieldImageRef } from '../lore/types'
import {
  FieldKind,
  type FieldValueInput,
  type ProjectEntityDetail,
  type ProjectEntityType,
  type ProjectEntitySummary,
  type ProjectField,
} from '../projectEntities/types'
import { buildTypeTree } from '../lore/typeTree'
import { ActionIcon } from './ActionIcon'
import { ActionMenu } from './ActionMenu'
import { FieldImageInput, type PendingFieldImage } from './FieldImageInput'
import { EmptyState } from './EmptyState'
import { EntityCardBody } from './EntityCard'
import { t, tx, useI18n } from '../i18n'

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
  crumb,
  entryHref,
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
  /** The way back to the type cards, which the type's ancestors follow as they do above a Lore type's list. */
  crumb?: ReactNode
  /** Where an entry's card opens (#286); unset, a card is static as it was (#196). */
  entryHref?: (entry: ProjectEntitySummary) => string
}) {
  useI18n()
  const { pathname } = useLocation()
  // Search, sort and nesting live in the address beside `type`, so a filtered list is linkable (#285).
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const sortParam = params.get('sort')
  const sort =
    sortParam === 'updated' || sortParam === 'name' || sortParam === 'created' ? sortParam : ''
  const nested = params.get('nested') === '1'
  const filtered = q !== '' || sort !== '' || nested
  const [searchText, setSearchText] = useState(q)
  const filter = { q, sort, includeDescendants: nested }
  const [types, setTypes] = useState<ProjectEntityType[] | null>(null)
  const [typeId, setTypeId] = useState<string | null>(fixedTypeId ?? null)
  const [entries, setEntries] = useState<ProjectEntitySummary[] | null>(null)
  const [more, setMore] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // The main read's controller: loadMore and refresh share its signal so a filter change cancels them too.
  const readRef = useRef<AbortController | null>(null)
  const [adding, setAdding] = useState(false)

  function setFilter(changes: Record<string, string | null>) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value)
          else next.delete(key)
        }
        return next
      },
      { replace: true },
    )
  }

  function clearFilters() {
    setSearchText('')
    setFilter({ q: null, sort: null, nested: null })
  }

  // Typing waits for a pause before it reaches the address, and so the read, as Lore's search does.
  useEffect(() => {
    if (searchText === q) return
    const timer = setTimeout(() => setFilter({ q: searchText.trim() || null }), 150)
    return () => clearTimeout(timer)
  }, [searchText, q])

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
    readRef.current = controller

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
        ...filter,
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
          ...filter,
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
  }, [projectId, typeId, reloadKey, openEntryId, q, sort, nested])

  /** One more row than is shown is asked for, so whether another page exists is known without a count. */
  function showing(read: ProjectEntitySummary[], shown: number) {
    setEntries(read.slice(0, shown))
    setMore(read.length > shown)
  }

  function loadMore() {
    if (typeId === null || entries === null) return
    setBusy(true)
    // Tied to the main read's signal: a filter change aborts it, so a late page never lands on a newer list.
    const signal = readRef.current?.signal
    listProjectEntities(projectId, typeId, signal, {
      skip: entries.length,
      take: ENTRY_PAGE_SIZE + 1,
      ...filter,
    })
      .then((read) => {
        setBusy(false)
        if (signal?.aborted) return
        setEntries((current) => [...(current ?? []), ...read.slice(0, ENTRY_PAGE_SIZE)])
        setMore(read.length > ENTRY_PAGE_SIZE)
      })
      .catch((error: unknown) => failing(error, signal))
  }

  function refresh(notice: string | null = null) {
    if (typeId === null) return
    // A write re-reads as many rows as were already open, so the author keeps their place in a long list.
    const shown = Math.max(entries?.length ?? 0, ENTRY_PAGE_SIZE)
    const signal = readRef.current?.signal
    listProjectEntities(projectId, typeId, signal, { skip: 0, take: shown + 1, ...filter })
      .then((read) => {
        setBusy(false)
        // The write itself happened, so the parent is told even when a newer list has replaced this read.
        if (!signal?.aborted) {
          showing(read, shown)
          setFailed(notice)
        }
        onChanged?.()
      })
      .catch((error: unknown) => failing(error, signal))
  }

  function failing(error: unknown, signal?: AbortSignal) {
    setBusy(false)
    if (signal?.aborted) return
    setFailed(error instanceof Error ? error.message : t('projects.entries.failed'))
  }

  /**
   * Lore's head for one type (#196): the path back with the type's ancestors, the type's name, and New beside it. Every
   * state draws it, so the way back is there even when the type is gone.
   */
  const head = (
    title: ReactNode,
    ancestors: readonly ProjectEntityType[] = [],
    action?: ReactNode,
  ) => (
    <header className="projects__head">
      {crumb ? (
        <div className="pageheader__crumb projects__crumb">
          <span className="lore__path">
            {crumb}
            {ancestors.map((ancestor) => (
              <Fragment key={ancestor.id}>
                <span className="lore__pathsep" aria-hidden="true">
                  ›
                </span>
                <Link
                  to={`${pathname}?type=${ancestor.id}`}
                  data-testid="project-entities-path-type"
                >
                  <bdi>{ancestor.name}</bdi>
                </Link>
              </Fragment>
            ))}
          </span>
        </div>
      ) : null}
      <div className="projects__headtext">
        <h2 className="sectionrule">{title}</h2>
      </div>
      {action}
    </header>
  )

  if (types === null) {
    return <p className="projectcard__meta">{t('projects.common.loading')}</p>
  }

  if (types.length === 0) {
    return (
      <section className="projects" data-testid="project-entries">
        {head(t('projects.entries.title'))}
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
        {head(t('projects.entries.title'))}
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
  // The types above this one, each a link to its own list, as Lore's path reads above a type's list.
  const ancestors = (type && buildTypeTree(types).byId.get(type.id)?.path.slice(0, -1)) || []

  return (
    <section className="projects" data-testid="project-entries">
      {head(
        type ? <bdi>{type.name}</bdi> : t('projects.entries.title'),
        ancestors,
        <button
          className="button"
          type="button"
          aria-expanded={adding}
          aria-label={type ? t('lore.page.newTypeLabel', { name: type.name }) : undefined}
          data-testid="project-entry-add"
          onClick={() => setAdding((open) => !open)}
        >
          <ActionIcon icon={Plus} />
          <span className="lore__createlabel">
            {type
              ? tx('lore.page.newType', { type: <bdi>{type.name}</bdi> })
              : t('projects.entries.add')}
          </span>
        </button>,
      )}

      {failed ? (
        <p role="alert" data-testid="project-entries-failed">
          {failed}
        </p>
      ) : null}

      {fixedTypeId ? null : (
        <Field label={t('projects.entries.ofType')}>
          {(control) => (
            <select
              {...control}
              className="field__input"
              value={typeId ?? ''}
              onChange={(event) => {
                setTypeId(event.target.value)
              }}
              data-testid="project-entries-type"
            >
              {types.map((each) => (
                <option key={each.id} value={each.id}>
                  {each.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}

      {/*
       * Asked for rather than always open. Its fields are the chosen type's, so it sits under the type above it and
       * the author reads the type's name before the boxes that belong to it.
       */}
      {adding && typeId !== null ? (
        // Keyed by type: another type's fields start the form over rather than keep values that are not its own.
        <ProjectEntryForm
          key={typeId}
          projectId={projectId}
          universeId={universeId}
          entityTypeId={typeId}
          fields={fields}
          onSaved={(notice) => {
            setAdding(false)
            refresh(notice)
          }}
          onFailed={failing}
          onCancel={() => setAdding(false)}
        />
      ) : null}

      {typeId !== null ? (
        <div className="projects__filters" role="group" aria-label={t('lore.page.filtersGroup')}>
          <div className="lore__search">
            <label className="visually-hidden" htmlFor="project-entries-search">
              {t('lore.page.filterEntries')}
            </label>
            <ListFilter
              className="lore__searchicon"
              aria-hidden="true"
              focusable="false"
              strokeWidth={1.75}
            />
            <input
              id="project-entries-search"
              className="field__input lore__searchinput"
              type="search"
              placeholder={t('projects.entries.searchPlaceholder')}
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              data-testid="project-entries-search"
            />
          </div>
          <div className="lore__pagesize">
            <label className="lore__pagesizelabel" htmlFor="project-entries-sort">
              {t('lore.page.sortBy')}
            </label>
            <select
              id="project-entries-sort"
              className="field__input lore__pagesizeselect"
              value={sort}
              onChange={(event) => setFilter({ sort: event.target.value || null })}
              data-testid="project-entries-sort"
            >
              <option value="">{t('lore.page.sortName')}</option>
              <option value="updated">{t('lore.page.sortUpdated')}</option>
              <option value="created">{t('lore.page.sortCreated')}</option>
            </select>
          </div>
          {type && buildTypeTree(types).byId.get(type.id)?.children.length ? (
            <label className="check">
              <input
                type="checkbox"
                checked={nested}
                onChange={(event) => setFilter({ nested: event.target.checked ? '1' : null })}
                data-testid="project-entries-nested"
              />
              <span>{t('projects.entries.nested')}</span>
            </label>
          ) : null}
          {filtered ? (
            <button
              className="button button--text"
              type="button"
              onClick={clearFilters}
              data-testid="project-entries-clear"
            >
              <ActionIcon icon={X} />
              {t('lore.page.clearFilters')}
            </button>
          ) : null}
        </div>
      ) : null}

      {typeId !== null && entries === null ? (
        <p className="projectcard__meta">{t('projects.common.loading')}</p>
      ) : (entries ?? []).length === 0 && filtered ? (
        <EmptyState
          title={t('projects.entries.noMatch')}
          hint={t('projects.entries.noMatchHint')}
          testId="project-entries-no-match"
        />
      ) : (entries ?? []).length === 0 ? (
        <EmptyState
          title={t('projects.entries.empty')}
          hint={t('projects.entries.emptyHint')}
          testId="project-entries-empty"
        />
      ) : (
        <ul className="cardgrid lore__grid" data-testid="project-entry-list">
          {(entries ?? []).map((entry) => (
            <li
              key={entry.id}
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
              {/* Lore's card; with an `entryHref` the body is the link and the More menu stays outside it. */}
              <div className="entitycard entitycard--static">
                {(() => {
                  // The entry's own picture when it has one (#286), else the type's icon, exactly as Lore's card.
                  const body = (
                    <EntityCardBody
                      universeId={universeId}
                      entity={entry}
                      note={
                        entry.canonEntityName
                          ? t('projects.entries.canon', { name: entry.canonEntityName })
                          : undefined
                      }
                    />
                  )
                  return entryHref ? (
                    <Link
                      className="entitycard__link"
                      to={entryHref(entry)}
                      data-testid={`project-entry-open-${entry.id}`}
                    >
                      {body}
                    </Link>
                  ) : (
                    body
                  )
                })()}
                <div className="entitycard__actions">
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
 * The one entry form (#287): New on the list, and Edit on an entry's own screen. Edit starts from the stored entry and
 * saves it with its version, so a change made elsewhere in between is refused rather than overwritten. The type is
 * never changed here. A picture is not a value: on New it waits for the entry to exist, on Edit it is stored in place.
 */
export function ProjectEntryForm({
  projectId,
  universeId,
  entityTypeId,
  fields,
  entry,
  onSaved,
  onFailed,
  onCancel,
}: {
  projectId: string
  universeId: string
  entityTypeId: string
  fields: ProjectField[]
  /** Set for Edit; it carries the version and the canon link a save sends back. */
  entry?: ProjectEntityDetail
  /** After the save; the notice names any picture that could not be stored. */
  onSaved: (notice: string | null) => void
  onFailed: (error: unknown) => void
  onCancel: () => void
}) {
  useI18n()
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState(entry?.name ?? '')
  const [summary, setSummary] = useState(entry?.summary ?? '')
  const [values, setValues] = useState<Record<string, FieldValueInput>>(() =>
    entry ? valuesFromDetail(entry, fields) : {},
  )
  // An Image field's picture waits here until the entry exists, by field id: it is its own write after the create.
  const [pendingImages, setPendingImages] = useState<Record<string, PendingFieldImage>>({})
  const imageFieldIds = new Set(
    fields.filter((one) => one.kind === FieldKind.Image).map((one) => one.id),
  )
  const prefix = entry ? 'project-entry-edit' : 'project-entry-new'

  return (
    <form
      className="form"
      data-testid={prefix}
      onSubmit={(event) => {
        event.preventDefault()
        if (busy) return
        setBusy(true)
        const input = {
          entityTypeId,
          name,
          summary: summary.length > 0 ? summary : null,
          // The save replaces the link, so an edit sends the stored one back and never clears it by leaving it out.
          canonEntityId: entry?.canonEntityId ?? null,
          // A picture is never a value: it is uploaded below, once the entry has an id.
          fields: Object.values(values).filter((one) => !imageFieldIds.has(one.fieldDefinitionId)),
          expectedVersion: entry?.version ?? null,
        }
        ;(entry
          ? saveProjectEntity(projectId, entry.id, input)
          : createProjectEntity(projectId, input)
        )
          .then(async (saved) => {
            // Each picture is its own write and may fail on its own: the entry is already stored.
            const refused: string[] = []
            for (const [fieldId, held] of Object.entries(pendingImages)) {
              try {
                await setFieldImage(universeId, saved.id, fieldId, held.file, held.crop)
              } catch {
                refused.push(fields.find((one) => one.id === fieldId)?.name ?? '')
              }
            }
            onSaved(
              refused.length > 0
                ? t('entity.fieldImage.uploadFailed', { name: refused.join(', ') })
                : null,
            )
          })
          .catch((error: unknown) => {
            setBusy(false)
            onFailed(error)
          })
      }}
    >
      <Field label={t('projects.entries.name')}>
        {(control) => (
          <input
            {...control}
            className="field__input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            data-testid={`${prefix}-name`}
            required
          />
        )}
      </Field>

      <Field label={t('projects.entries.summary')}>
        {(control) => (
          <input
            {...control}
            className="field__input"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            data-testid={`${prefix}-summary`}
          />
        )}
      </Field>

      {fields.length > 0 ? (
        <h4 className="sectionrule sectionrule--accent">{t('projects.entries.values')}</h4>
      ) : null}

      {fields.map((field) =>
        field.kind === FieldKind.Image ? (
          <FieldImageInput
            key={field.id}
            universeId={universeId}
            entityId={entry?.id ?? null}
            fieldId={field.id}
            name={field.name}
            shape={field.imageShape}
            image={entry?.fieldImages.find((one) => one.fieldId === field.id) ?? null}
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
        <button className="button" type="submit" disabled={busy} data-testid={`${prefix}-save`}>
          {busy
            ? t('projects.entries.saving')
            : entry
              ? t('projects.entries.saveEdit')
              : t('projects.entries.add')}
        </button>
        <button
          className="button button--secondary"
          type="button"
          onClick={onCancel}
          data-testid={`${prefix}-cancel`}
        >
          {t('projects.common.cancel')}
        </button>
      </div>
    </form>
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
      <Field
        label={`${field.name}${field.isRequired ? ' *' : ''}`}
        group="fieldset"
        data-testid={testId}
      >
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
      </Field>
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
    <Field label={`${field.name}${field.isRequired ? ' *' : ''}`}>
      {(control) =>
        field.kind === FieldKind.LongText ? (
          <textarea
            {...control}
            className="field__input"
            value={current.text ?? ''}
            data-testid={testId}
            onChange={(event) => onChange({ ...blank, text: event.target.value })}
          />
        ) : (
          <input
            {...control}
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
        )
      }
    </Field>
  )
}
