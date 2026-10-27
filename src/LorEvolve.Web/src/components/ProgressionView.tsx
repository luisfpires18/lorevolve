import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, History, Pencil, Plus, Trash } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import { ActionMenu } from './ActionMenu'
import { AppearanceList } from './AppearanceList'
import { EmptyState } from './EmptyState'
import { EraForm } from './EraForm'
import { EraRelations } from './EraRelations'
import { ProgressionItemForm } from './ProgressionItemForm'
import { VersionActor } from './VersionActor'
import type { Chronology } from '../chronology/types'
import { ApiError } from '../lib/api'
import { confirmAction } from '../lib/confirm'
import { formatDateTime } from '../lib/dates'
import { isChangedElsewhere } from '../lib/editConflict'
import { renderFact } from '../lore/facts'
import { RevisionKind } from '../lore/revisions'
import type { EntityDetail, FieldDefinition } from '../lore/types'
import {
  abilityInputOf,
  appearanceImageUrl,
  appearanceInputOf,
  removeAppearanceImage,
  eraInputOf,
  formInputOf,
  getProgression,
  getProgressionRevision,
  listProgressionRevisions,
  PROGRESSION_CHANGED,
  restoreProgressionRevision,
  saveProgression,
} from '../progression/api'
import { formatSpan, resolveFields, type FieldSource } from '../progression/eras'
import type {
  Ability,
  Appearance,
  Era,
  Form,
  Progression,
  ProgressionInput,
  ProgressionRevisionDetail,
  ProgressionRevisionSummary,
  UnlockMilestone,
} from '../progression/types'
import { useUniverseAccess } from '../universes/access'

interface ProgressionViewProps {
  universeId: string
  entry: EntityDetail
  /** The entry's type's active fields, in order. */
  definitions: FieldDefinition[]
  chronology: Chronology
  /** Called after a save or restore, so the page can read the entry again (it now has eras, or none). */
  onChanged: () => void
}

const SOURCE_LABELS: Record<FieldSource, string> = {
  era: 'Set for this era',
  cleared: 'None in this era',
  entry: 'From the main profile',
}

/**
 * An entry's eras (Issue #41), on one entry and one identity: the main profile first, then each era in the author's order,
 * chosen by the address (`?era=`), so a reload, Back and a shared link land on the same one. An era shows what it is, when,
 * the stories and scenes it covers, and every field as it reads then - the era's own value, none, or the entry's - each
 * saying which. Nothing here ever reads another era's value into this one.
 */
