import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { PendingImage } from '../components/EntityImageField'
import type { PendingFieldImage } from '../components/FieldImageInput'
import { ImageViewer } from '../components/ImageViewer'
import { getEntityArticle, saveEntityArticle } from '../lore/article'
import { emptyValue, isEmptyDocument, valuedFields } from '../lore/document'
import { entityDisplayUrl, entityImageUrl, setEntityImage, setFieldImage } from '../lore/images'
import { blockingFindingsOf } from '../canon/blocked'
import type { CanonBlockingFinding } from '../canon/types'
import { ApiError } from '../lib/api'
import { isChangedElsewhere } from '../lib/editConflict'
import { useLeaveGuard } from '../lib/leaveGuard'
import { createEntity, deleteEntity, ENTRY_CHANGED, getEntity, updateEntity } from '../lore/api'
import { CanonStatus, type CanonStatusValue, type EntityDetail } from '../lore/types'
import { NO_TYPES, type FieldSection } from '../lore/typeDefinitions'
import { groupBySection } from '../lore/fieldSections'
import { suggestEntryChanges } from '../suggestions/api'
import { useUniverseAccess } from '../universes/access'
import { useWorkspaceTypes } from './useWorkspaceTypes'
import { useStagePictures } from '../progression/stagePictures'
import { confirmAction } from '../lib/confirm'
import { useI18n } from '../i18n'
import {
  comparable,
  copiedDraft,
  draftFromDetail,
  type CopySource,
  type Draft,
} from '../lore/entryDraft'
import { EntryUnavailable } from '../components/lore/EntryUnavailable'
import { EntryHeader } from '../components/lore/EntryHeader'
import { EntryViewsNav } from '../components/lore/EntryViewsNav'
import { EntryTools } from '../components/lore/EntryTools'
import { EntryNotices } from '../components/lore/EntryNotices'
import { EntryForm } from '../components/lore/EntryForm'
import { EntryArticleView } from '../components/lore/EntryArticleView'
import { EntryPicture } from '../components/lore/EntryPicture'
import { EntryViewPanel, type EntryView } from '../components/lore/EntryViewPanel'
import { EntryFormBar } from '../components/lore/EntryFormBar'

/** How long the article stays marked after a link lands on it - the story page's scene and beat mark, for the same reason. */
const ARRIVAL_MS = 2400

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
  // An entry and a new one are the same screen at two addresses, so moving between them keeps this page. That is what lets
  // a create land on the entry it made with everything it said still on screen. Opening a new form - from an entry's
  // Duplicate, or from a copy of another - starts afresh instead: the form is new, so nothing of the last page may be in it.
  const { entityId } = useParams<{ entityId: string }>()
  const [searchParams] = useSearchParams()
  const isNew = entityId === undefined
  const from = searchParams.get('from')
  const [form, setForm] = useState({ isNew, from, key: 0 })
  if (form.isNew !== isNew || form.from !== from) {
    setForm({ isNew, from, key: isNew ? form.key + 1 : form.key })
  }

  return <EntityScreen key={form.key} view={view} />
}

