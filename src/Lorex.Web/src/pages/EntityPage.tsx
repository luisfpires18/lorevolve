import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Link,
  NavLink,
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import { Check, FilePenLine, Maximize2, Network, Pencil, Trash, X } from 'lucide-react'
import { ActionIcon } from '../components/ActionIcon'
import { ActionMenu } from '../components/ActionMenu'
import { ReviewComments } from '../components/ReviewComments'
import { ContentPublication } from '../components/ContentPublication'
import { EntityArticleSection } from '../components/EntityArticle'
import { ChangeList, EditConflict } from '../components/EditConflict'
import { EntityHistory } from '../components/EntityHistory'
import { EntityImageField, type PendingImage } from '../components/EntityImageField'
import { FieldInput } from '../components/FieldInputs'
import { ImageViewer } from '../components/ImageViewer'
import { NameList } from '../components/NameList'
import { ProgressionView } from '../components/ProgressionView'
import { RelationshipSection } from '../components/RelationshipSection'
import { emptyValue } from '../lore/document'
import { entityImageUrl, setEntityImage } from '../lore/images'
import { TokenInput } from '../components/TokenInput'
import { TypeIcon } from '../components/TypeIcon'
import { blockingFindingsOf } from '../canon/blocked'
import type { CanonBlockingFinding } from '../canon/types'
import type { Chronology } from '../chronology/types'
import { CanonBlockNotice } from '../components/CanonBlockNotice'
import { ApiError } from '../lib/api'
import { formatDate } from '../lib/dates'
import { differing, isChangedElsewhere, type Change } from '../lib/editConflict'
import { useLeaveGuard } from '../lib/leaveGuard'
import {
  createEntity,
  deleteEntity,
  ENTRY_CHANGED,
  getEntity,
  listEntityTypes,
  updateEntity,
} from '../lore/api'
import {
  CANON_LABELS,
  CANON_ORDER,
  CanonStatus,
  type CanonStatusValue,
  type EntityDetail,
  type EntityType,
  type FieldValueInput,
} from '../lore/types'
import { renderFact } from '../lore/facts'
import { typeChoices } from '../lore/typeTree'
import { StatusBadge } from '../components/StatusBadge'
import { suggestEntryChanges } from '../suggestions/api'
import { useUniverseAccess } from '../universes/access'
import type { WorkspaceContext } from './UniverseWorkspace'
import { EmptyState } from '../components/EmptyState'
import { confirmAction } from '../lib/confirm'

interface Draft {
  entityTypeId: string
  name: string
  summary: string
  canonStatus: CanonStatusValue
  aliases: string[]
  tags: string[]
  fields: Record<string, FieldValueInput>
}

/** What the entry form edits, as an entry or a suggestion holds it (task 045). */
type EntryFields = Pick<
  EntityDetail,
  | 'entityTypeId'
  | 'entityTypeName'
  | 'name'
  | 'summary'
  | 'canonStatus'
  | 'aliases'
  | 'tags'
  | 'fields'
>

function draftFromDetail(detail: EntryFields): Draft {
  const fields: Record<string, FieldValueInput> = {}
  for (const value of detail.fields) {
    fields[value.fieldDefinitionId] = {
      fieldDefinitionId: value.fieldDefinitionId,
      text: value.text,
      number: value.number,
      boolean: value.boolean,
      date: value.date,
      optionIds: value.optionIds,
      referencedEntityId: value.referencedEntityId,
      eraId: value.eraId,
    }
  }

  return {
    entityTypeId: detail.entityTypeId,
    name: detail.name,
    summary: detail.summary ?? '',
    canonStatus: detail.canonStatus,
    aliases: detail.aliases,
    tags: detail.tags,
    fields,
  }
}

/** How long the article stays marked after a link lands on it - the story page's scene and beat mark, for the same reason. */
const ARRIVAL_MS = 2400

/**
 * Which of the entry's three views is open. Read from the address and written back to it, never held
 * as page state: each one is a place, so it reloads, it is linkable, and Back leaves it (ADR 0028).
 */
type EntryView = 'article' | 'progression' | 'relations' | 'history'

/**
 * One entry, under one header, at three addresses.
 *
 * The header is the whole identity and every action on the entry itself: the type it is, the Canon status it
 * holds, and Edit, Family tree and Move to Trash - all of it above the article, so none of it depends on how
 * long the entry has grown. Under it the entry's own navigation, which is three ordinary links rather than a
 * tablist, because each view is a separate address that the browser's Back, a reload and a shared link all
 * have to land on.
 *
 * Article is the default and carries the picture, the structured facts beside it and the prose, with the
 * article's own history under it. Relations is every link this entry has, and History is the versions of its
 * details - a boundary the domain draws and this page keeps: an article's versions are the article's.
 *
 * Nothing about any of this reads the entry's type. A Character, a Location and a type an author invented
 * this morning are the same screen.
 */