export function ProgressionView({
  universeId,
  entry,
  definitions,
  chronology,
  onChanged,
}: ProgressionViewProps) {
  const access = useUniverseAccess()
  const [params, setParams] = useSearchParams()
  const [progression, setProgression] = useState<Progression | null>(null)
  const [failed, setFailed] = useState(false)
  const [editing, setEditing] = useState<Era | 'new' | null>(null)
  const [editingItem, setEditingItem] = useState<{
    kind: 'form' | 'ability' | 'appearance'
    item: Form | Ability | Appearance | null
  } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [historyKey, setHistoryKey] = useState(0)
  // One change at a time: a second press while one is saving would name the same version and be refused as stale.
  const [busy, setBusy] = useState(false)
  // Each read and each save takes a ticket; a read answers only if nothing was read or saved after it started.
  const ticket = useRef(0)

  const load = useCallback(
    (signal?: AbortSignal) => {
      const mine = ++ticket.current
      return getProgression(universeId, entry.id, signal)
        .then((read) => {
          if (mine !== ticket.current) return
          setProgression(read)
          setFailed(false)
        })
        .catch(() => {
          if (!signal?.aborted && mine === ticket.current) setFailed(true)
        })
    },
    [universeId, entry.id],
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  function changed(next: Progression) {
    ticket.current++
    setProgression(next)
    setHistoryKey((key) => key + 1)
    onChanged()
  }

  if (failed) {
    return (
      <p className="form__message" role="alert">
        The eras could not be read.{' '}
        <button className="linkbutton" type="button" onClick={() => void load()}>
          Try again
        </button>
      </p>
    )
  }

  if (!progression) {
    return <p className="muted">Reading eras…</p>
  }

  const selectedId = params.get('era')
  const selected = progression.eras.find((era) => era.id === selectedId) ?? null

  function choose(eraId: string | null) {
    const next = new URLSearchParams(params)
    if (eraId) next.set('era', eraId)
    else next.delete('era')
    setParams(next)
  }

  /** Saves the eras given; forms and abilities are sent only when `items` says so (a removal that takes references with it). */
  async function write(
    eras: Era[],
    done?: () => void,
    items?: Pick<ProgressionInput, 'forms' | 'abilities' | 'appearances'>,
  ) {
    if (!progression || busy) return
    setMessage(null)
    setBusy(true)
    try {
      changed(
        await saveProgression(universeId, entry.id, {
          eras: eras.map(eraInputOf),
          expectedVersion: progression.version,
          ...items,
        }),
      )
      done?.()
    } catch (error: unknown) {
      if (isChangedElsewhere(error, PROGRESSION_CHANGED)) {
        setMessage('These eras were changed somewhere else. The latest are shown now; try again.')
        void load()
      } else {
        setMessage(error instanceof ApiError ? error.message : 'That change could not be saved.')
      }
    } finally {
      setBusy(false)
    }
  }

  function move(era: Era, by: number) {
    const eras = [...progression!.eras]
    const from = eras.findIndex((one) => one.id === era.id)
    const to = from + by
    if (to < 0 || to >= eras.length) return
    ;[eras[from], eras[to]] = [eras[to], eras[from]]
    void write(eras)
  }

  async function remove(era: Era) {
    if (
      !(await confirmAction({
        title: `Remove the era “${era.name}”?`,
        message: `What it sets for ${entry.name} goes with it; forms, abilities and appearances stop belonging to it. The main profile is not changed. Era history can bring it back.`,
        confirmLabel: 'Remove era',
        variant: 'destructive',
      }))
    ) {
      return
    }
    const dropping = new Set([era.id])
    void write(
      progression!.eras.filter((one) => one.id !== era.id),
      () => choose(null),
      {
        forms: progression!.forms.map((form) => formInputOf(form, dropping)),
        abilities: progression!.abilities.map((ability) => abilityInputOf(ability, dropping)),
        appearances: progression!.appearances.map((one) => appearanceInputOf(one, dropping)),
      },
    )
  }

  async function removeItem(kind: 'form' | 'ability', item: Form | Ability) {
    const what = kind === 'form' ? 'form' : 'ability'
    if (
      !(await confirmAction({
        title: `Remove the ${what} “${item.name}”?`,
        message:
          kind === 'form'
            ? `Abilities and appearances stop belonging to it. Era history can bring it back.`
            : `Era history can bring it back.`,
        confirmLabel: `Remove ${what}`,
        variant: 'destructive',
      }))
    ) {
      return
    }
    const droppingForms = new Set(kind === 'form' ? [item.id] : [])
    void write(progression!.eras, undefined, {
      forms: progression!.forms
        .filter((one) => one.id !== item.id)
        .map((form) => formInputOf(form)),
      abilities: progression!.abilities
        .filter((one) => one.id !== item.id)
        .map((ability) => abilityInputOf(ability, new Set(), droppingForms)),
      appearances: progression!.appearances.map((one) =>
        appearanceInputOf(one, new Set(), droppingForms),
      ),
    })
  }

  /** A look goes with its pictures, which are deleted first, one by one - after the author agrees, since nothing keeps them. */
  async function removeAppearance(appearance: Appearance) {
    const pictures = appearance.images.length
    if (
      !(await confirmAction({
        title: `Remove the appearance “${appearance.label}”?`,
        message:
          pictures === 0
            ? 'Era history can bring it back.'
            : `Its ${pictures === 1 ? 'picture is' : `${pictures} pictures are`} deleted for good; era history keeps the appearance but not its pictures.`,
        confirmLabel: 'Remove appearance',
        variant: 'destructive',
      }))
    ) {
      return
    }
    if (busy) return
    setMessage(null)
    setBusy(true)
    try {
      // Nothing is deleted unless the save that follows names the version these pictures were shown at.
      const latest = await getProgression(universeId, entry.id)
      if (latest.version !== progression!.version) {
        ticket.current++
        setProgression(latest)
        setMessage('These eras were changed somewhere else. The latest are shown now; try again.')
        return
      }
      for (const image of appearance.images) {
        await removeAppearanceImage(universeId, entry.id, appearance.id, image.id)
      }
      changed(
        await saveProgression(universeId, entry.id, {
          eras: latest.eras.map(eraInputOf),
          expectedVersion: latest.version,
          appearances: latest.appearances
            .filter((one) => one.id !== appearance.id)
            .map((one) => appearanceInputOf(one)),
        }),
      )
    } catch (error: unknown) {
      setMessage(
        error instanceof ApiError ? error.message : 'That appearance could not be removed.',
      )
      void load()
    } finally {
      setBusy(false)
    }
  }

  /** Moves a form, ability or appearance one place in the author's order, saved with the rest as they are. */
  function moveItem(kind: 'form' | 'ability' | 'appearance', id: string, by: number) {
    function swapped<T extends { id: string }>(list: T[]) {
      const next = [...list]
      const from = next.findIndex((one) => one.id === id)
      const to = from + by
      if (from === -1 || to < 0 || to >= next.length) return null
      ;[next[from], next[to]] = [next[to], next[from]]
      return next
    }
    const p = progression!
    if (kind === 'form') {
      const forms = swapped(p.forms)
      if (forms) void write(p.eras, undefined, { forms: forms.map((form) => formInputOf(form)) })
    } else if (kind === 'ability') {
      const abilities = swapped(p.abilities)
      if (abilities)
        void write(p.eras, undefined, { abilities: abilities.map((one) => abilityInputOf(one)) })
    } else {
      const appearances = swapped(p.appearances)
      if (appearances)
        void write(p.eras, undefined, {
          appearances: appearances.map((one) => appearanceInputOf(one)),
        })
    }
  }

  return (
    <section
      className="progression"
      aria-labelledby="progression-heading"
      data-testid="progression"
    >
      <div className="progression__head">
        <h2 className="sectiontitle" id="progression-heading">
          Progression
        </h2>
        {access.editContent ? (
          <button
            className="button button--secondary button--sm"
            type="button"
            onClick={() => setEditing('new')}
            data-testid="add-era"
          >
            <ActionIcon icon={Plus} />
            Add era
          </button>
        ) : null}
      </div>

      {message ? (
        <p className="form__message" role="alert" data-testid="progression-message">
          {message}
        </p>
      ) : null}

      {selected ? null : (
        <Overview universeId={universeId} entry={entry} progression={progression} />
      )}

      {progression.eras.length === 0 ? (
        <EmptyState
          testId="progression-empty"
          title={`${entry.name} has no eras yet.`}
          hint="An era is a stretch of this entry's story. It holds only what changes then; everything else stays as on the main profile."
        />
      ) : (
        <>
          <nav className="eranav" aria-label={`Eras of ${entry.name}`} data-testid="era-nav">
            <ul className="eranav__list">
              <li>
                <Link
                  className="eranav__link"
                  to={{ search: withoutEra(params) }}
                  aria-current={selected ? undefined : 'page'}
                  data-testid="era-nav-main"
                >
                  Main profile
                </Link>
              </li>
              {progression.eras.map((era) => (
                <li key={era.id}>
                  <Link
                    className="eranav__link"
                    to={{ search: withEra(params, era.id) }}
                    aria-current={selected?.id === era.id ? 'page' : undefined}
                    data-testid={`era-nav-${era.name}`}
                  >
                    {era.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {selected ? (
            <EraPanel
              era={selected}
              entry={entry}
              definitions={definitions}
              chronology={chronology}
              universeId={universeId}
              progression={progression}
              busy={busy}
              isFirst={progression.eras[0].id === selected.id}
              isLast={progression.eras[progression.eras.length - 1].id === selected.id}
              previous={progression.eras[progression.eras.indexOf(selected) - 1] ?? null}
              next={progression.eras[progression.eras.indexOf(selected) + 1] ?? null}
              params={params}
              onEdit={() => setEditing(selected)}
              onMove={(by) => move(selected, by)}
              onRemove={() => void remove(selected)}
            />
          ) : (
            <ol className="eralist" data-testid="era-list">
              {progression.eras.map((era) => {
                const span = formatSpan(chronology, era.start, era.end)
                return (
                  <li className="eralist__item" key={era.id}>
                    <Link className="eralist__name" to={{ search: withEra(params, era.id) }}>
                      {era.name}
                    </Link>
                    {span ? <span className="eralist__span">{span}</span> : null}
                    {era.description ? (
                      <p className="eralist__description prose">{era.description}</p>
                    ) : null}
                    <p className="eralist__meta">
                      {era.fields.length === 0
                        ? 'Everything from the main profile'
                        : era.fields.length === 1
                          ? '1 detail of its own'
                          : `${era.fields.length} details of its own`}
                    </p>
                  </li>
                )
              })}
            </ol>
          )}
        </>
      )}

      {selected ? null : (
        <>
          <ItemList
            kind="form"
            items={progression.forms}
            appearances={progression.appearances}
            universeId={universeId}
            entryName={entry.name}
            busy={busy}
            onAdd={() => setEditingItem({ kind: 'form', item: null })}
            onEdit={(item) => setEditingItem({ kind: 'form', item })}
            onMove={(item, by) => moveItem('form', item.id, by)}
            onRemove={(item) => void removeItem('form', item)}
          />
          <ItemList
            kind="ability"
            items={progression.abilities}
            appearances={progression.appearances}
            universeId={universeId}
            entryName={entry.name}
            busy={busy}
            onAdd={() => setEditingItem({ kind: 'ability', item: null })}
            onEdit={(item) => setEditingItem({ kind: 'ability', item })}
            onMove={(item, by) => moveItem('ability', item.id, by)}
            onRemove={(item) => void removeItem('ability', item)}
          />
          <AppearanceList
            universeId={universeId}
            entityId={entry.id}
            appearances={progression.appearances}
            busy={busy}
            onAdd={() => setEditingItem({ kind: 'appearance', item: null })}
            onEdit={(appearance) => setEditingItem({ kind: 'appearance', item: appearance })}
            onMove={(appearance, by) => moveItem('appearance', appearance.id, by)}
            onRemove={(appearance) => void removeAppearance(appearance)}
            onPicturesChanged={() => void load()}
          />
        </>
      )}

      {access.manageHistory && progression.version > 0 ? (
        <ProgressionHistory
          key={historyKey}
          universeId={universeId}
          entityId={entry.id}
          currentVersion={progression.version}
          onRestored={changed}
          onStale={() => void load()}
        />
      ) : null}

      {editing ? (
        <EraForm
          universeId={universeId}
          entityId={entry.id}
          entityName={entry.name}
          definitions={definitions}
          entryFields={entry.fields}
          chronology={chronology}
          progression={progression}
          era={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            const wasNew = editing === 'new'
            setEditing(null)
            changed(saved)
            if (wasNew && saved.eras.length > 0) choose(saved.eras[saved.eras.length - 1].id)
          }}
        />
      ) : null}

      {editingItem ? (
        <ProgressionItemForm
          universeId={universeId}
          entityId={entry.id}
          entityName={entry.name}
          progression={progression}
          kind={editingItem.kind}
          item={editingItem.item}
          onClose={() => setEditingItem(null)}
          onSaved={(saved) => {
            setEditingItem(null)
            changed(saved)
          }}
        />
      ) : null}
    </section>
  )
}

function withEra(params: URLSearchParams, eraId: string) {
  const next = new URLSearchParams(params)
  next.set('era', eraId)
  return `?${next.toString()}`
}

function withoutEra(params: URLSearchParams) {
  const next = new URLSearchParams(params)
  next.delete('era')
  const search = next.toString()
  return search ? `?${search}` : ''
}

function EraPanel({
  era,
  entry,
  definitions,
  chronology,
  universeId,
  progression,
  busy,
  isFirst,
  isLast,
  previous,
  next,
  params,
  onEdit,
  onMove,
  onRemove,
}: {
  era: Era
  entry: EntityDetail
  definitions: FieldDefinition[]
  chronology: Chronology
  universeId: string
  progression: Progression
  busy: boolean
  isFirst: boolean
  isLast: boolean
  /** The eras before and after this one in the author's order, for reading the progression straight through. */
  previous: Era | null
  next: Era | null
  params: URLSearchParams
  onEdit: () => void
  onMove: (by: number) => void
  onRemove: () => void
}) {
  const title = useRef<HTMLHeadingElement>(null)
  const shown = useRef(era.id)
  useEffect(() => {
    if (shown.current === era.id) return
    shown.current = era.id
    title.current?.focus()
  }, [era.id])
  const access = useUniverseAccess()
  const span = formatSpan(chronology, era.start, era.end)
  const fields = resolveFields(definitions, entry.fields, era)
  const forms = progression.forms.filter((form) => form.eras.some((one) => one.id === era.id))
  const abilities = progression.abilities.filter((ability) =>
    ability.eras.some((one) => one.id === era.id),
  )
  const looks = progression.appearances.filter((appearance) =>
    appearance.eras.some((one) => one.id === era.id),
  )

  return (
    <article className="erapanel" aria-labelledby="era-title" data-testid="era-panel">
      <header className="erapanel__head">
        <div>
          <p className="erapanel__eyebrow">Era of {entry.name}</p>
          <h3
            className="erapanel__title"
            id="era-title"
            ref={title}
            tabIndex={-1}
            data-testid="era-title"
          >
            {era.name}
          </h3>
          {span ? (
            <p className="erapanel__span" data-testid="era-span">
              {span}
            </p>
          ) : null}
        </div>
        {access.editContent ? (
          <div className="erapanel__tools">
            <button
              className="button button--secondary button--sm"
              type="button"
              onClick={onEdit}
              data-testid="edit-era"
            >
              <ActionIcon icon={Pencil} />
              Edit era
            </button>
            <ActionMenu label={`More actions for ${era.name}`} triggerTestId="era-actions">
              <button
                className="actionmenu__item"
                type="button"
                disabled={busy || isFirst}
                onClick={() => onMove(-1)}
                data-testid="era-earlier"
              >
                <ActionIcon icon={ArrowUp} />
                Move earlier
              </button>
              <button
                className="actionmenu__item"
                type="button"
                disabled={busy || isLast}
                onClick={() => onMove(1)}
                data-testid="era-later"
              >
                <ActionIcon icon={ArrowDown} />
                Move later
              </button>
              <button
                className="actionmenu__item actionmenu__item--danger"
                type="button"
                disabled={busy}
                onClick={onRemove}
                data-testid="remove-era"
              >
                <ActionIcon icon={Trash} />
                Remove era
              </button>
            </ActionMenu>
          </div>
        ) : null}
      </header>

      {era.description ? (
        <p className="erapanel__description prose" data-testid="era-description">
          {era.description}
        </p>
      ) : null}

      {era.stories.length > 0 || era.scenes.length > 0 ? (
        <div className="rail__block">
          <h4 className="rail__heading">Covers</h4>
          <ul className="eracovers" data-testid="era-covers">
            {era.stories.map((story) => (
              <li key={story.id}>
                {story.isTrashed ? (
                  <span>{story.title} (in Trash)</span>
                ) : (
                  <Link to={`/app/universes/${universeId}/stories/${story.id}`}>{story.title}</Link>
                )}
              </li>
            ))}
            {era.scenes.map((scene) => (
              <li key={scene.id}>
                {scene.isTrashed ? (
                  <span>{scene.title} (in Trash)</span>
                ) : (
                  <Link
                    to={`/app/universes/${universeId}/stories/${scene.storyId}#scene-${scene.id}`}
                  >
                    {scene.title}
                  </Link>
                )}
                <span className="muted"> · {scene.storyTitle}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {fields.length > 0 ? (
        <dl className="facts erafacts" data-testid="era-fields-read">
          {fields.map((field) => (
            <div
              className="facts__row"
              key={field.definition.id}
              data-source={field.source}
              data-testid={`era-fact-${field.definition.name}`}
            >
              <dt className="facts__key">{field.definition.name}</dt>
              <dd className="facts__value prose">
                {field.source === 'cleared'
                  ? '—'
                  : field.value
                    ? renderFact(field.value, chronology)
                    : '—'}
                <span className={`erasource erasource--${field.source}`}>
                  {SOURCE_LABELS[field.source]}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      <EraItems heading="Forms in this era" era={era} items={forms} testId="era-forms" />
      <EraItems
        heading="Abilities in this era"
        era={era}
        items={abilities}
        testId="era-abilities"
      />

      {looks.length > 0 ? (
        <div className="rail__block">
          <h4 className="rail__heading">Appearances in this era</h4>
          <ul className="eralooks" data-testid="era-appearances">
            {looks.map((look) => (
              <li
                className="eralooks__item"
                key={look.id}
                data-testid={`era-appearances-${look.label}`}
              >
                {look.images[0] ? (
                  <img
                    className="gallery__thumb"
                    src={appearanceImageUrl(
                      universeId,
                      entry.id,
                      look.id,
                      look.images[0].id,
                      'thumbnail',
                    )}
                    alt=""
                    width={64}
                    height={64}
                    loading="lazy"
                  />
                ) : null}
                <bdi>{look.label}</bdi>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Read again whenever the progression is saved or restored: an era's dates decide what holds in it. */}
      <EraRelations
        key={progression.version}
        universeId={universeId}
        entityId={entry.id}
        eraId={era.id}
      />

      <nav className="erasteps" aria-label={`Other eras of ${entry.name}`} data-testid="era-steps">
        {previous ? (
          <Link className="erasteps__link" to={{ search: withEra(params, previous.id) }} rel="prev">
            <span aria-hidden="true">← </span>
            <span className="visually-hidden">Earlier era: </span>
            <bdi>{previous.name}</bdi>
          </Link>
        ) : null}
        <Link
          className="erasteps__link"
          to={{ search: withoutEra(params) }}
          data-testid="era-steps-main"
        >
          Main profile
        </Link>
        {next ? (
          <Link className="erasteps__link" to={{ search: withEra(params, next.id) }} rel="next">
            <span className="visually-hidden">Later era: </span>
            <bdi>{next.name}</bdi>
            <span aria-hidden="true"> →</span>
          </Link>
        ) : null}
      </nav>
    </article>
  )
}

/**
 * The present-day profile's head (Issue #44): what the entry is, in its own summary, how much of its story is told here - eras,
 * forms, abilities, appearances - and the way back to the article, which stays the entry's one source of truth.
 */
function Overview({
  universeId,
  entry,
  progression,
}: {
  universeId: string
  entry: EntityDetail
  progression: Progression
}) {
  const counts = [
    [progression.eras.length, 'era', 'eras'],
    [progression.forms.length, 'form', 'forms'],
    [progression.abilities.length, 'ability', 'abilities'],
    [progression.appearances.length, 'appearance', 'appearances'],
  ] as const
  const told = counts
    .filter(([count]) => count > 0)
    .map(([count, one, many]) => `${count} ${count === 1 ? one : many}`)

  return (
    <div className="progoverview" data-testid="progression-overview">
      {entry.summary ? <p className="progoverview__summary prose">{entry.summary}</p> : null}
      <p className="progoverview__meta">
        {told.length > 0 ? <span data-testid="progression-counts">{told.join(' · ')}</span> : null}
        <Link
          to={`/app/universes/${universeId}/lore/${entry.id}`}
          data-testid="progression-article"
        >
          Read the article
        </Link>
      </p>
    </div>
  )
}

/** What is available in one era - only what the author ticked for it - with where it was first unlocked, if here. */
function EraItems({
  heading,
  era,
  items,
  testId,
}: {
  heading: string
  era: Era
  items: (Form | Ability)[]
  testId: string
}) {
  if (items.length === 0) return null
  return (
    <div className="rail__block">
      <h4 className="rail__heading">{heading}</h4>
      <ul className="eracovers" data-testid={testId}>
        {items.map((item) => (
          <li key={item.id} data-testid={`${testId}-${item.name}`}>
            <bdi>{item.name}</bdi>
            {item.unlock.era?.id === era.id ? (
              <span className="erasource erasource--era"> First unlocked here</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

function unlockParts(unlock: UnlockMilestone) {
  return [
    unlock.era ? `in ${unlock.era.name}` : null,
    unlock.scene
      ? `in the scene ${unlock.scene.title}${unlock.scene.isTrashed ? ' (in Trash)' : ''}`
      : null,
    unlock.moment
      ? `at ${unlock.moment.title}${unlock.moment.isTrashed ? ' (in Trash)' : ''}`
      : null,
  ].filter((part): part is string => part !== null)
}

/** An entry's forms or abilities on the main profile: each as the author said it, nothing filled in. */
function ItemList({
  kind,
  items,
  appearances,
  universeId,
  entryName,
  busy,
  onAdd,
  onEdit,
  onMove,
  onRemove,
}: {
  kind: 'form' | 'ability'
  items: (Form | Ability)[]
  /** The entry's appearances: a form's look is the ones that name it (Issue #43). */
  appearances: Appearance[]
  universeId: string
  entryName: string
  busy: boolean
  onAdd: () => void
  onEdit: (item: Form | Ability) => void
  onMove: (item: Form | Ability, by: number) => void
  onRemove: (item: Form | Ability) => void
}) {
  const access = useUniverseAccess()
  const title = kind === 'form' ? 'Forms' : 'Abilities'
  const one = kind === 'form' ? 'form' : 'ability'
  const headingId = `${kind}-list-heading`

  if (items.length === 0 && !access.editContent) return null

  return (
    <section className="progitems" aria-labelledby={headingId} data-testid={`${kind}-list`}>
      <div className="progression__head">
        <h3 className="rail__heading" id={headingId}>
          {title}
        </h3>
        {access.editContent ? (
          <button
            className="button button--secondary button--sm"
            type="button"
            onClick={onAdd}
            disabled={busy}
            data-testid={`add-${kind}`}
          >
            <ActionIcon icon={Plus} />
            Add {one}
          </button>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="muted">
          {kind === 'form'
            ? `No forms. A form is a state ${entryName} can take, like a transformation or a stage.`
            : `No abilities. Add only the ones that matter to the story.`}
        </p>
      ) : (
        <ul className="progitems__list">
          {items.map((item, index) => {
            const unlock = unlockParts(item.unlock)
            return (
              <li className="progitems__item" key={item.id} data-testid={`${kind}-${item.name}`}>
                <div className="progitems__head">
                  <h4 className="progitems__name">
                    <bdi>{item.name}</bdi>
                  </h4>
                  {access.editContent ? (
                    <ActionMenu
                      label={`Actions for ${item.name}`}
                      triggerTestId={`${kind}-actions-${item.name}`}
                    >
                      <button
                        className="actionmenu__item"
                        type="button"
                        disabled={busy}
                        onClick={() => onEdit(item)}
                        data-testid={`edit-${kind}`}
                      >
                        <ActionIcon icon={Pencil} />
                        Edit {one}
                      </button>
                      {index > 0 ? (
                        <button
                          className="actionmenu__item"
                          type="button"
                          disabled={busy}
                          onClick={() => onMove(item, -1)}
                        >
                          <ActionIcon icon={ArrowUp} />
                          Move earlier
                        </button>
                      ) : null}
                      {index < items.length - 1 ? (
                        <button
                          className="actionmenu__item"
                          type="button"
                          disabled={busy}
                          onClick={() => onMove(item, 1)}
                        >
                          <ActionIcon icon={ArrowDown} />
                          Move later
                        </button>
                      ) : null}
                      <button
                        className="actionmenu__item actionmenu__item--danger"
                        type="button"
                        disabled={busy}
                        onClick={() => onRemove(item)}
                        data-testid={`remove-${kind}`}
                      >
                        <ActionIcon icon={Trash} />
                        Remove {one}
                      </button>
                    </ActionMenu>
                  ) : null}
                </div>
                {item.description ? (
                  <p className="progitems__description prose">{item.description}</p>
                ) : null}
                <dl className="progitems__facts">
                  {unlock.length > 0 ? (
                    <div>
                      <dt>First unlocked</dt>
                      <dd data-testid={`${kind}-unlock`}>{unlock.join(', ')}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Available in</dt>
                    <dd data-testid={`${kind}-available`}>
                      {item.eras.length === 0
                        ? 'No era ticked'
                        : item.eras.map((era) => era.name).join(', ')}
                    </dd>
                  </div>
                  {kind === 'form' &&
                  appearances.some((look) => look.forms.some((form) => form.id === item.id)) ? (
                    <div>
                      <dt>Looks</dt>
                      <dd data-testid="form-looks">
                        {appearances
                          .filter((look) => look.forms.some((form) => form.id === item.id))
                          .map((look) => look.label)
                          .join(', ')}
                      </dd>
                    </div>
                  ) : null}
                  {'forms' in item && item.forms.length > 0 ? (
                    <div>
                      <dt>Forms</dt>
                      <dd data-testid="ability-forms-read">
                        {item.forms.map((form) => form.name).join(', ')}
                      </dd>
                    </div>
                  ) : null}
                  {item.scenes.length > 0 ? (
                    <div>
                      <dt>Used in</dt>
                      <dd>
                        <ul className="eracovers">
                          {item.scenes.map((scene) => (
                            <li key={scene.id}>
                              {scene.isTrashed ? (
                                <span>{scene.title} (in Trash)</span>
                              ) : (
                                <Link
                                  to={`/app/universes/${universeId}/stories/${scene.storyId}#scene-${scene.id}`}
                                >
                                  {scene.title}
                                </Link>
                              )}
                              <span className="muted"> · {scene.storyTitle}</span>
                            </li>
                          ))}
                        </ul>
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** The progression's own history: each saved version with when and by whom, readable in place and put back on request. */
function ProgressionHistory({
  universeId,
  entityId,
  currentVersion,
  onRestored,
  onStale,
}: {
  universeId: string
  entityId: string
  currentVersion: number
  onRestored: (progression: Progression) => void
  onStale: () => void
}) {
  const [open, setOpen] = useState(false)
  const [revisions, setRevisions] = useState<ProgressionRevisionSummary[] | null>(null)
  const [opened, setOpened] = useState<ProgressionRevisionDetail | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    listProgressionRevisions(universeId, entityId, controller.signal)
      .then(setRevisions)
      .catch(() => {
        if (!controller.signal.aborted) setMessage('Era history could not be read.')
      })
    return () => controller.abort()
  }, [open, universeId, entityId])

  async function view(revision: ProgressionRevisionSummary) {
    if (opened?.id === revision.id) {
      setOpened(null)
      return
    }
    setMessage(null)
    try {
      setOpened(await getProgressionRevision(universeId, entityId, revision.id))
    } catch {
      setMessage('That version could not be read.')
    }
  }

  async function restore(revision: ProgressionRevisionSummary) {
    if (
      !(await confirmAction({
        title: `Put version ${revision.number} of the eras back?`,
        message:
          'The eras, forms and abilities become exactly what they were then; a version from before forms existed leaves them as they are. This is saved as a new version, so it can be undone.',
        confirmLabel: 'Restore this version',
      }))
    ) {
      return
    }
    setMessage(null)
    try {
      onRestored(
        await restoreProgressionRevision(universeId, entityId, revision.id, currentVersion),
      )
    } catch (error: unknown) {
      if (isChangedElsewhere(error, PROGRESSION_CHANGED)) {
        setMessage('The eras changed since this history was read. The latest are shown now.')
        onStale()
      } else {
        setMessage(
          error instanceof ApiError ? error.message : 'That version could not be restored.',
        )
      }
    }
  }

  return (
    <details
      className="erahistory"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      data-testid="era-history"
    >
      <summary className="erahistory__summary">
        <ActionIcon icon={History} />
        Era history
      </summary>
      {message ? (
        <p className="form__message" role="alert">
          {message}
        </p>
      ) : null}
      {revisions === null ? (
        open ? (
          <p className="muted">Reading history…</p>
        ) : null
      ) : (
        <ol className="history__list">
          {revisions.map((revision, index) => (
            <li
              className="history__item"
              key={revision.id}
              data-testid={`era-version-${revision.number}`}
            >
              <p className="history__line">
                <strong>Version {revision.number}</strong>{' '}
                {revision.kind === RevisionKind.Created
                  ? 'First saved'
                  : revision.kind === RevisionKind.Restored
                    ? 'Restored'
                    : 'Changed'}{' '}
                {formatDateTime(revision.createdAt)} <VersionActor name={revision.actorName} />
              </p>
              <div className="history__actions">
                <button
                  className="linkbutton"
                  type="button"
                  aria-label={`${opened?.id === revision.id ? 'Hide' : 'View'} version ${revision.number}`}
                  onClick={() => void view(revision)}
                >
                  {opened?.id === revision.id ? 'Hide' : 'View'}
                </button>
                {index > 0 ? (
                  <button
                    className="linkbutton"
                    type="button"
                    aria-label={`Restore version ${revision.number}`}
                    onClick={() => void restore(revision)}
                    data-testid={`restore-era-version-${revision.number}`}
                  >
                    Restore
                  </button>
                ) : null}
              </div>
              {opened?.id === revision.id ? (
                <ul className="namelist" data-testid={`era-version-${revision.number}-eras`}>
                  {opened.eras.length === 0 ? (
                    <li>No eras</li>
                  ) : (
                    opened.eras.map((era) => <li key={era.id}>{era.name}</li>)
                  )}
                  {opened.forms.map((form) => (
                    <li key={form.id}>Form: {form.name}</li>
                  ))}
                  {opened.abilities.map((ability) => (
                    <li key={ability.id}>Ability: {ability.name}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </details>
  )
}