function EntityScreen({ view }: { view: EntryView }) {
  const { t } = useI18n()
  const { universe, chronology, entryTypes: typesFound } = useWorkspaceTypes()
  const access = useUniverseAccess()
  const { entityId } = useParams<{ entityId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  // A new entry opened from a Lore type (`lore/new?type=<id>`) starts in that type; the author can
  // still change it. Read by id only, and only if this universe has that type.
  const [searchParams] = useSearchParams()
  const startingTypeId = searchParams.get('type')

  const isNew = entityId === undefined

  // A new entry made from an existing one (`lore/new?from=<id>`, Issue #27): the form opens filled from it, and the copy
  // panel says what came across and offers the rest. Nothing is stored until Create entry, and then only through the
  // ordinary create - so the copy has its own id, history and search entry, and nothing of the source's.
  const sourceId = isNew ? searchParams.get('from') : null
  const [source, setSource] = useState<CopySource | null>(null)
  const [sourceStatus, setSourceStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [copyArticle, setCopyArticle] = useState(false)
  // The universe's types, read with it. The page still works without them; a link field searches for itself.
  const typesRead = Array.isArray(typesFound)
  const types = typesRead ? typesFound : NO_TYPES
  const [detail, setDetail] = useState<EntityDetail | null>(null)
  const [editedDraft, setDraft] = useState<Draft | null>(null)
  const [isFormOpen, setIsEditing] = useState(isNew)
  // The form is open to send a suggestion rather than to save (task 045): the entry itself is not changed.
  const [isSuggesting, setIsSuggesting] = useState(false)
  // A suggestion just sent from here, said where it can be seen.
  const [sent, setSent] = useState(false)
  const [reads, setReads] = useState(0)

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

  // Which field sections the reader has opened or folded here (Issue #26), by id; one not in it starts as its type says.
  // Transient on purpose: nothing is stored, so the next visit starts from the author's choice again.
  const [sectionOpen, setSectionOpen] = useState<Record<string, boolean>>({})
  const isSectionOpen = (section: FieldSection) =>
    sectionOpen[section.id] ?? !section.startsCollapsed
  // The field a refused save sends the focus to, once the render that opens its section is on screen.
  const focusField = useRef<string | null>(null)
  useEffect(() => {
    if (!focusField.current) return
    document
      .querySelector(`[data-field-id="${focusField.current}"]`)
      ?.querySelector<HTMLElement>('input, select, textarea')
      ?.focus()
    focusField.current = null
  })
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

  // The same wait for each Image field of a new entry, by field id.
  const [pendingFieldImages, setPendingFieldImages] = useState<Record<string, PendingFieldImage>>(
    {},
  )

  // Bumped after every accepted write, so the history reloads without either component
  // holding the other's state.
  const [historyKey, setHistoryKey] = useState(0)

  // The full picture is page state, not an address: opening it is never a step Back has to undo.
  const [isViewing, setIsViewing] = useState(false)

  // Which picture the article shows: the main one, or a stage's (Progression), chosen above it.
  const stagePictures = useStagePictures(
    universe.id,
    entityId ?? '',
    view === 'article' && !isNew && !!detail?.hasProgression,
  )
  const [chosenPicture, setChosenPicture] = useState<{ entityId?: string; id: string } | null>(null)
  const stagePicture =
    (chosenPicture?.entityId === entityId &&
      stagePictures.find((one) => one.id === chosenPicture?.id)) ||
    null
  const mainPicture =
    detail?.image && entityId
      ? {
          src: entityDisplayUrl(universe.id, entityId, detail.image),
          // The viewer shows every pixel the author uploaded; the page draws the fitted copy.
          fullSrc: entityImageUrl(universe.id, entityId, detail.image, 'original'),
          width: detail.image.width,
          height: detail.image.height,
        }
      : null
  const picture = stagePicture ?? mainPicture ?? (isEditing ? null : (stagePictures[0] ?? null))
  const expandButton = useRef<HTMLButtonElement>(null)

  // Back to the button that opened it, once the viewer has gone - after the dialog's own close, which
  // would otherwise have the last word on where the focus lands.
  const wasViewing = useRef(false)
  useEffect(() => {
    if (wasViewing.current && !isViewing) expandButton.current?.focus()
    wasViewing.current = isViewing
  }, [isViewing])

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
  }, [universe.id, entityId, isNew, reads])

  // The entry being copied, and its article, read once. One that cannot be read - gone to the Trash since, say - leaves an
  // ordinary blank form and a line saying so.
  useEffect(() => {
    if (sourceId === null) return

    const controller = new AbortController()
    Promise.all([
      getEntity(universe.id, sourceId, controller.signal),
      getEntityArticle(universe.id, sourceId, controller.signal),
    ])
      .then(([loaded, article]) => {
        setSource({ detail: loaded, article: isEmptyDocument(article.content) ? null : article })
        setSourceStatus('ready')
      })
      .catch(() => {
        if (!controller.signal.aborted) setSourceStatus('unavailable')
      })

    return () => {
      controller.abort()
    }
  }, [universe.id, sourceId])

  // A new entry's blank draft is derived from the first available type rather than
  // written back into state, so nothing has to re-render to produce it. A copy's is the source's, as copied.
  const blankDraft = useMemo((): Draft | null => {
    if (!isNew || types.length === 0) return null
    if (sourceId !== null && sourceStatus === 'loading') return null
    if (source) return copiedDraft(source.detail, types)
    return {
      entityTypeId: types.find((type) => type.id === startingTypeId)?.id ?? types[0].id,
      name: '',
      summary: '',
      canonStatus: CanonStatus.Idea,
      aliases: [],
      tags: [],
      fields: {},
    } satisfies Draft
  }, [isNew, types, startingTypeId, sourceId, sourceStatus, source])
  const draft = editedDraft ?? blankDraft

  const selectedType = useMemo(
    () => types.find((type) => type.id === draft?.entityTypeId) ?? null,
    [types, draft?.entityTypeId],
  )

  // The form's fields as their type lays them out: ungrouped first, then each section that holds any (Issue #26).
  const formSections = useMemo(
    () =>
      groupBySection(
        selectedType?.fields ?? [],
        (field) => field.sectionId,
        selectedType?.fieldSections ?? [],
      ),
    [selectedType],
  )

  // The entry's facts the same way, by the section of the field each one is for.
  const factSections = useMemo(() => {
    const type = types.find((each) => each.id === detail?.entityTypeId)
    const sectionOf = new Map(type?.fields.map((field) => [field.id, field.sectionId]))
    return groupBySection(
      detail?.fields ?? [],
      (value) => sectionOf.get(value.fieldDefinitionId),
      type?.fieldSections ?? [],
    )
  }, [types, detail])

  // Quick Create on the form's link fields (Issue #25): only for someone who may create Lore, and never while suggesting -
  // a suggestion writes nothing until it is accepted, so it must not make an entry on the side.
  const quickCreate = useMemo(
    () =>
      access.editContent && !isSuggesting
        ? { chronology, keepHint: t('entity.page.keepLinkHint') }
        : null,
    [access.editContent, isSuggesting, chronology, t],
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
    if (isNew && (pendingImage !== null || Object.keys(pendingFieldImages).length > 0)) return true
    return comparable(draft, types) !== comparable(baseline, types)
  }, [isFormOpen, isNew, blankDraft, detail, draft, types, pendingImage, pendingFieldImages])

  /** Lets the form's changes go and closes it: Cancel, or the author choosing to leave. */
  const discard = useCallback(() => {
    setDraft(detail ? draftFromDetail(detail) : null)
    setPendingImage(null)
    setPendingFieldImages({})
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
        ? t('entity.page.leave.newEntry')
        : isSuggesting
          ? t('entity.page.leave.suggestion', {
              name: detail?.name ?? t('entity.page.leave.suggestionFallback'),
            })
          : t('entity.page.leave.edit', {
              name: detail?.name ?? t('entity.page.leave.editFallback'),
            }),
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
      fields: valuedFields(definitions).map(
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
              : t('entity.page.save.imageFailed'),
          )
        }
      }

      // Each Image field's held picture is a write of its own, for the same reason: the entry is stored either way.
      let fieldImages = saved.fieldImages
      if (isNew) {
        for (const [fieldId, held] of Object.entries(pendingFieldImages)) {
          try {
            const uploaded = await setFieldImage(
              universe.id,
              saved.id,
              fieldId,
              held.file,
              held.crop,
            )
            fieldImages = [...fieldImages.filter((one) => one.fieldId !== fieldId), uploaded]
          } catch (failure: unknown) {
            setMessage(
              failure instanceof ApiError
                ? (failure.fieldErrors.file ?? failure.message)
                : t('entity.fieldImage.uploadFailed', {
                    name: selectedType?.fields.find((one) => one.id === fieldId)?.name ?? '',
                  }),
            )
          }
        }
        setPendingFieldImages({})
      }

      // A copied article is the same kind of second write: the copy exists either way, and a refused article says so.
      // Its text is the one the copy panel showed, links and all, saved as the new entry's first version.
      if (isNew && copyArticle && source?.article) {
        try {
          await saveEntityArticle(universe.id, saved.id, {
            content: source.article.content,
            expectedVersion: 0,
          })
        } catch {
          setMessage(t('entity.page.save.articleFailed'))
        }
      }

      const stored = { ...saved, image, fieldImages }

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
        // The first field it names, in the order the form shows them, gets the focus - its section opened first, and any
        // other section holding a refused field with it, so nothing that needs the author stays folded away.
        const refused = [
          ...formSections.ungrouped,
          ...formSections.groups.flatMap((group) => group.items),
        ].filter((definition) => error.fieldErrors[definition.id])
        if (refused.length > 0) {
          setSectionOpen((current) => ({
            ...current,
            ...Object.fromEntries(
              refused.flatMap((definition) =>
                definition.sectionId ? [[definition.sectionId, true]] : [],
              ),
            ),
          }))
          focusField.current = refused[0].id
        }
        setMessage(
          Object.keys(error.fieldErrors).length === 0
            ? error.message
            : isSuggesting
              ? t('entity.page.save.fieldsSuggest')
              : t('entity.page.save.fieldsSave'),
        )
      } else {
        setMessage(
          isSuggesting ? t('entity.page.save.suggestFailed') : t('entity.page.save.failed'),
        )
      }
    } finally {
      setIsSaving(false)
    }
  }, [
    draft,
    selectedType,
    formSections,
    isNew,
    universe.id,
    entityId,
    navigate,
    pendingImage,
    pendingFieldImages,
    detail,
    isSuggesting,
    copyArticle,
    source,
    t,
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
        fields: valuedFields(definitions).map(
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
        setMessage(t('entity.page.canon.changedElsewhere'))
      } else {
        setMessage(t('entity.page.canon.failed'))
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
    setAnnouncement(t('entity.page.announce.keptMine'))
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
      title: t('entity.page.trash.title'),
      message: t('entity.page.trash.message'),
      confirmLabel: t('entity.page.trash.confirm'),
      busyLabel: t('entity.page.trash.busy'),
      variant: 'warning',
      failure: t('entity.page.trash.failed'),
      action: () => deleteEntity(universe.id, entityId),
    })
    if (trashed) await navigate(`/app/universes/${universe.id}/trash`, { replace: true })
  }

  // Order matters here. A load that failed leaves the draft null, so a loading guard placed
  // first would answer "Opening…" forever instead of saying what happened - which is now an
  // ordinary thing to hit, because a link to an entry since moved to the Trash answers 404.
  const unavailable = { universe, access, setStatus, setReads }
  if (status === 'missing') {
    return <EntryUnavailable reason="missing" {...unavailable} />
  }

  // Types are the author's, and a world may have none left. A new entry has to be one of them, so say so rather than
  // waiting for a type that will not come.
  if (isNew && typesRead && types.length === 0) {
    return <EntryUnavailable reason="noTypes" {...unavailable} />
  }

  // Before the loading guard: a failed read leaves the draft null, and the guard would otherwise say "Opening…" for good.
  if (status === 'error') {
    return <EntryUnavailable reason="error" {...unavailable} />
  }

  if (status === 'loading' || !draft) {
    return <EntryUnavailable reason="loading" {...unavailable} />
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

  const entry = {
    universe,
    chronology,
    access,
    entityId,
    isNew,
    sourceId,
    types,
    source,
    copyArticle,
    setCopyArticle,
    detail,
    setDetail,
    draft,
    setDraft,
    isEditing,
    suggesting,
    sent,
    fieldErrors,
    message,
    blocked,
    conflict,
    announcement,
    isSaving,
    saveButton,
    setSectionOpen,
    isSectionOpen,
    isWritingArticle,
    setIsWritingArticle,
    articleSaved,
    pendingImage,
    setPendingImage,
    pendingFieldImages,
    setPendingFieldImages,
    historyKey,
    setHistoryKey,
    setIsViewing,
    stagePictures,
    setChosenPicture,
    mainPicture,
    picture,
    expandButton,
    selectedType,
    formSections,
    factSections,
    quickCreate,
    offersFamilyTree,
    isDirty,
    discard,
    save,
    changeCanon,
    keepMine,
    takeLatest,
    refreshDetail,
    reloadAfterRestore,
    moveToTrash,
    entryPath,
    startEditing,
    startSuggesting,
    view,
  }

  return (
    <article
      className="entry"
      style={accent ? { ['--entry-accent' as string]: accent } : undefined}
    >
      <EntryHeader {...entry} />

      {/* One bar under the identity: where in the entry you are, and what you can do to the entry itself -
          Edit first, Family tree beside it, and everything that manages rather than reads in the ⋯ menu,
          Move to Trash last. Not drawn while the entry's own form is open, nor while the article is
          being written: one editor, and one set of tools, at a time. Comments sit just after the views, where a
          phone's views line has room the tools line does not. */}
      {!isNew && !isEditing ? (
        <div className="entry__bar">
          <EntryViewsNav {...entry} />

          {isWritingArticle ? null : <EntryTools {...entry} />}
        </div>
      ) : null}

      <EntryNotices {...entry} />

      {isEditing ? (
        <EntryForm {...entry} />
      ) : view === 'article' ? (
        <div
          className="entry__layout"
          data-picture={picture ? 'true' : 'false'}
          data-shape={picture ? pictureShape(picture) : undefined}
        >
          <EntryPicture {...entry} />

          <EntryArticleView {...entry} />
        </div>
      ) : (
        <div
          className="entry__layout entry__layout--view"
          data-picture={picture ? 'true' : 'false'}
        >
          <EntryPicture {...entry} />
          <EntryViewPanel {...entry} />
        </div>
      )}

      {/* The form's own bar: what state the form is in on the left, Save then Cancel on the right -
          primary first, as in every drawer and confirmation. It holds
          to the bottom of the screen while the form is longer than it, and settles at the form's end. */}
      {isEditing ? <EntryFormBar {...entry} /> : null}

      {isViewing && detail && picture ? (
        <ImageViewer
          src={picture.fullSrc}
          name={detail.name}
          width={picture.width}
          height={picture.height}
          onClose={() => setIsViewing(false)}
        />
      ) : null}
    </article>
  )
}

/**
 * Whether a picture sits beside the article (taller than wide, or near square) or spans the page above
 * it (clearly wider than tall). Read from the original's stored dimensions; nothing is cropped either way.
 */
function pictureShape(image: { width: number; height: number }) {
  const ratio = image.width / image.height
  return ratio > 1.25 ? 'landscape' : ratio < 0.9 ? 'portrait' : 'square'
}
