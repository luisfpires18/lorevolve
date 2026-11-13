import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useUniverseAccess } from '../universes/access'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import { ActionIcon } from '../components/ActionIcon'
import { ActionMenu } from '../components/ActionMenu'
import { UNCHAPTERED } from '../stories/format'
import { EmptyState } from '../components/EmptyState'
import { EntityPicker, type EntityChoice } from '../components/EntityPicker'
import { TimelineEntryForm } from '../components/TimelineEntryForm'
import { findEra, formatChronologyYear, formatSignedYear } from '../chronology/format'
import { t, useI18n } from '../i18n'
import { ApiError } from '../lib/api'
import { CANON_LABELS, CANON_ORDER, FieldSemantic, type CanonStatusValue } from '../lore/types'
import { listStories } from '../stories/api'
import type { StorySummary } from '../stories/types'
import { deleteTimelineEntry, getTimelineEntry, listTimelineItems } from '../timeline/api'
import { formatTimelineDate, groupTimeline } from '../timeline/format'
import {
  DATE_KIND_LABELS,
  TimelineSource,
  type TimelineEntry,
  type TimelineItem,
  type TimelineItemPage,
  type TimelineSourceValue,
} from '../timeline/types'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { TypeIcon } from '../components/TypeIcon'
import type { WorkspaceContext } from './UniverseWorkspace'
import { confirmAction } from '../lib/confirm'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; page: TimelineItemPage }
  | { kind: 'error'; message: string }

type FormState = { mode: 'closed' } | { mode: 'new' } | { mode: 'edit'; entry: TimelineEntry }

/** The Source filter's values in the address: words, never the API's numbers. */
const SOURCES: { value: string; source: TimelineSourceValue; label: () => string }[] = [
  {
    value: 'moments',
    source: TimelineSource.Event,
    label: () => t('time.timeline.sources.moments'),
  },
  { value: 'scenes', source: TimelineSource.Scene, label: () => t('time.timeline.sources.scenes') },
  { value: 'lore', source: TimelineSource.LoreFact, label: () => t('time.timeline.sources.lore') },
]

/** What a row says it is, in words, so its kind never rests on a colour or a shape. */
const SOURCE_LABELS: Record<TimelineSourceValue, string> = {
  get [TimelineSource.Event]() {
    return t('time.timeline.sourceLabels.moment')
  },
  get [TimelineSource.Scene]() {
    return t('time.timeline.sourceLabels.scene')
  },
  get [TimelineSource.LoreFact]() {
    return t('time.timeline.sourceLabels.lore')
  },
}

/**
 * The universe's one timeline: the moments written here, every dated scene of every live story, and every live entry's birth
 * and death year, in the order they happen in the world. Only a moment is edited here; a scene or an entry is opened where it
 * lives, and its item follows whatever is saved there.
 *
 * A story's timeline is this same page with `?story=`: its dated scenes and the moments linked to it. Every filter, the
 * search and the page are in the address, so Back, a reload and a shared link all land where the reader was. Following an
 * entry ("Taking part") is the one choice kept on the page, as it always was.
 */
