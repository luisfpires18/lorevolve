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
import { t, useI18n } from '../i18n'
import { ApiError } from '../lib/api'
import { confirmAction } from '../lib/confirm'
import { formatDateTime } from '../lib/dates'
import { isChangedElsewhere } from '../lib/editConflict'
import { renderFact } from '../lore/facts'
import { RevisionKind } from '../lore/revisions'
import type { EntityDetail, FieldDefinition } from '../lore/types'
import {
  abilityInputOf,
  appearanceDisplayUrl,
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

/** Getters, so each label is looked up in the current language when read. */
const SOURCE_LABELS: Record<FieldSource, string> = {
  get era() {
    return t('progression.view.source.era')
  },
  get cleared() {
    return t('progression.view.source.cleared')
  },
  get entry() {
    return t('progression.view.source.entry')
  },
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
  const { t, tn } = useI18n()
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
      <div className="notice notice--error" role="alert">
        <p>{t('progression.view.readFailed')}</p>
        <button className="button button--secondary" type="button" onClick={() => void load()}>
          {t('progression.view.retry')}
        </button>
      </div>
    )
  }

  if (!progression) {
    return <p className="muted">{t('progression.view.reading')}</p>
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
        setMessage(t('progression.view.changedElsewhere'))
        void load()
      } else {
        setMessage(error instanceof ApiError ? error.message : t('progression.view.saveFailed'))
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
        title: t('progression.view.removeStage.title', { name: era.name }),
        message: t('progression.view.removeStage.message', { name: entry.name }),
        confirmLabel: t('progression.view.removeStage.confirm'),
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
    if (
      !(await confirmAction({
        title:
          kind === 'form'
            ? t('progression.view.removeForm.title', { name: item.name })
            : t('progression.view.removeAbility.title', { name: item.name }),
        message:
          kind === 'form'
            ? t('progression.view.removeForm.message')
            : t('progression.view.removeAbility.message'),
        confirmLabel:
          kind === 'form'
            ? t('progression.view.removeForm.confirm')
            : t('progression.view.removeAbility.confirm'),
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
        title: t('progression.view.removeAppearance.title', { name: appearance.label }),
        message:
          pictures === 0
            ? t('progression.view.removeAppearance.messageEmpty')
            : tn('progression.view.removeAppearance.message', pictures, { n: pictures }),
        confirmLabel: t('progression.view.removeAppearance.confirm'),
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
        setMessage(t('progression.view.changedElsewhere'))
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
        error instanceof ApiError ? error.message : t('progression.view.removeAppearance.failed'),
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
          {t('progression.view.title')}
        </h2>
        {access.editContent ? (
          <button
            className="button button--secondary button--sm"
            type="button"
            onClick={() => setEditing('new')}
            data-testid="add-era"
          >
            <ActionIcon icon={Plus} />
            {t('progression.view.addStage')}
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
          title={t('progression.view.empty.title', { name: entry.name })}
          hint={t('progression.view.empty.hint')}
        />
      ) : (
        <>
          <nav
            className="eranav"
            aria-label={t('progression.view.nav', { name: entry.name })}
            data-testid="era-nav"
          >
            <ul className="eranav__list">
              <li>
                <Link
                  className="eranav__link"
                  to={{ search: withoutEra(params) }}
                  aria-current={selected ? undefined : 'page'}
                  data-testid="era-nav-main"
                >
                  {t('progression.view.mainProfile')}
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
                        ? t('progression.view.eraMeta.none')
                        : tn('progression.view.eraMeta.own', era.fields.length)}
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
  const { t } = useI18n()
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
          <p className="erapanel__eyebrow">{t('progression.era.eyebrow', { name: entry.name })}</p>
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
              {t('progression.era.edit')}
            </button>
            <ActionMenu
              label={t('progression.era.moreActions', { name: era.name })}
              triggerTestId="era-actions"
            >
              <button
                className="actionmenu__item"
                type="button"
                disabled={busy || isFirst}
                onClick={() => onMove(-1)}
                data-testid="era-earlier"
              >
                <ActionIcon icon={ArrowUp} />
                {t('progression.era.moveEarlier')}
              </button>
              <button
                className="actionmenu__item"
                type="button"
                disabled={busy || isLast}
                onClick={() => onMove(1)}
                data-testid="era-later"
              >
                <ActionIcon icon={ArrowDown} />
                {t('progression.era.moveLater')}
              </button>
              <hr className="actionmenu__divider" />
              <button
                className="actionmenu__item actionmenu__item--danger"
                type="button"
                disabled={busy}
                onClick={onRemove}
                data-testid="remove-era"
              >
                <ActionIcon icon={Trash} />
                {t('progression.era.remove')}
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
          <h4 className="rail__heading">{t('progression.era.covers')}</h4>
          <ul className="eracovers" data-testid="era-covers">
            {era.stories.map((story) => (
              <li key={story.id}>
                {story.isTrashed ? (
                  <span>{t('progression.era.inTrash', { title: story.title })}</span>
                ) : (
                  <Link to={`/app/universes/${universeId}/stories/${story.id}`}>{story.title}</Link>
                )}
              </li>
            ))}
            {era.scenes.map((scene) => (
              <li key={scene.id}>
                {scene.isTrashed ? (
                  <span>{t('progression.era.inTrash', { title: scene.title })}</span>
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

      <EraItems heading={t('progression.era.forms')} era={era} items={forms} testId="era-forms" />
      <EraItems
        heading={t('progression.era.abilities')}
        era={era}
        items={abilities}
        testId="era-abilities"
      />

      {looks.length > 0 ? (
        <div className="rail__block">
          <h4 className="rail__heading">{t('progression.era.appearances')}</h4>
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
                    decoding="async"
                    src={appearanceDisplayUrl(universeId, entry.id, look.id, look.images[0])}
                    alt=""
                    width={look.images[0].width}
                    height={look.images[0].height}
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

      <nav
        className="erasteps"
        aria-label={t('progression.era.otherStages', { name: entry.name })}
        data-testid="era-steps"
      >
        {previous ? (
          <Link className="erasteps__link" to={{ search: withEra(params, previous.id) }} rel="prev">
            <span aria-hidden="true">← </span>
            <span className="visually-hidden">{t('progression.era.earlier')}</span>
            <bdi>{previous.name}</bdi>
          </Link>
        ) : null}
        <Link
          className="erasteps__link"
          to={{ search: withoutEra(params) }}
          data-testid="era-steps-main"
        >
          {t('progression.era.mainProfile')}
        </Link>
        {next ? (
          <Link className="erasteps__link" to={{ search: withEra(params, next.id) }} rel="next">
            <span className="visually-hidden">{t('progression.era.later')}</span>
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
  const { t, tn } = useI18n()
  const counts = [
    [progression.eras.length, 'progression.overview.stages'],
    [progression.forms.length, 'progression.overview.forms'],
    [progression.abilities.length, 'progression.overview.abilities'],
    [progression.appearances.length, 'progression.overview.appearances'],
  ] as const
  const told = counts.filter(([count]) => count > 0).map(([count, key]) => tn(key, count))

  return (
    <div className="progoverview" data-testid="progression-overview">
      {entry.summary ? <p className="progoverview__summary prose">{entry.summary}</p> : null}
      <p className="progoverview__meta">
        {told.length > 0 ? <span data-testid="progression-counts">{told.join(' · ')}</span> : null}
        <Link
          to={`/app/universes/${universeId}/lore/${entry.id}`}
          data-testid="progression-article"
        >
          {t('progression.overview.article')}
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
  const { t } = useI18n()
  if (items.length === 0) return null
  return (
    <div className="rail__block">
      <h4 className="rail__heading">{heading}</h4>
      <ul className="eracovers" data-testid={testId}>
        {items.map((item) => (
          <li key={item.id} data-testid={`${testId}-${item.name}`}>
            <bdi>{item.name}</bdi>
            {item.unlock.era?.id === era.id ? (
              <span className="erasource erasource--era">
                {' '}
                {t('progression.era.firstUnlocked')}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

function unlockParts(unlock: UnlockMilestone) {
  return [
    unlock.era ? t('progression.unlock.era', { name: unlock.era.name }) : null,
    unlock.scene
      ? t(unlock.scene.isTrashed ? 'progression.unlock.sceneTrashed' : 'progression.unlock.scene', {
          title: unlock.scene.title,
        })
      : null,
    unlock.moment
      ? t(
          unlock.moment.isTrashed
            ? 'progression.unlock.momentTrashed'
            : 'progression.unlock.moment',
          { title: unlock.moment.title },
        )
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
  const { t } = useI18n()
  const access = useUniverseAccess()
  const words =
    kind === 'form'
      ? {
          title: t('progression.items.form.title'),
          add: t('progression.items.form.add'),
          edit: t('progression.items.form.edit'),
          remove: t('progression.items.form.remove'),
          empty: t('progression.items.form.empty', { name: entryName }),
        }
      : {
          title: t('progression.items.ability.title'),
          add: t('progression.items.ability.add'),
          edit: t('progression.items.ability.edit'),
          remove: t('progression.items.ability.remove'),
          empty: t('progression.items.ability.empty'),
        }
  const headingId = `${kind}-list-heading`

  if (items.length === 0 && !access.editContent) return null

  return (
    <section className="progitems" aria-labelledby={headingId} data-testid={`${kind}-list`}>
      <div className="progression__head">
        <h3 className="rail__heading" id={headingId}>
          {words.title}
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
            {words.add}
          </button>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="muted">{words.empty}</p>
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
                      label={t('progression.items.actions', { name: item.name })}
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
                        {words.edit}
                      </button>
                      {index > 0 ? (
                        <button
                          className="actionmenu__item"
                          type="button"
                          disabled={busy}
                          onClick={() => onMove(item, -1)}
                        >
                          <ActionIcon icon={ArrowUp} />
                          {t('progression.items.moveEarlier')}
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
                          {t('progression.items.moveLater')}
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
                        {words.remove}
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
                      <dt>{t('progression.items.firstUnlocked')}</dt>
                      <dd data-testid={`${kind}-unlock`}>{unlock.join(', ')}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>{t('progression.items.availableIn')}</dt>
                    <dd data-testid={`${kind}-available`}>
                      {item.eras.length === 0
                        ? t('progression.items.noStage')
                        : item.eras.map((era) => era.name).join(', ')}
                    </dd>
                  </div>
                  {kind === 'form' &&
                  appearances.some((look) => look.forms.some((form) => form.id === item.id)) ? (
                    <div>
                      <dt>{t('progression.items.looks')}</dt>
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
                      <dt>{t('progression.items.forms')}</dt>
                      <dd data-testid="ability-forms-read">
                        {item.forms.map((form) => form.name).join(', ')}
                      </dd>
                    </div>
                  ) : null}
                  {item.scenes.length > 0 ? (
                    <div>
                      <dt>{t('progression.items.usedIn')}</dt>
                      <dd>
                        <ul className="eracovers">
                          {item.scenes.map((scene) => (
                            <li key={scene.id}>
                              {scene.isTrashed ? (
                                <span>{t('progression.era.inTrash', { title: scene.title })}</span>
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
  useI18n() // Re-renders on a language change; the words are read through the module's t.
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
        if (!controller.signal.aborted) setMessage(t('progression.history.readFailed'))
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
      setMessage(t('progression.history.versionReadFailed'))
    }
  }

  async function restore(revision: ProgressionRevisionSummary) {
    if (
      !(await confirmAction({
        title: t('progression.history.restore.title', { number: revision.number }),
        message: t('progression.history.restore.message'),
        confirmLabel: t('progression.history.restore.confirm'),
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
        setMessage(t('progression.history.stale'))
        onStale()
      } else {
        setMessage(
          error instanceof ApiError ? error.message : t('progression.history.restoreFailed'),
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
        {t('progression.history.title')}
      </summary>
      {message ? (
        <p className="form__message" role="alert">
          {message}
        </p>
      ) : null}
      {revisions === null ? (
        open ? (
          <p className="muted">{t('progression.history.reading')}</p>
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
                <strong>{t('progression.history.version', { number: revision.number })}</strong>{' '}
                {revision.kind === RevisionKind.Created
                  ? t('progression.history.kind.created')
                  : revision.kind === RevisionKind.Restored
                    ? t('progression.history.kind.restored')
                    : t('progression.history.kind.changed')}{' '}
                {formatDateTime(revision.createdAt)} <VersionActor name={revision.actorName} />
              </p>
              <div className="history__actions">
                <button
                  className="linkbutton"
                  type="button"
                  aria-label={t(
                    opened?.id === revision.id
                      ? 'progression.history.hideVersion'
                      : 'progression.history.viewVersion',
                    { number: revision.number },
                  )}
                  onClick={() => void view(revision)}
                >
                  {opened?.id === revision.id
                    ? t('progression.history.hide')
                    : t('progression.history.view')}
                </button>
                {index > 0 ? (
                  <button
                    className="linkbutton"
                    type="button"
                    aria-label={t('progression.history.restoreVersion', {
                      number: revision.number,
                    })}
                    onClick={() => void restore(revision)}
                    data-testid={`restore-era-version-${revision.number}`}
                  >
                    {t('progression.history.restoreButton')}
                  </button>
                ) : null}
              </div>
              {opened?.id === revision.id ? (
                <ul className="namelist" data-testid={`era-version-${revision.number}-eras`}>
                  {opened.eras.length === 0 ? (
                    <li>{t('progression.history.noStages')}</li>
                  ) : (
                    opened.eras.map((era) => <li key={era.id}>{era.name}</li>)
                  )}
                  {opened.forms.map((form) => (
                    <li key={form.id}>{t('progression.history.formItem', { name: form.name })}</li>
                  ))}
                  {opened.abilities.map((ability) => (
                    <li key={ability.id}>
                      {t('progression.history.abilityItem', { name: ability.name })}
                    </li>
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
