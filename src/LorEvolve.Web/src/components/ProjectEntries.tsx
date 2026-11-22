import type { ReactNode } from 'react'
import { CardSkeleton } from './CardSkeleton'
import { Crumb, type CrumbItem } from './Crumb'
import { PageHeader } from './PageHeader'
import { Section } from './Section'
import { Field } from './Field'
import { useLocation } from 'react-router-dom'
import {
  FieldKind,
  type ProjectEntitySummary,
  type ProjectEntityType,
  type ProjectField,
} from '../projectEntities/types'
import { buildTypeTree } from '../lore/typeTree'
import { EmptyState } from './EmptyState'
import { t, tx, useI18n } from '../i18n'
import { useProjectEntriesState } from '../projectEntities/useProjectEntriesState'
import { useProjectEntriesRead } from '../projectEntities/useProjectEntriesRead'
import { ProjectEntriesFilters } from './projectEntities/ProjectEntriesFilters'
import { ProjectEntryList } from './projectEntities/ProjectEntryList'
import { ProjectEntryForm } from './ProjectEntryForm'
import { ShowMore } from './ShowMore'
import { NewButton } from './NewButton'
import { FormMessage } from './FormMessage'

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
  startAdding = false,
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
  crumb?: CrumbItem
  /** Where an entry's card opens (#286); unset, a card is static as it was (#196). */
  entryHref?: (entry: ProjectEntitySummary) => string
  /** Open the new entry form at once: the Entities screen's New entry chose this type (`&add=1`). */
  startAdding?: boolean
}) {
  useI18n()
  const { pathname } = useLocation()
  // Lore's head for one type: the path back with the type's ancestors, the type's name, and its action.
  const head = (
    title: ReactNode,
    ancestors: readonly ProjectEntityType[] = [],
    action?: ReactNode,
  ) => (
    <PageHeader
      level={2}
      size="panel"
      crumb={
        crumb ? (
          <Crumb
            items={[
              crumb,
              ...ancestors.map((ancestor) => ({
                to: `${pathname}?type=${ancestor.id}`,
                label: <bdi>{ancestor.name}</bdi>,
                testId: 'project-entities-path-type',
              })),
            ]}
          />
        ) : undefined
      }
      title={title}
      actions={action}
    />
  )
  const state = useProjectEntriesState({ startAdding, fixedTypeId })
  const {
    sort,
    nested,
    filtered,
    searchText,
    setSearchText,
    types,
    typeId,
    setTypeId,
    entries,
    more,
    failed,
    busy,
    setBusy,
    adding,
    setAdding,
  } = state
  const { setFilter, clearFilters, loadMore, loadingMore, refresh, failing } =
    useProjectEntriesRead({
      ...state,
      projectId,
      fixedTypeId,
      openEntryId,
      reloadKey,
      onChanged,
    })

  if (types === null) {
    return (
      <CardSkeleton shape="tile" className="lore__grid" announce={t('projects.common.loading')} />
    )
  }

  if (types.length === 0) {
    return (
      <Section testId="project-entries">
        {head(t('projects.entries.title'))}
        <EmptyState
          title={t('projects.entries.needsType')}
          hint={t('projects.entries.needsTypeHint')}
          testId="project-entries-needs-type"
        />
      </Section>
    )
  }

  if (fixedTypeId && !types.some((each) => each.id === fixedTypeId)) {
    return (
      <Section testId="project-entries">
        {head(t('projects.entries.title'))}
        <EmptyState
          title={t('projects.entries.typeMissing')}
          hint={t('projects.entries.typeMissingHint')}
          testId="project-entries-type-missing"
        />
      </Section>
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
    <Section testId="project-entries">
      {head(
        type ? <bdi>{type.name}</bdi> : t('projects.entries.title'),
        ancestors,
        <NewButton
          aria-expanded={adding}
          aria-label={type ? t('lore.page.newTypeLabel', { name: type.name }) : undefined}
          data-testid="project-entry-add"
          onClick={() => setAdding((open) => !open)}
        >
          <span className="lore__createlabel">
            {type
              ? tx('lore.page.newType', { type: <bdi>{type.name}</bdi> })
              : t('projects.entries.add')}
          </span>
        </NewButton>,
      )}

      {failed ? <FormMessage testId="project-entries-failed">{failed}</FormMessage> : null}

      {fixedTypeId ? null : (
        <Field
          as="select"
          label={t('projects.entries.ofType')}
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

      <ProjectEntriesFilters
        sort={sort}
        nested={nested}
        filtered={filtered}
        searchText={searchText}
        setSearchText={setSearchText}
        types={types}
        typeId={typeId}
        setFilter={setFilter}
        clearFilters={clearFilters}
        type={type}
      />
      {typeId !== null && entries === null ? (
        <CardSkeleton shape="tile" className="lore__grid" announce={t('projects.common.loading')} />
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
        <ProjectEntryList
          projectId={projectId}
          universeId={universeId}
          openEntryId={openEntryId}
          entryHref={entryHref}
          entries={entries}
          busy={busy}
          setBusy={setBusy}
          refresh={refresh}
          failing={failing}
          fields={fields}
          imageFieldIds={imageFieldIds}
        />
      )}
      <ShowMore
        align="start"
        hasMore={more}
        status={loadingMore ? 'loading' : 'idle'}
        disabled={busy}
        onMore={loadMore}
        testId="project-entries-more"
      />
    </Section>
  )
}

/**
 * The one entry form (#287): New on the list, and Edit on an entry's own screen. Edit starts from the stored entry and
 * saves it with its version, so a change made elsewhere in between is refused rather than overwritten. The type is
 * never changed here. A picture is not a value: on New it waits for the entry to exist, on Edit it is stored in place.
 */