export default function EntityPage({ view = 'article' }: { view?: EntryView }) {
  const { universe, chronology } = useOutletContext<WorkspaceContext>()
  const access = useUniverseAccess()
  const { entityId } = useParams<{ entityId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  // A new entry opened from a Lore type (`lore/new?type=<id>`) starts in that type; the author can
  // still change it. Read by id only, and only if this universe has that type.
  const [searchParams] = useSearchParams()
  const startingTypeId = searchParams.get('type')

  const isNew = entityId === undefined
  const [types, setTypes] = useState<EntityType[]>([])
  const [typesRead, setTypesRead] = useState(false)
  const [detail, setDetail] = useState<EntityDetail | null>(null)
  const [editedDraft, setDraft] = useState<Draft | null>(null)
  const [isFormOpen, setIsEditing] = useState(isNew)
  // The form is open to send a suggestion rather than to save (task 045): the entry itself is not changed.
  const [isSuggesting, setIsSuggesting] = useState(false)
  // A suggestion just sent from here, said where it can be seen.
  const [sent, setSent] = useState(false)

  // The entry's form belongs to the Article view - it edits what that view shows. Deriving this rather
  // than clearing it on a view change is what makes the browser's Back honest: going back to Relations
  // shows Relations, and coming forward again finds the form exactly as it was left.
  const isEditing = isFormOpen && view === 'article'
  const suggesting = isEditing && isSuggesting && !isNew
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>(
    isNew ? 'ready' : 'loading',
  )
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<CanonBlockingFinding[] | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // The form's save was refused because the entry was saved somewhere else while it was open (ADR 0043). The form keeps
  // every unsaved change until the author has reviewed the latest and chosen.
  const [conflict, setConflict] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const saveButton = useRef<HTMLButtonElement>(null)

  // While the article is being written it has its own save bar, and the entry's actions step aside for it: one
  // editor, and one bar at the foot of a phone's screen, at a time.
  const [isWritingArticle, setIsWritingArticle] = useState(false)

  /** An article save touched the entry: the rail's "last changed" says so without reading the entry again. */
  const articleSaved = useCallback((updatedAt: string) => {
    setDetail((current) => (current ? { ...current, updatedAt } : current))
  }, [])

  // A new entry's picture, and the square its author framed, wait here until the entry exists.
  // Object keys are built from the entry's id, so there is nowhere to put it before the create
  // call comes back - and inventing a temporary path would mean writing objects nobody would ever
  // come back to clean up.
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null)

  // Bumped after every accepted write, so the history reloads without either component
  // holding the other's state.
  const [historyKey, setHistoryKey] = useState(0)

  // The full picture is page state, not an address: opening it is never a step Back has to undo.
  const [isViewing, setIsViewing] = useState(false)
  const expandButton = useRef<HTMLButtonElement>(null)

  // Back to the button that opened it, once the viewer has gone - after the dialog's own close, which
  // would otherwise have the last word on where the focus lands.
  const wasViewing = useRef(false)
  useEffect(() => {
    if (wasViewing.current && !isViewing) expandButton.current?.focus()
    wasViewing.current = isViewing
  }, [isViewing])

  useEffect(() => {
    const controller = new AbortController()

    listEntityTypes(universe.id, controller.signal)
      .then((loadedTypes) => {
        setTypes(loadedTypes)
        setTypesRead(true)
      })
      .catch(() => {
        /* The page still works without the types; a link field searches for itself. */
      })

    return () => {
      controller.abort()
    }
  }, [universe.id])

  useEffect(() => {
    if (isNew) return

    const controller = new AbortController()
    getEntity(universe.id, entityId, controller.signal)
      .then((loaded) => {
        setDetail(loaded)
        setDraft(draftFromDetail(loaded))
        setStatus('ready')
        setSent(false)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setStatus((error as { status?: number }).status === 404 ? 'missing' : 'error')
      })

    return () => {
      controller.abort()
    }
  }, [universe.id, entityId, isNew])

  // A new entry's blank draft is derived from the first available type rather than
  // written back into state, so nothing has to re-render to produce it.
  const blankDraft = useMemo((): Draft | null => {
    if (!isNew || types.length === 0) return null
    return {
      entityTypeId: types.find((type) => type.id === startingTypeId)?.id ?? types[0].id,
      name: '',
      summary: '',
      canonStatus: CanonStatus.Idea,
      aliases: [],
      tags: [],
      fields: {},
    } satisfies Draft
  }, [isNew, types, startingTypeId])
  const draft = editedDraft ?? blankDraft

  const selectedType = useMemo(
    () => types.find((type) => type.id === draft?.entityTypeId) ?? null,
    [types, draft?.entityTypeId],
  )

  const offersFamilyTree =
    !!detail &&
    (detail.hasFamilyConnections ||
      !!types.find((type) => type.id === detail.entityTypeId)?.familyTreeOffered)

  // Whether the open form differs from what is stored, or for a new entry from the blank form - said in the
  // form's bar, in words, and asked about before the author leaves it. A change put back is no change. A new
  // entry's framed picture waits in the form, so it counts; an existing entry's picture is written the moment
  // it is framed, so there is nothing of it to lose.
  const isDirty = useMemo(() => {
    const baseline = isNew ? blankDraft : detail ? draftFromDetail(detail) : null
    if (!isFormOpen || draft === null || baseline === null) return false
    if (isNew && pendingImage !== null) return true
    return comparable(draft, types) !== comparable(baseline, types)
  }, [isFormOpen, isNew, blankDraft, detail, draft, types, pendingImage])

  /** Lets the form's changes go and closes it: Cancel, or the author choosing to leave. */
  const discard = useCallback(() => {
    setDraft(detail ? draftFromDetail(detail) : null)
    setPendingImage(null)
    setIsEditing(false)
    setIsSuggesting(false)
    setMessage(null)
    setFieldErrors({})
    setBlocked(null)
    setConflict(false)
  }, [detail])

  useLeaveGuard(
    !isDirty
      ? null
      : isNew
        ? 'This new entry has not been created. Leave without saving it?'
        : isSuggesting
          ? `Your suggestion for “${detail?.name ?? 'this entry'}” hasn’t been sent. Leave without sending it?`
          : `“${detail?.name ?? 'This entry'}” has unsaved changes. Leave without saving them?`,
    discard,
  )

  // A link to `#article` - a search result whose words were in the article - lands on it once the entry is on screen:
  // scrolled to, the focus on its heading, and marked for a moment. The entry's id and the location's key run it again for
  // another entry, or the same link followed twice.
  const arrivedFor = status === 'ready' ? (detail?.id ?? null) : null
  useEffect(() => {
    if (arrivedFor === null || location.hash !== '#article') return
    const target = document.getElementById('article')
    if (!target) return

    target.scrollIntoView({ block: 'start' })
    target.querySelector<HTMLElement>('[data-arrival-focus]')?.focus({ preventScroll: true })
    target.setAttribute('data-arrived', 'true')
    const timer = window.setTimeout(() => target.removeAttribute('data-arrived'), ARRIVAL_MS)

    return () => {
      window.clearTimeout(timer)
      target.removeAttribute('data-arrived')
    }
  }, [arrivedFor, location.hash, location.key])

  const save = useCallback(async () => {
    if (!draft) return

    setMessage(null)
    setFieldErrors({})
    setBlocked(null)
    setConflict(false)
    setIsSaving(true)

    const definitions = selectedType?.fields ?? []
    const input = {
      entityTypeId: draft.entityTypeId,
      name: draft.name.trim(),
      summary: draft.summary.trim() ? draft.summary.trim() : null,
      canonStatus: draft.canonStatus,
      aliases: draft.aliases,
      tags: draft.tags,
      fields: definitions.map(
        (definition) => draft.fields[definition.id] ?? emptyValue(definition),
      ),
      // The version the form was opened on - or the latest the author reviewed after a refusal.
      expectedVersion: detail?.version,
    }

    try {
      if (isSuggesting && !isNew) {
        // Sent for review, not saved: the entry on screen is still the stored one, so the form simply closes on it.
        await suggestEntryChanges(universe.id, entityId, input)
        setDraft(detail ? draftFromDetail(detail) : null)
        setIsEditing(false)
        setIsSuggesting(false)
        setSent(true)
        return
      }

      const saved = isNew
        ? await createEntity(universe.id, input)
        : await updateEntity(universe.id, entityId, input)

      // The entry exists now, so the picture that was waiting has somewhere to go. It is a
      // separate write and it is allowed to fail on its own: the lore is already stored, so a
      // refused image says so and leaves everything else alone.
      let image = saved.image
      if (isNew && pendingImage) {
        try {
          image = await setEntityImage(universe.id, saved.id, pendingImage.file, pendingImage.crop)
          setPendingImage(null)
        } catch (failure: unknown) {
          setMessage(
            failure instanceof ApiError
              ? (failure.fieldErrors.file ?? failure.message)
              : 'The entry was created, but its image could not be uploaded.',
          )
        }
      }

      const stored = { ...saved, image }

      setDetail(stored)
      setDraft(draftFromDetail(stored))
      setIsEditing(false)
      setHistoryKey((key) => key + 1)

      if (isNew) {
        await navigate(`/app/universes/${universe.id}/lore/${saved.id}`, { replace: true })
      }
    } catch (error: unknown) {
      // A refusal from the promotion gate is not a save failure to report in one line:
      // the draft is still on screen and still editable, and the findings say why.
      const blocking = blockingFindingsOf(error)
      if (blocking) {
        setBlocked(blocking)
      } else if (isChangedElsewhere(error, ENTRY_CHANGED)) {
        setConflict(true)
      } else if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors)
        setMessage(
          Object.keys(error.fieldErrors).length === 0
            ? error.message
            : isSuggesting
              ? 'Some details need a change before this can be sent.'
              : 'Some details need a change before this can be saved.',
        )
      } else {
        setMessage(isSuggesting ? 'That suggestion couldn’t be sent.' : 'That could not be saved.')
      }
    } finally {
      setIsSaving(false)
    }
  }, [
    draft,
    selectedType,
    isNew,
    universe.id,
    entityId,
    navigate,
    pendingImage,
    detail,
    isSuggesting,
  ])

  /**
   * The one-click promotion, which saves on the spot rather than through the editor.
   *
   * It is a gated write like any other, so a refusal has to read as one: the same notice
   * the edit form shows, and the step the author had before, because nothing moved. The
   * optimistic step is rolled back on any failure - leaving it pressed would claim a
   * status the server refused.
   */
  async function changeCanon(next: CanonStatusValue) {
    if (!draft) return
    const previous = draft.canonStatus
    const updated = { ...draft, canonStatus: next }
    setDraft(updated)

    if (isNew || isEditing) return

    setMessage(null)
    setBlocked(null)
    setIsSaving(true)
    try {
      const definitions = selectedType?.fields ?? []
      const saved = await updateEntity(universe.id, entityId, {
        entityTypeId: updated.entityTypeId,
        name: updated.name,
        summary: updated.summary.trim() ? updated.summary.trim() : null,
        canonStatus: next,
        aliases: updated.aliases,
        tags: updated.tags,
        fields: definitions.map(
          (definition) => updated.fields[definition.id] ?? emptyValue(definition),
        ),
        expectedVersion: detail?.version,
      })
      setDetail(saved)
      setDraft(draftFromDetail(saved))
      setHistoryKey((key) => key + 1)
    } catch (error: unknown) {
      setDraft({ ...updated, canonStatus: previous })

      const blocking = blockingFindingsOf(error)
      if (blocking) {
        setBlocked(blocking)
      } else if (isChangedElsewhere(error, ENTRY_CHANGED) && entityId !== undefined) {
        // Nothing unsaved is at stake here: the page reads the entry as it now is, and the author chooses again.
        try {
          const latest = await getEntity(universe.id, entityId)
          setDetail(latest)
          setDraft(draftFromDetail(latest))
          setHistoryKey((key) => key + 1)
        } catch {
          /* The message below still holds; the page shows what it last read. */
        }
        setMessage(
          'This entry changed after you opened it, so the status wasn’t changed. It now shows the latest version. Choose the status again if you still want it.',
        )
      } else {
        setMessage('The status could not be changed.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  /**
   * The author has seen the latest entry and keeps their own changes: the form stays exactly as it is, now measured against
   * the latest - and the next save names the version they reviewed, so it is refused again if that moved on too.
   */
  function keepMine(latest: EntityDetail) {
    setDetail(latest)
    setConflict(false)
    setHistoryKey((key) => key + 1)
    setAnnouncement('Your changes are still unsaved. Save when you’re ready.')
    requestAnimationFrame(() => saveButton.current?.focus())
  }

  /** Lets the form's unsaved changes go for the latest entry, and keeps the form open on it. The notice has already asked. */
  function takeLatest(latest: EntityDetail) {
    setDetail(latest)
    setDraft(draftFromDetail(latest))
    setConflict(false)
    setHistoryKey((key) => key + 1)
    requestAnimationFrame(() => saveButton.current?.focus())
  }

  /** After a restore the stored lore is a version the page has not seen. Read it back. */
  /**
   * Reads the entry again without touching the entry form: saving its eras changes when it was worked on and whether it has
   * eras, never what the form edits, and the form may hold unsaved work while another view is open.
   */
  async function refreshDetail() {
    if (entityId === undefined) return
    setDetail(await getEntity(universe.id, entityId))
  }

  async function reloadAfterRestore() {
    if (entityId === undefined) return

    const loaded = await getEntity(universe.id, entityId)
    setDetail(loaded)
    setDraft(draftFromDetail(loaded))
    setHistoryKey((key) => key + 1)
  }

  /**
   * Moves the entry to the Trash. Nothing is destroyed, and the wording says so: the article,
   * the fields, the history and every connection stay stored, and Trash restores them whole.
   */
  async function moveToTrash() {
    if (isNew) return
    const trashed = await confirmAction({
      title: 'Move this entry to the Trash?',
      message:
        'It leaves your lore, your search and your pickers, but nothing is erased. Its article, fields, history and connections are kept, and you can restore it from Trash at any time.',
      confirmLabel: 'Move to Trash',
      busyLabel: 'Moving…',
      variant: 'warning',
      failure: 'This entry could not be moved to the Trash.',
      action: () => deleteEntity(universe.id, entityId),
    })
    if (trashed) await navigate(`/app/universes/${universe.id}/trash`, { replace: true })
  }

  // Order matters here. A load that failed leaves the draft null, so a loading guard placed
  // first would answer "Opening…" forever instead of saying what happened - which is now an
  // ordinary thing to hit, because a link to an entry since moved to the Trash answers 404.
  if (status === 'missing') {
    return (
      <EmptyState
        testId="entity-missing"
        title="That entry is not here."
        hint={
          <>
            {access.manageTrash ? (
              <>
                It may be in the <Link to={`/app/universes/${universe.id}/trash`}>Trash</Link>,
                where it can be restored.{' '}
              </>
            ) : (
              'It may have been moved to the Trash. '
            )}
            <Link to={`/app/universes/${universe.id}/lore`}>Back to the lore</Link>
          </>
        }
      />
    )
  }

  // Types are the author's, and a world may have none left. A new entry has to be one of them, so say so rather than
  // waiting for a type that will not come.
  if (isNew && typesRead && types.length === 0) {
    return (
      <EmptyState
        testId="entity-no-types"
        title="This world has no types yet."
        hint="Every entry is one of its world's types. Add one, then write the entry."
        action={
          <Link className="button" to={`/app/universes/${universe.id}/types`}>
            Go to Types
          </Link>
        }
      />
    )
  }

  if (status === 'loading' || !draft) {
    return (
      <p className="notice" role="status">
        Opening…
      </p>
    )
  }

  if (status === 'error') {
    return (
      <p className="notice notice--error" role="alert">
        This entry could not be opened.
      </p>
    )
  }

  const accent = selectedType?.accentColor ?? undefined
  const entryPath = `/app/universes/${universe.id}/lore/${entityId}`

  /**
   * Starts the entry's own form, from whichever view the author pressed Edit on.
   *
   * The form edits what the Article view shows - the picture, the facts, the summary - so it opens there.
   * A move from Relations or History is an ordinary navigation, so anything unsaved has already been asked
   * about by the time this runs.
   */
  function startEditing() {
    setIsSuggesting(false)
    setSent(false)
    setIsEditing(true)
    if (view !== 'article') void navigate(entryPath)
  }

  /** The same form, to send a suggestion rather than save (task 045). */
  function startSuggesting() {
    setIsSuggesting(true)
    setSent(false)
    setIsEditing(true)
    if (view !== 'article') void navigate(entryPath)
  }

  return (
    <article
      className="entry"
      style={accent ? { ['--entry-accent' as string]: accent } : undefined}
    >
      <header className="entry__head">
        <div className="entry__kind">
          <nav className="entry__crumbs" aria-label="Breadcrumb">
            {/* Lore lists nothing until a type is chosen, so the way back is to this entry's own type. */}
            <Link
              to={`/app/universes/${universe.id}/lore?type=${detail?.entityTypeId ?? draft.entityTypeId}`}
            >
              Lore
            </Link>
          </nav>

          {isEditing ? (
            <select
              className="field__input field__input--select entry__typepick"
              aria-label="Entry type"
              value={draft.entityTypeId}
              onChange={(event) =>
                setDraft({ ...draft, entityTypeId: event.target.value, fields: {} })
              }
            >
              {typeChoices(types).map(({ type, label }) => (
                <option key={type.id} value={type.id}>
                  {label}
                </option>
              ))}
            </select>
          ) : (
            // Back to the Lore list at this entry's type, by the type's id.
            <Link
              className="entry__type"
              to={`/app/universes/${universe.id}/lore?type=${detail?.entityTypeId ?? draft.entityTypeId}`}
              style={
                selectedType?.accentColor
                  ? { ['--type-accent' as string]: selectedType.accentColor }
                  : undefined
              }
              data-testid="entry-type"
            >
              <TypeIcon iconKey={selectedType?.icon ?? null} className="entry__typeicon" />
              <bdi>{detail?.entityTypeName ?? selectedType?.name}</bdi>
            </Link>
          )}

          {/* How settled the entry is, changed in one press. A choice, not an action: the chosen step is
              raised paper with its glyph and word, never a filled block louder than the name. */}
          {access.editContent || isNew || suggesting ? (
            <div className="canon" role="group" aria-label="Canon status">
              {CANON_ORDER.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="canon__step"
                  aria-pressed={draft.canonStatus === option}
                  data-canon={option}
                  disabled={isSaving}
                  onClick={() => changeCanon(option)}
                  data-testid={`canon-${CANON_LABELS[option].toLowerCase()}`}
                >
                  {CANON_LABELS[option]}
                </button>
              ))}
            </div>
          ) : (
            // Read only: the status, stated, with nothing to press.
            <StatusBadge
              step={draft.canonStatus}
              label={CANON_LABELS[draft.canonStatus]}
              testId="entry-canon-status"
            />
          )}
        </div>

        {isEditing ? (
          // The screen still has its one heading while the name is a field.
          <h1 className="visually-hidden">
            {isNew ? (
              'New entry'
            ) : suggesting ? (
              <>
                Suggesting changes to <bdi>{detail?.name}</bdi>
              </>
            ) : (
              <>
                Editing <bdi>{detail?.name}</bdi>
              </>
            )}
          </h1>
        ) : null}
        {isEditing ? (
          <input
            className="entry__nameinput"
            aria-label="Name"
            placeholder="Name this"
            dir="auto"
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        ) : (
          <h1 className="entry__name titlerule" data-testid="entry-name">
            <bdi>{detail?.name}</bdi>
          </h1>
        )}
        {fieldErrors.name ? <p className="field__error">{fieldErrors.name}</p> : null}

        {!isEditing && (detail?.aliases.length ?? 0) > 0 ? (
          <p className="entry__aliases" data-testid="entry-aliases">
            also known as <NameList names={detail!.aliases} />
          </p>
        ) : null}

        {isEditing ? (
          <textarea
            className="entry__summaryinput"
            aria-label="Summary"
            rows={2}
            placeholder="One or two lines that say what this is."
            value={draft.summary}
            onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
          />
        ) : detail?.summary ? (
          <p className="entry__summary prose" data-testid="entry-summary">
            {detail.summary}
          </p>
        ) : null}
      </header>

      {/* One bar under the identity: where in the entry you are, and what you can do to the entry itself -
          Edit first, Family tree beside it, and everything that manages rather than reads in the ⋯ menu,
          Move to Trash last. Not drawn while the entry's own form is open, nor while the article is
          being written: one editor, and one set of tools, at a time. Comments sit just after the views, where a
          phone's views line has room the tools line does not. */}
      {!isNew && !isEditing ? (
        <div className="entry__bar">
          <div className="entry__lenses">
            <nav className="views" aria-label="Entry views" data-testid="entry-views">
              <NavLink to={entryPath} end className="views__link" data-testid="entry-view-article">
                Article
              </NavLink>
              {/* An entry's eras (Issue #30): offered to whoever can add one, and to everyone once it has any. */}
              {access.editContent || detail?.hasProgression ? (
                <NavLink
                  to={`${entryPath}/progression`}
                  className="views__link"
                  data-testid="entry-view-progression"
                >
                  Eras
                </NavLink>
              ) : null}
              <NavLink
                to={`${entryPath}/relations`}
                className="views__link"
                data-testid="entry-view-relations"
              >
                Relations
              </NavLink>
              {access.manageHistory ? (
                <NavLink
                  to={`${entryPath}/history`}
                  className="views__link"
                  data-testid="entry-view-history"
                >
                  History
                </NavLink>
              ) : null}
            </nav>
            {isWritingArticle ? null : (
              <ReviewComments
                universeId={universe.id}
                subject={{ kind: 'entry', entityId: entityId! }}
                subjectName={detail?.name ?? ''}
                describeSuggestion={(before: EntryFields, proposed: EntryFields) =>
                  entryChanges(before, draftFromDetail(proposed), types, chronology, proposed)
                }
                onSuggestionAccepted={() => void reloadAfterRestore()}
                onSuggest={startSuggesting}
              />
            )}
          </div>

          {isWritingArticle ? null : (
            <div className="entry__tools">
              {/* Whether the entry is public, said in a word, and the way to change it - before Edit, because it is
                  state the author should see on arrival, not a tool buried in the menu. */}
              {access.publish ? (
                <ContentPublication
                  key={entityId}
                  universeId={universe.id}
                  kind="entry"
                  id={entityId!}
                  name={detail?.name ?? ''}
                  placement="bar"
                />
              ) : null}
              {access.editContent ? (
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={startEditing}
                  disabled={isSaving}
                  data-testid="edit-entity"
                >
                  <ActionIcon icon={Pencil} />
                  Edit
                </button>
              ) : access.suggestChanges ? (
                // A Reviewer's way into the same form, where an Editor's Edit stands. Its icon alone on a phone.
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={startSuggesting}
                  title="Suggest changes"
                  data-testid="suggest-entity"
                >
                  <ActionIcon icon={FilePenLine} />
                  <span className="entry__toollabel">Suggest changes</span>
                </button>
              ) : null}
              {/* Offered on an entry whose type the author enabled for Family Tree, and on any entry
                  already holding a family link - never decided by what the type is called (ADR 0040).
                  Its icon alone on a phone, still named, so the tools keep to one line. */}
              {offersFamilyTree ? (
                <Link
                  className="button button--text"
                  to={`/app/universes/${universe.id}/family-tree/${entityId}`}
                  title="Family tree"
                  data-testid="entity-family-tree"
                >
                  <ActionIcon icon={Network} />
                  <span className="entry__toollabel">Family tree</span>
                </Link>
              ) : null}
              {access.manageTrash ? (
                <ActionMenu
                  label={`More actions for ${detail?.name ?? 'this entry'}`}
                  triggerTestId="entity-actions"
                >
                  <button
                    className="actionmenu__item actionmenu__item--danger"
                    type="button"
                    onClick={() => void moveToTrash()}
                    disabled={isSaving}
                    data-testid="trash-entity"
                  >
                    <ActionIcon icon={Trash} />
                    Move to Trash
                  </button>
                </ActionMenu>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {blocked ? (
        // A blocked creation names an entry that was rolled back, so its ids lead
        // nowhere. Only an edit of something already stored can be linked.
        <CanonBlockNotice universeId={universe.id} findings={blocked} linkSubjects={!isNew} />
      ) : null}

      {message ? (
        <p className="form__message" role="alert" data-testid="entry-error">
          {message}
        </p>
      ) : null}

      {sent && !isEditing ? (
        <p className="callout" role="status" data-testid="suggestion-sent">
          Suggestion sent. It&rsquo;s waiting under Review.
        </p>
      ) : null}

      {conflict && isEditing && !isNew && entityId !== undefined ? (
        <EditConflict
          what="entry"
          read={() => getEntity(universe.id, entityId)}
          renderLatest={(latest) => (
            <ChangeList changes={entryChanges(latest, draft, types, chronology, detail)} />
          )}
          onKeepMine={keepMine}
          onUseLatest={takeLatest}
          testId="entry-conflict"
          suggesting={suggesting}
        />
      ) : null}

      <p className="visually-hidden" role="status" data-testid="entry-announcer">
        {announcement}
      </p>

      {isEditing ? (
        <div className="entryform" data-testid="entry-form">
          {suggesting ? (
            <p className="callout" data-testid="entry-suggesting">
              You&rsquo;re suggesting changes. The entry stays as it is until the owner or an Editor
              accepts them.
            </p>
          ) : (
            <section className="entryform__section">
              <EntityImageField
                universeId={universe.id}
                entityId={isNew ? null : entityId}
                image={detail?.image ?? null}
                pending={pendingImage}
                onPending={setPendingImage}
                onChanged={(image) => {
                  setDetail((current) => (current ? { ...current, image } : current))
                  // An image change is a version like any other, so the history is read again
                  // rather than left sitting one write behind.
                  setHistoryKey((key) => key + 1)
                }}
                disabled={isSaving}
              />
            </section>
          )}

          <section className="entryform__section">
            <h2 className="entryform__heading sectionrule sectionrule--accent">
              Other names and tags
            </h2>
            <TokenInput
              label="Aliases"
              name="aliases"
              placeholder="Other names"
              values={draft.aliases}
              onChange={(aliases) => setDraft({ ...draft, aliases })}
            />
            <TokenInput
              label="Tags"
              name="tags"
              placeholder="Add a tag"
              values={draft.tags}
              onChange={(tags) => setDraft({ ...draft, tags })}
            />
          </section>

          {(selectedType?.fields.length ?? 0) > 0 ? (
            <section className="entryform__section">
              <h2 className="entryform__heading sectionrule sectionrule--accent">
                What a <bdi>{selectedType?.name}</bdi> records
              </h2>
              <div className="entryform__fields">
                {selectedType!.fields.map((definition) => (
                  <div key={definition.id}>
                    <FieldInput
                      definition={definition}
                      value={draft.fields[definition.id] ?? emptyValue(definition)}
                      universeId={universe.id}
                      excludeId={entityId}
                      heldReference={heldReference(detail, definition.id)}
                      chronology={chronology}
                      onChange={(next) =>
                        setDraft((current) =>
                          current
                            ? { ...current, fields: { ...current.fields, [definition.id]: next } }
                            : current,
                        )
                      }
                    />
                    {fieldErrors[definition.id] ? (
                      <p className="field__error">{fieldErrors[definition.id]}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {isNew ? (
            <p className="entryform__note">The article is written on the entry once it exists.</p>
          ) : null}
        </div>
      ) : view === 'article' ? (
        <div
          className="entry__layout"
          data-picture={detail?.image ? 'true' : 'false'}
          data-shape={detail?.image ? pictureShape(detail.image) : undefined}
        >
          {detail?.image ? (
            <figure className="entry__media" data-testid="entry-image">
              <img
                src={entityImageUrl(universe.id, detail.id, detail.image, 'original')}
                alt={detail.name}
                // The original's own dimensions, which give the browser the picture's shape before a byte
                // of it has loaded: the space it will occupy is reserved from its own aspect ratio, so the
                // article never jumps down the page as one arrives.
                width={detail.image.width}
                height={detail.image.height}
                decoding="async"
              />
              <button
                ref={expandButton}
                className="iconbutton entry__expand"
                type="button"
                onClick={() => setIsViewing(true)}
                aria-label="View full image"
                title="View full image"
                data-testid="entry-image-expand"
              >
                <Maximize2 aria-hidden="true" focusable="false" strokeWidth={1.75} />
              </button>
            </figure>
          ) : null}

          <div className="entry__main">
            {isNew ? null : (
              <EntityArticleSection
                key={entityId}
                universeId={universe.id}
                entityId={entityId}
                entityName={detail?.name ?? ''}
                canEdit={!isEditing}
                onEditingChange={setIsWritingArticle}
                onSaved={articleSaved}
              />
            )}
          </div>

          <aside className="entry__rail" aria-label="Details">
            {(detail?.fields.length ?? 0) > 0 ? (
              <dl className="facts" data-testid="entry-fields">
                {detail!.fields.map((value) => (
                  <div className="facts__row" key={value.fieldDefinitionId}>
                    <dt className="facts__key">{value.name}</dt>
                    <dd className="facts__value prose">{renderFact(value, chronology)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}

            {(detail?.tags.length ?? 0) > 0 ? (
              <div className="rail__block">
                <h2 className="rail__heading">Tags</h2>
                <p className="dossier__tags" data-testid="entry-tags">
                  {detail!.tags.map((tag) => (
                    <span className="chip" key={tag}>
                      {tag}
                    </span>
                  ))}
                </p>
              </div>
            ) : null}

            {detail ? (
              <p className="rail__meta">
                Created {formatDate(detail.createdAt)}
                <br />
                Last changed {formatDate(detail.updatedAt)}
              </p>
            ) : null}
          </aside>
        </div>
      ) : view === 'progression' ? (
        <div className="entry__view">
          {detail ? (
            <ProgressionView
              key={detail.id}
              universeId={universe.id}
              entry={detail}
              definitions={types.find((type) => type.id === detail.entityTypeId)?.fields ?? []}
              chronology={chronology}
              onChanged={() => void refreshDetail()}
            />
          ) : null}
        </div>
      ) : view === 'relations' ? (
        <div className="entry__view">
          <RelationshipSection
            universeId={universe.id}
            entityId={entityId!}
            entityName={detail?.name ?? ''}
            chronology={chronology}
          />
        </div>
      ) : (
        <div className="entry__view">
          <EntityHistory
            universeId={universe.id}
            entityId={entityId!}
            chronology={chronology}
            reloadKey={historyKey}
            currentVersion={detail?.version ?? 0}
            onRestored={() => void reloadAfterRestore()}
          />
        </div>
      )}

      {/* The form's own bar: what state the form is in on the left, Save then Cancel on the right -
          primary first, as in every drawer and confirmation. It holds
          to the bottom of the screen while the form is longer than it, and settles at the form's end. */}
      {isEditing ? (
        <footer className="entry__actions actionbar">
          <p className="actionbar__status" role="status" data-testid="entry-form-status">
            {isDirty
              ? suggesting
                ? 'Not sent yet'
                : 'Unsaved changes'
              : isNew
                ? 'New entry'
                : 'No changes yet'}
          </p>
          <div className="actionbar__actions">
            <button
              ref={saveButton}
              className="button"
              type="button"
              onClick={save}
              disabled={isSaving || (suggesting && !isDirty)}
              aria-busy={isSaving}
              data-testid="save-entity"
            >
              <ActionIcon icon={suggesting ? FilePenLine : Check} />
              {suggesting
                ? isSaving
                  ? 'Sending'
                  : 'Send suggestion'
                : isSaving
                  ? 'Saving'
                  : isNew
                    ? 'Create entry'
                    : 'Save changes'}
            </button>
            {!isNew ? (
              <button
                className="button button--secondary"
                type="button"
                onClick={async () => {
                  // Cancel is the choice to discard, so it asks once, and only when there is something to lose.
                  if (
                    isDirty &&
                    !(await confirmAction({
                      title: suggesting
                        ? 'Close the form without sending your suggestion?'
                        : 'Close the form without saving your changes?',
                      message: suggesting ? 'It will be lost.' : 'They will be lost.',
                      confirmLabel: suggesting ? 'Discard suggestion' : 'Discard changes',
                      cancelLabel: 'Keep editing',
                      variant: 'destructive',
                    }))
                  ) {
                    return
                  }
                  discard()
                }}
                data-testid="cancel-entity"
              >
                <ActionIcon icon={X} />
                Cancel
              </button>
            ) : null}
          </div>
        </footer>
      ) : null}

      {isViewing && detail?.image ? (
        <ImageViewer
          src={entityImageUrl(universe.id, detail.id, detail.image, 'original')}
          name={detail.name}
          width={detail.image.width}
          height={detail.image.height}
          onClose={() => setIsViewing(false)}
        />
      ) : null}
    </article>
  )
}

/**
 * A draft as the save would send it, as one string: every field its type defines, an untouched one as its empty
 * value. So a field typed into and cleared again compares equal to one never touched.
 */
function comparable(draft: Draft, types: EntityType[]) {
  const definitions = types.find((type) => type.id === draft.entityTypeId)?.fields ?? []
  return JSON.stringify({
    ...draft,
    fields: definitions.map((definition) => draft.fields[definition.id] ?? emptyValue(definition)),
  })
}

/**
 * Whether a picture sits beside the article (taller than wide, or near square) or spans the page above
 * it (clearly wider than tall). Read from the original's stored dimensions; nothing is cropped either way.
 */
function pictureShape(image: { width: number; height: number }) {
  const ratio = image.width / image.height
  return ratio > 1.25 ? 'landscape' : ratio < 0.9 ? 'portrait' : 'square'
}

/**
 * The entry a link field held when the entry was read, named for the picker that shows it.
 *
 * An entry in the Trash is never offered by a search, so it is named as being there. Either way the stored id stays the
 * field's value until the author changes it, so saving any other field keeps the link.
 */
function heldReference(detail: EntityDetail | null, fieldDefinitionId: string) {
  const held = detail?.fields.find((value) => value.fieldDefinitionId === fieldDefinitionId)

  if (!held?.referencedEntityId) {
    return null
  }

  const name = held.referencedEntityName ?? 'Unavailable'

  return {
    id: held.referencedEntityId,
    name: held.referencedEntityIsTrashed ? `${name} (in Trash)` : name,
  }
}

/** One field as the reader sees it: the same words for the saved value and the author's unsaved one. */
function factText(value: Parameters<typeof renderFact>[0], chronology: Chronology) {
  return String(renderFact({ ...value, optionValues: [...value.optionValues].sort() }, chronology))
}

/**
 * What differs between the latest saved entry and the form's unsaved changes, field by field, in the reader's words. A link
 * the author newly chose is named only if the page already knows the entry; the picker does not hand its name back.
 */
function entryChanges(
  latest: EntryFields,
  draft: Draft,
  types: EntityType[],
  chronology: Chronology,
  opened: EntryFields | null,
): Change[] {
  const sorted = (values: string[]) => [...values].sort().join(', ')
  const rows: Change[] = [
    { label: 'Name', latest: latest.name, mine: draft.name.trim() },
    {
      label: 'Type',
      latest: latest.entityTypeName,
      mine:
        draft.entityTypeId === latest.entityTypeId
          ? latest.entityTypeName
          : (types.find((type) => type.id === draft.entityTypeId)?.name ?? ''),
    },
    {
      label: 'Status',
      latest: CANON_LABELS[latest.canonStatus],
      mine: CANON_LABELS[draft.canonStatus],
    },
    { label: 'Summary', latest: latest.summary ?? '', mine: draft.summary.trim() },
    { label: 'Also known as', latest: sorted(latest.aliases), mine: sorted(draft.aliases) },
    { label: 'Tags', latest: sorted(latest.tags), mine: sorted(draft.tags) },
  ]

  const definitions = types.find((type) => type.id === draft.entityTypeId)?.fields ?? []
  for (const definition of definitions) {
    const saved = latest.fields.find((value) => value.fieldDefinitionId === definition.id)
    const mine = draft.fields[definition.id] ?? emptyValue(definition)
    const known = [
      saved,
      opened?.fields.find((value) => value.fieldDefinitionId === definition.id),
    ].find(
      (value) =>
        value?.referencedEntityId != null && value.referencedEntityId === mine.referencedEntityId,
    )

    rows.push({
      label: definition.name,
      latest: saved
        ? factText(saved, chronology)
        : factText({ ...emptyFact, kind: definition.kind }, chronology),
      mine: factText(
        {
          kind: definition.kind,
          text: mine.text,
          number: mine.number,
          eraId: mine.eraId,
          boolean: mine.boolean,
          date: mine.date,
          optionValues: (mine.optionIds ?? []).map(
            (id) => definition.options.find((option) => option.id === id)?.value ?? '',
          ),
          referencedEntityName:
            mine.referencedEntityId === null
              ? null
              : (known?.referencedEntityName ?? 'Another entry'),
          referencedEntityIsTrashed: known?.referencedEntityIsTrashed ?? false,
        },
        chronology,
      ),
    })
  }

  return differing(rows)
}

const emptyFact = {
  text: null,
  number: null,
  eraId: null,
  boolean: null,
  date: null,
  optionValues: [],
  referencedEntityName: null,
  referencedEntityIsTrashed: false,
}