export default function TimelinePage() {
  const { tx } = useI18n()
  const access = useUniverseAccess()
  const { universe, chronology } = useOutletContext<WorkspaceContext>()

  const [params, setParams] = useSearchParams()
  const linkedMoment = params.get('moment')
  const storyId = params.get('story')
  const sourceParam = SOURCES.find((option) => option.value === params.get('source')) ?? null
  const statusParam = params.get('status')
  const canonStatus =
    statusParam !== null && CANON_ORDER.some((status) => String(status) === statusParam)
      ? (Number(statusParam) as CanonStatusValue)
      : null
  const search = params.get('q') ?? ''
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)

  const [participant, setParticipant] = useState<EntityChoice | null>(null)
  const [typed, setTyped] = useState(search)
  const [stories, setStories] = useState<StorySummary[] | null>(null)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [form, setForm] = useState<FormState>({ mode: 'closed' })
  const [message, setMessage] = useState<string | null>(null)
  const [reloads, setReloads] = useState(0)

  /** Writes filters into the address, dropping empty ones, and starts from the first page unless told otherwise. */
  const update = useCallback(
    (change: Record<string, string | null>) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          for (const [key, value] of Object.entries(change)) {
            if (value === null || value === '') next.delete(key)
            else next.set(key, value)
          }
          if (!('page' in change)) next.delete('page')
          return next
        },
        // Typing is one filter being written, not a history entry per pause.
        { replace: 'q' in change },
      )
    },
    [setParams],
  )

  // The box follows the address when the address moves on its own - Back, Forward, a link - and never overwrites what is
  // being typed with the search it just wrote.
  const written = useRef(search)
  useEffect(() => {
    if (search !== written.current) setTyped(search)
    written.current = search
  }, [search])

  useEffect(() => {
    if (typed === search) return
    const timer = setTimeout(() => {
      const next = typed.trim() === '' ? '' : typed
      written.current = next
      update({ q: next })
    }, 250)
    return () => {
      clearTimeout(timer)
    }
  }, [typed, search, update])

  // The story filter's choices. A universe holds a handful of stories, and the story list is unpaged for that reason.
  useEffect(() => {
    const controller = new AbortController()
    listStories(universe.id, controller.signal)
      .then(setStories)
      .catch(() => {
        if (!controller.signal.aborted) setStories([])
      })
    return () => {
      controller.abort()
    }
  }, [universe.id])

  /** Forgets `?moment=` in place, keeping every filter and the page. */
  const forgetMoment = useCallback(() => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete('moment')
        return next
      },
      { replace: true },
    )
  }, [setParams])

  // `?moment=<id>` opens that moment's editor wherever it sits in the chronology - the address a Canon finding or a rule's check
  // links to. The moment is read by id inside this universe, so an id from anywhere else simply is not here.
  useEffect(() => {
    if (!linkedMoment) return
    const controller = new AbortController()

    getTimelineEntry(universe.id, linkedMoment, controller.signal)
      .then((entry) => setForm({ mode: 'edit', entry }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setMessage(
          error instanceof ApiError && error.status === 404
            ? t('time.timeline.momentGone')
            : t('time.timeline.momentUnopened'),
        )
        forgetMoment()
      })

    return () => {
      controller.abort()
    }
  }, [universe.id, linkedMoment, forgetMoment])

  function closeForm() {
    setForm({ mode: 'closed' })
    if (linkedMoment) forgetMoment()
  }

  useEffect(() => {
    const controller = new AbortController()

    listTimelineItems(
      universe.id,
      {
        source: sourceParam?.source ?? null,
        storyId,
        canonStatus,
        entityId: participant?.id ?? null,
        search,
        page,
      },
      controller.signal,
    )
      .then((result) => setState({ kind: 'ready', page: result }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : t('time.timeline.readFailed'),
        })
      })

    return () => {
      controller.abort()
    }
  }, [universe.id, sourceParam?.source, storyId, canonStatus, participant, search, page, reloads])

  const reload = useCallback(() => setReloads((count) => count + 1), [])

  const result = state.kind === 'ready' ? state.page : null
  const isFiltered =
    sourceParam !== null ||
    canonStatus !== null ||
    participant !== null ||
    search.trim() !== '' ||
    storyId !== null
  const story = storyId ? (stories?.find((candidate) => candidate.id === storyId) ?? null) : null
  const storyPath = (id: string) => `/app/universes/${universe.id}/stories/${id}`

  async function remove(entry: TimelineEntry) {
    setMessage(null)
    const removed = await confirmAction({
      title: tx('time.timeline.remove.title', { title: <bdi>{entry.title}</bdi> }),
      message: t('time.timeline.remove.message'),
      confirmLabel: t('time.timeline.remove.confirm'),
      busyLabel: t('time.timeline.remove.busy'),
      variant: 'warning',
      failure: t('time.timeline.remove.failure'),
      action: () => deleteTimelineEntry(universe.id, entry.id),
    })
    if (!removed) return

    // Stepping back off a page that just emptied, rather than showing nothing at all.
    if (result && result.items.length === 1 && page > 1) {
      update({ page: String(page - 1) })
    } else {
      reload()
    }
  }

  const { groups, unreckoned, unplaced, mixedEras } = groupTimeline(result?.items ?? [], chronology)

  /**
   * One item on the spine. `heading` is the year already standing in the margin: an item known only to that year would repeat
   * it word for word, so its own stamp is dropped. A moment opens its drawer; a scene and a fact link to where they live.
   */
  function row(item: TimelineItem, heading?: string) {
    const stamp = formatTimelineDate(item.date, chronology)
    const restates = stamp === heading
    const source = item.sourceKind

    return (
      <li
        className="moment"
        key={`${source}:${item.sourceId}`}
        data-kind={item.date.kind}
        data-source={source}
        data-title={item.title}
        data-testid="timeline-item"
      >
        <span className="moment__mark" aria-hidden="true" />

        <div className="moment__head">
          <p className="moment__stamp">
            {stamp && !restates ? <span className="moment__when">{stamp}</span> : null}
            {/* The mark's shape and the date line already say exact, approximate ("c.") or a span; the word is said,
                and shown only where there is no date line to carry it. */}
            <span className={stamp ? 'moment__kind visually-hidden' : 'moment__kind'}>
              {DATE_KIND_LABELS[item.date.kind]}
            </span>
            <span className="moment__source" data-testid="timeline-source">
              {SOURCE_LABELS[source]}
            </span>
            {item.event ? (
              <StatusBadge
                step={item.event.canonStatus}
                label={CANON_LABELS[item.event.canonStatus]}
              />
            ) : null}
            {item.loreFact ? (
              <StatusBadge
                step={item.loreFact.canonStatus}
                label={CANON_LABELS[item.loreFact.canonStatus]}
              />
            ) : null}
          </p>
          {item.event && access.editContent ? momentMenu(item.event) : null}
        </div>

        {item.event ? momentBody(item.event) : null}
        {item.scene ? sceneBody(item, item.scene) : null}
        {item.loreFact ? factBody(item, item.loreFact) : null}
      </li>
    )
  }

  function momentMenu(entry: TimelineEntry) {
    return (
      <ActionMenu
        label={t('time.timeline.moreActions', { title: entry.title })}
        triggerTestId={`moment-actions-${entry.title}`}
      >
        <button
          className="actionmenu__item"
          type="button"
          onClick={() => setForm({ mode: 'edit', entry })}
          data-testid={`menu-edit-moment-${entry.title}`}
        >
          <ActionIcon icon={Pencil} />
          {t('time.timeline.editMoment')}
        </button>
        <hr className="actionmenu__divider" />
        <button
          className="actionmenu__item actionmenu__item--danger"
          type="button"
          onClick={() => void remove(entry)}
          data-testid={`delete-moment-${entry.title}`}
        >
          <ActionIcon icon={Trash2} />
          {t('time.timeline.deleteMoment')}
        </button>
      </ActionMenu>
    )
  }

  function momentBody(entry: TimelineEntry) {
    return (
      <>
        {/* The title is the way in: it opens the moment's drawer. */}
        <h3 className="moment__title">
          {access.editContent ? (
            <button
              className="moment__open"
              type="button"
              onClick={() => setForm({ mode: 'edit', entry })}
              data-testid={`edit-moment-${entry.title}`}
            >
              <bdi>{entry.title}</bdi>
            </button>
          ) : (
            <bdi data-testid={`moment-title-${entry.title}`}>{entry.title}</bdi>
          )}
        </h3>

        {entry.description ? <p className="moment__account prose">{entry.description}</p> : null}

        {entry.entities.length > 0 ? (
          <ul className="moment__cast">
            {entry.entities.map((link) => {
              const accent = link.entityTypeAccentColor
                ? ({ '--type-accent': link.entityTypeAccentColor } as CSSProperties)
                : undefined
              const icon = <TypeIcon iconKey={link.entityTypeIcon} className="lorechip__icon" />

              // A participant in the Trash is still stored on this moment and comes back
              // with it, so it is named rather than dropped - but it has no page to open
              // while it is in the Trash, so it is not a link.
              return (
                <li key={link.entityId}>
                  {link.isTrashed ? (
                    <span className="lorechip lorechip--trashed moment__player" style={accent}>
                      {icon}
                      <span className="lorechip__name">
                        <bdi>{link.name}</bdi>
                      </span>{' '}
                      <span className="lorechip__note">
                        {t('time.timeline.participantInTrash')}
                      </span>
                    </span>
                  ) : (
                    <Link
                      className="lorechip moment__player"
                      style={accent}
                      to={`/app/universes/${universe.id}/lore/${link.entityId}`}
                      title={link.entityTypeName}
                    >
                      {icon}
                      <span className="lorechip__name">
                        <bdi>{link.name}</bdi>
                      </span>
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        ) : null}

        {entry.stories.length > 0 ? (
          <p className="moment__context" data-testid={`moment-stories-${entry.title}`}>
            {entry.stories.length === 1 ? t('time.timeline.story') : t('time.timeline.stories')}
            {entry.stories.map((linked, index) => (
              <span key={linked.storyId}>
                {index > 0 ? ', ' : null}
                {linked.isTrashed ? (
                  <>
                    <bdi>{linked.title}</bdi> {t('time.timeline.storyInTrash')}
                  </>
                ) : (
                  <Link to={storyPath(linked.storyId)}>
                    <bdi>{linked.title}</bdi>
                  </Link>
                )}
              </span>
            ))}
          </p>
        ) : null}

        {entry.validation ? (
          <p className="moment__validation" data-testid={`moment-validation-${entry.title}`}>
            <span className="moment__validationlabel">{t('time.timeline.validation')}</span>
            <span>
              {entry.validation.eventKind ? <bdi>{entry.validation.eventKind.name}</bdi> : null}
              {entry.validation.method ? (
                <>
                  {entry.validation.eventKind ? ' · ' : null}
                  {tx('time.timeline.by', { name: <bdi>{entry.validation.method.name}</bdi> })}
                </>
              ) : null}
              {entry.validation.participant ? (
                <>
                  {entry.validation.eventKind || entry.validation.method ? ' · ' : null}
                  {tx('time.timeline.for', {
                    name: <bdi>{entry.validation.participant.name}</bdi>,
                  })}
                  {entry.validation.participant.isTrashed ? (
                    <> {t('time.timeline.participantTrashed')}</>
                  ) : null}
                </>
              ) : null}
            </span>
          </p>
        ) : null}
      </>
    )
  }

  /** A scene: its title, where it sits in its story, and the ways to it. Its date is edited on the scene. */
  function sceneBody(item: TimelineItem, scene: NonNullable<TimelineItem['scene']>) {
    const base = storyPath(scene.storyId)
    return (
      <>
        <h3 className="moment__title">
          <bdi>{item.title}</bdi>
        </h3>
        <p className="moment__context">
          {tx('time.timeline.sceneIn', {
            story: <bdi>{scene.storyTitle}</bdi>,
            // A chapter by its title: its number restarts in each arc, so alone it would not say which one (ADR 0070).
            chapter: scene.chapterTitle !== null ? <bdi>{scene.chapterTitle}</bdi> : UNCHAPTERED,
          })}
        </p>
        <p className="moment__links">
          <Link
            to={`${base}#scene-${item.sourceId}`}
            aria-label={t('time.timeline.openSceneLabel', { title: item.title })}
            data-testid="timeline-open-scene"
          >
            {t('time.timeline.openScene')}
          </Link>
          <Link
            to={`${base}/manuscript/${item.sourceId}`}
            aria-label={t('time.timeline.manuscriptLabel', { title: item.title })}
            data-testid="timeline-open-manuscript"
          >
            {t('time.timeline.manuscript')}
          </Link>
        </p>
      </>
    )
  }

  /** A birth or a death, said in a sentence. Its year is edited on the entry. */
  function factBody(item: TimelineItem, fact: NonNullable<TimelineItem['loreFact']>) {
    const accent = fact.entityTypeAccentColor
      ? ({ '--type-accent': fact.entityTypeAccentColor } as CSSProperties)
      : undefined
    return (
      <>
        <h3 className="moment__title">
          {tx(fact.fact === FieldSemantic.DeathYear ? 'time.timeline.dies' : 'time.timeline.born', {
            title: <bdi>{item.title}</bdi>,
          })}
        </h3>
        <p className="moment__context" style={accent}>
          <TypeIcon iconKey={fact.entityTypeIcon} className="lorechip__icon" />{' '}
          <bdi>{fact.entityTypeName}</bdi>
        </p>
        <p className="moment__links">
          <Link
            to={`/app/universes/${universe.id}/lore/${fact.entityId}`}
            aria-label={t('time.timeline.openEntryLabel', { title: item.title })}
            data-testid="timeline-open-lore"
          >
            {t('time.timeline.openEntry')}
          </Link>
        </p>
      </>
    )
  }

  const emptyTitle = storyId
    ? t('time.timeline.empty.storyTitle')
    : isFiltered
      ? t('time.timeline.empty.filteredTitle')
      : t('time.timeline.empty.title')
  const emptyHint = storyId
    ? t('time.timeline.empty.storyHint')
    : isFiltered
      ? t('time.timeline.empty.filteredHint')
      : t('time.timeline.empty.hint')

  return (
    <article className="chron">
      <PageHeader
        title={t('time.timeline.title')}
        lede={t('time.timeline.lede')}
        actions={
          access.editContent ? (
            <button
              className="button"
              type="button"
              onClick={() => setForm({ mode: 'new' })}
              data-testid="new-moment"
            >
              <ActionIcon icon={Plus} />
              {t('time.timeline.newMoment')}
            </button>
          ) : undefined
        }
      />

      <div className="controls chron__controls">
        <div className="controls__search">
          <label className="field__label" htmlFor="chron-search">
            {t('time.timeline.search')}
          </label>
          <input
            id="chron-search"
            className="field__input"
            type="search"
            name="q"
            autoComplete="off"
            placeholder={t('time.timeline.searchPlaceholder')}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            data-testid="chron-search"
          />
        </div>

        <div className="controls__filters">
          <div className="field">
            <label className="field__label" htmlFor="chron-story">
              {t('time.timeline.storyFilter')}
            </label>
            <select
              id="chron-story"
              className="field__input field__input--select"
              value={storyId ?? ''}
              onChange={(event) => update({ story: event.target.value })}
              data-testid="chron-story"
            >
              <option value="">{t('time.timeline.allStories')}</option>
              {storyId && stories && !story ? (
                <option value={storyId}>{t('time.timeline.storyUnavailableOption')}</option>
              ) : null}
              {(stories ?? []).map((one) => (
                <option key={one.id} value={one.id}>
                  {one.title}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="chron-source">
              {t('time.timeline.show')}
            </label>
            <select
              id="chron-source"
              className="field__input field__input--select"
              value={sourceParam?.value ?? ''}
              onChange={(event) => update({ source: event.target.value })}
              data-testid="chron-source"
            >
              <option value="">{t('time.timeline.everything')}</option>
              {SOURCES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label()}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="chron-canon">
              {t('time.timeline.status')}
            </label>
            <select
              id="chron-canon"
              className="field__input field__input--select"
              value={canonStatus ?? ''}
              onChange={(event) => update({ status: event.target.value })}
              data-testid="chron-canon"
            >
              <option value="">{t('time.timeline.anyStatus')}</option>
              {CANON_ORDER.map((status) => (
                <option key={status} value={status}>
                  {CANON_LABELS[status]}
                </option>
              ))}
            </select>
          </div>

          <EntityPicker
            label={t('time.timeline.takingPart')}
            universeId={universe.id}
            value={participant}
            onChange={(choice) => {
              setParticipant(choice)
              if (page !== 1) update({ page: null })
            }}
            placeholder={t('time.timeline.takingPartPlaceholder')}
          />
        </div>
      </div>

      {storyId ? (
        <p className="chron__scope" data-testid="chron-story-scope">
          {story
            ? tx('time.timeline.showing', {
                story: (
                  <Link to={storyPath(story.id)}>
                    <bdi>{story.title}</bdi>
                  </Link>
                ),
              })
            : stories
              ? t('time.timeline.storyNotAvailable')
              : null}{' '}
          <button
            className="button button--text"
            type="button"
            onClick={() => update({ story: null })}
            data-testid="chron-story-clear"
          >
            {t('time.timeline.showEvery')}
          </button>
        </p>
      ) : null}

      {canonStatus !== null &&
      (sourceParam === null || sourceParam.source === TimelineSource.Scene) ? (
        <p className="chron__aside" data-testid="chron-status-scenes">
          {t('time.timeline.scenesNoStatus')}
        </p>
      ) : null}

      {mixedEras ? (
        <p className="chron__caution" data-testid="chron-eras">
          {t('time.timeline.mixedLabels')}
        </p>
      ) : null}

      {message ? (
        <p className="form__message" role="alert" data-testid="chron-error">
          {message}
        </p>
      ) : null}

      {state.kind === 'loading' ? (
        <p className="notice" role="status">
          {t('time.timeline.reading')}
        </p>
      ) : null}

      {state.kind === 'error' ? (
        <div className="notice notice--error" role="alert">
          <p>{state.message}</p>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              setState({ kind: 'loading' })
              reload()
            }}
          >
            {t('time.timeline.tryAgain')}
          </button>
        </div>
      ) : null}

      {result && result.items.length > 0 ? (
        <div className="chron__stream" data-testid="chron-stream">
          {groups.map((group, index) => {
            const heading = formatChronologyYear(chronology, group.year, group.eraId)

            // The margin carries the year as the universe writes it, and the era's full name
            // beneath - or the free-text label of a universe that names no eras. An era with no
            // short label is written by its name, which would wrap the year across the narrow
            // margin, so there the margin shows the year and leaves the name to the line below.
            const era = findEra(chronology, group.eraId)
            const margin = era && !era.abbreviation ? formatSignedYear(group.year) : heading
            const aside = era ? era.name : group.eraLabel
            // The era's name is drawn where its years begin, and only said again after that: the year's own mark
            // carries it on every other group, and a column of the same long name is noise, not chronology.
            const previous = groups[index - 1]
            const repeatsEra =
              previous !== undefined &&
              previous.eraId === group.eraId &&
              previous.eraLabel === group.eraLabel

            return (
              <section className="chron__group" key={group.key}>
                <h2 className="chron__year">
                  <span className="chron__yearnum">{margin}</span>
                  {aside ? (
                    <span className={repeatsEra ? 'chron__era visually-hidden' : 'chron__era'}>
                      {aside}
                    </span>
                  ) : null}
                </h2>
                <ul className="chron__moments">
                  {group.entries.map((item) => row(item, heading))}
                </ul>
              </section>
            )
          })}

          {unreckoned.length > 0 ? (
            <section className="chron__group chron__group--unplaced" data-testid="chron-unreckoned">
              <h2 className="chron__year">
                <span className="chron__yearnum chron__yearnum--none">?</span>
                <span className="chron__era">{t('time.timeline.noPeriod')}</span>
              </h2>
              <div>
                <p className="chron__aside">{t('time.timeline.noPeriodHint')}</p>
                <ul className="chron__moments chron__moments--unplaced">
                  {unreckoned.map((item) => row(item))}
                </ul>
              </div>
            </section>
          ) : null}

          {unplaced.length > 0 ? (
            <section className="chron__group chron__group--unplaced">
              <h2 className="chron__year">
                <span className="chron__yearnum chron__yearnum--none">?</span>
                <span className="chron__era">{t('time.timeline.unplaced')}</span>
              </h2>
              <div>
                <p className="chron__aside">{t('time.timeline.unplacedHint')}</p>
                <ul className="chron__moments chron__moments--unplaced">
                  {unplaced.map((item) => row(item))}
                </ul>
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {result && result.items.length === 0 ? (
        <EmptyState
          testId="chron-empty"
          title={emptyTitle}
          hint={emptyHint}
          action={
            isFiltered || !access.editContent ? null : (
              <button
                className="button"
                type="button"
                onClick={() => setForm({ mode: 'new' })}
                data-testid="empty-new-moment"
              >
                <ActionIcon icon={Plus} />
                {t('time.timeline.emptyNewMoment')}
              </button>
            )
          }
        />
      ) : null}

      {result && result.totalPages > 1 ? (
        <nav className="pager" aria-label={t('time.timeline.pagination')}>
          <button
            className="button button--secondary"
            type="button"
            disabled={result.page <= 1}
            onClick={() => update({ page: String(result.page - 1) })}
          >
            {t('time.timeline.previous')}
          </button>
          <span className="pager__position">
            {t('time.timeline.page', { page: result.page, total: result.totalPages })}
          </span>
          <button
            className="button button--secondary"
            type="button"
            disabled={result.page >= result.totalPages}
            onClick={() => update({ page: String(result.page + 1) })}
          >
            {t('time.timeline.next')}
          </button>
        </nav>
      ) : null}

      {form.mode !== 'closed' ? (
        <TimelineEntryForm
          universeId={universe.id}
          entry={form.mode === 'edit' ? form.entry : null}
          chronology={chronology}
          // A new moment started from a story's timeline starts linked to that story.
          initialStories={
            form.mode === 'new' && story
              ? [{ storyId: story.id, title: story.title, isTrashed: false }]
              : []
          }
          onClose={closeForm}
          onSaved={() => {
            closeForm()
            reload()
          }}
        />
      ) : null}
    </article>
  )
}
