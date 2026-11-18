import { useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ImageViewer } from '../components/ImageViewer'
import { NO_TYPES } from '../lore/typeDefinitions'
import { useUniverseAccess } from '../universes/access'
import { useWorkspaceTypes } from './useWorkspaceTypes'
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
import { useEntryState } from '../lore/useEntryState'
import { useEntryPicture } from '../lore/useEntryPicture'
import { useEntryLoad } from '../lore/useEntryLoad'
import { useEntryForm } from '../lore/useEntryForm'
import { useEntryArrival } from '../lore/useEntryArrival'
import { useEntrySave } from '../lore/useEntrySave'
import { useEntryActions } from '../lore/useEntryActions'

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
  // The universe's types, read with it. The page still works without them; a link field searches for itself.
  const typesRead = Array.isArray(typesFound)
  const types = typesRead ? typesFound : NO_TYPES
  const state = useEntryState({ isNew })
  const { isFormOpen, isSuggesting, status, setStatus, setReads, detail } = state
  const { isWritingArticle, isViewing, setIsViewing } = state

  // The entry's form belongs to the Article view - it edits what that view shows. Deriving this rather
  // than clearing it on a view change is what makes the browser's Back honest: going back to Relations
  // shows Relations, and coming forward again finds the form exactly as it was left.
  const isEditing = isFormOpen && view === 'article'
  const suggesting = isEditing && isSuggesting && !isNew
  const entryPath = `/app/universes/${universe.id}/lore/${entityId}`
  const base = {
    ...state,
    universe,
    chronology,
    access,
    entityId,
    navigate,
    location,
    startingTypeId,
    isNew,
    sourceId,
    types,
    view,
    isEditing,
    suggesting,
    entryPath,
  }
  const pictures = useEntryPicture(base)
  const load = useEntryLoad(base)
  const form = useEntryForm({ ...base, ...load })
  useEntryArrival(base)
  const saving = useEntrySave({ ...base, ...load, ...form })
  const actions = useEntryActions({ ...base, ...load })
  const { draft, selectedType } = load
  const { picture } = pictures

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
  const entry = { ...base, ...pictures, ...load, ...form, ...saving, ...actions, draft }

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
