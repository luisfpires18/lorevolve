import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, Plus } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import { EmptyState } from './EmptyState'
import { SaveAction } from './SaveAction'
import { CanonBlockNotice } from './CanonBlockNotice'
import { blockingFindingsOf } from '../canon/blocked'
import type { CanonBlockingFinding } from '../canon/types'
import { getChronology, saveChronology } from '../chronology/api'
import {
  EraDirection,
  EraLabelPosition,
  type Chronology,
  type ChronologyInput,
  type EraDirectionValue,
  type EraLabelPositionValue,
} from '../chronology/types'
import { t, tn, useI18n } from '../i18n'
import { ApiError } from '../lib/api'
import { useLeaveGuard } from '../lib/leaveGuard'
import { PageHeader } from './PageHeader'
import { confirmDiscard } from '../lib/confirm'

/**
 * One date period as it is being edited. Text stays text until it is sent; counts ride along for display.
 *
 * Authors see "date periods"; the API, the tables and the backup still say era (ADR 0022, amended by refinement 018),
 * so the wire shape and the test ids keep that name.
 */
interface EraDraft {
  /** Stable across reordering, so React keeps each row's inputs with its period. */
  key: string
  id: string | null
  name: string
  abbreviation: string
  direction: EraDirectionValue
  labelPosition: EraLabelPositionValue
  momentCount: number
  yearCount: number
  sceneCount: number
  entryEraCount: number
  periodCount: number
}

function draftsFrom(chronology: Chronology): EraDraft[] {
  return chronology.eras.map((era) => ({
    key: era.id,
    id: era.id,
    name: era.name,
    abbreviation: era.abbreviation ?? '',
    direction: era.direction,
    labelPosition: era.labelPosition,
    momentCount: era.momentCount,
    yearCount: era.yearCount,
    sceneCount: era.sceneCount,
    entryEraCount: era.entryEraCount,
    periodCount: era.periodCount,
  }))
}

function inputOf(drafts: EraDraft[]): ChronologyInput {
  return {
    eras: drafts.map((era) => ({
      id: era.id,
      name: era.name.trim(),
      abbreviation: era.abbreviation.trim() || null,
      direction: era.direction,
      labelPosition: era.labelPosition,
    })),
  }
}

function joinAnd(parts: string[]) {
  return parts.join(t('time.periods.and'))
}

function usageOf(era: EraDraft) {
  const parts: string[] = []
  if (era.momentCount > 0)
    parts.push(tn('time.periods.counts.moments', era.momentCount, { n: era.momentCount }))
  if (era.yearCount > 0)
    parts.push(tn('time.periods.counts.years', era.yearCount, { n: era.yearCount }))
  if (era.sceneCount > 0)
    parts.push(tn('time.periods.counts.scenes', era.sceneCount, { n: era.sceneCount }))
  if (era.entryEraCount > 0)
    parts.push(tn('time.periods.counts.entryEras', era.entryEraCount, { n: era.entryEraCount }))
  if (era.periodCount > 0)
    parts.push(tn('time.periods.counts.periods', era.periodCount, { n: era.periodCount }))
  return parts.length === 0 ? null : t('time.periods.usage', { list: joinAnd(parts) })
}

/** A year of 10 written the way a period asks. An example of the format only - never a bound. */
function ExampleYear({ label, position }: { label: string; position: EraLabelPositionValue }) {
  return position === EraLabelPosition.AfterYear ? (
    <>
      10 <bdi>{label}</bdi>
    </>
  ) : (
    <>
      <bdi>{label}</bdi> 10
    </>
  )
}

const DIRECTIONS: { value: EraDirectionValue; label: () => string; testId: string }[] = [
  { value: EraDirection.Ascending, label: () => t('time.periods.up'), testId: 'era-direction-up' },
  {
    value: EraDirection.Descending,
    label: () => t('time.periods.down'),
    testId: 'era-direction-down',
  },
]

interface ChronologyEditorProps {
  universeId: string
  chronology: Chronology
  onSaved: (next: Chronology) => void
}

/**
 * Where a universe's date periods are named, ordered and turned the right way round - the Chronology section, head and
 * body. No periods is plain numbered years, and says so; the first period is one button away.
 *
 * It draws the page's own `PageHeader`, as every worldbuilding section does, because the header's primary action - Add
 * date period - is this editor's: the drafts live here. A new period's name takes the focus, since the button that made
 * it sits at the head of the page and the row appears below.
 *
 * A period is unbounded: its years count up from 1, or down to 1, as far as the author's dates go. Nothing here shows a
 * range - the example year of 10 only shows how a date is written. (The preview before 018 drew "BF 120, BF 1, AF 1,
 * AF 120" from a hard-coded sample, and read as a 120-year limit that never existed.)
 *
 * The whole list is saved at once, so reordering two periods is one change rather than a moment where both sit in the
 * same place. A period something is dated in cannot be removed here - the button says why rather than letting the API
 * refuse it - and a change that would make settled canon contradict itself comes back as the same refusal every gated
 * form shows.
 */
export function ChronologyEditor({ universeId, chronology, onSaved }: ChronologyEditorProps) {
  useI18n()
  const [stored, setStored] = useState(chronology)
  const [drafts, setDrafts] = useState(() => draftsFrom(chronology))
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<CanonBlockingFinding[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [saves, setSaves] = useState(0)
  // Said aloud after a move, since the list reorders under the focused button.
  const [moved, setMoved] = useState('')
  const statusId = useId()
  const headingId = useId()
  // The period just added, whose name takes the focus once it is drawn.
  const focusNew = useRef<string | null>(null)
  const touched = useRef(false)
  const created = useRef(0)

  // The workspace read the chronology when the universe opened. How much is dated in each period
  // may have moved since, so this screen asks again - without trampling an edit already begun.
  useEffect(() => {
    const controller = new AbortController()

    getChronology(universeId, controller.signal)
      .then((fresh) => {
        setStored(fresh)
        if (!touched.current) setDrafts(draftsFrom(fresh))
        onSaved(fresh)
      })
      .catch(() => {
        // The workspace's copy stands in; saving still reports anything that has moved.
      })

    return () => {
      controller.abort()
    }
  }, [universeId, onSaved])

  const dirty = JSON.stringify(inputOf(drafts)) !== JSON.stringify(inputOf(draftsFrom(stored)))
  // Periods put back as they were read clean; a failed save leaves the draft, and the question, standing.
  useLeaveGuard(dirty ? t('time.periods.leaveGuard') : null)

  function change(next: EraDraft[]) {
    touched.current = true
    setDrafts(next)
  }

  function update(index: number, part: Partial<EraDraft>) {
    change(drafts.map((era, position) => (position === index ? { ...era, ...part } : era)))
  }

  useEffect(() => {
    if (!focusNew.current) return
    document.getElementById(focusNew.current)?.focus()
    focusNew.current = null
  }, [drafts])

  function move(index: number, by: -1 | 1) {
    const to = index + by
    if (to < 0 || to >= drafts.length) return
    const next = [...drafts]
    const [era] = next.splice(index, 1)
    next.splice(to, 0, era)
    change(next)
    setMoved(
      t('time.periods.moved', {
        name: era.name.trim() || t('time.periods.newCap'),
        position: to + 1,
        total: next.length,
      }),
    )
  }

  function add() {
    created.current += 1
    focusNew.current = `era-new-${created.current}-name`
    change([
      ...drafts,
      {
        key: `new-${created.current}`,
        id: null,
        name: '',
        abbreviation: '',
        direction: EraDirection.Ascending,
        labelPosition: EraLabelPosition.BeforeYear,
        momentCount: 0,
        yearCount: 0,
        sceneCount: 0,
        entryEraCount: 0,
        periodCount: 0,
      },
    ])
  }

  async function discard() {
    if (!(await confirmDiscard(t('time.periods.discardConfirm')))) return
    touched.current = false
    setDrafts(draftsFrom(stored))
    setFieldErrors({})
    setMessage(null)
    setBlocked(null)
  }

  async function save() {
    setSaving(true)
    setMessage(null)
    setFieldErrors({})
    setBlocked(null)

    try {
      const next = await saveChronology(universeId, inputOf(drafts))
      touched.current = false
      setStored(next)
      setDrafts(draftsFrom(next))
      onSaved(next)
      setSaves((count) => count + 1)
    } catch (error: unknown) {
      const blocking = blockingFindingsOf(error)
      if (blocking) {
        setBlocked(blocking)
      } else if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors)
        setMessage(
          Object.keys(error.fieldErrors).length === 0
            ? error.message
            : t('time.periods.needChange'),
        )
      } else {
        setMessage(t('time.periods.saveFailed'))
      }
    } finally {
      setSaving(false)
    }
  }

  const unplacedParts = [
    stored.unplacedMomentCount > 0
      ? tn('time.periods.counts.timelineMoments', stored.unplacedMomentCount, {
          n: stored.unplacedMomentCount,
        })
      : null,
    stored.unplacedYearCount > 0
      ? tn('time.periods.counts.birthDeathYears', stored.unplacedYearCount, {
          n: stored.unplacedYearCount,
        })
      : null,
  ].filter((part): part is string => part !== null)

  const unplacedTotal = stored.unplacedMomentCount + stored.unplacedYearCount
  const storedNamesEras = stored.eras.length > 0

  return (
    <>
      <PageHeader
        title={t('time.periods.title')}
        lede={<p>{t('time.periods.lede')}</p>}
        actions={
          <button className="button" type="button" onClick={add} data-testid="add-era">
            <ActionIcon icon={Plus} />
            {t('time.periods.add')}
          </button>
        }
      />
      <section className="chronology" aria-labelledby={headingId} data-testid="chronology-settings">
        <h2 className="settings__heading" id={headingId}>
          {t('time.periods.heading')}
        </h2>

        {drafts.length === 0 ? (
          <EmptyState
            testId="chronology-empty"
            title={
              storedNamesEras ? t('time.periods.empty.saveToGoBack') : t('time.periods.empty.plain')
            }
            hint={t('time.periods.empty.hint')}
            action={
              <button className="button" type="button" onClick={add} data-testid="add-era-empty">
                <ActionIcon icon={Plus} />
                {t('time.periods.add')}
              </button>
            }
          />
        ) : (
          <p className="settings__note" data-testid="chronology-note">
            {t('time.periods.note')}
          </p>
        )}

        {drafts.length > 0 && unplacedTotal > 0 ? (
          <p
            className="callout callout--warning settings__caution"
            data-testid="chronology-unplaced"
          >
            {storedNamesEras ? (
              <>
                <strong>
                  {tn('time.periods.unplaced.lead', unplacedTotal, { n: unplacedTotal })}
                </strong>{' '}
                {tn('time.periods.unplaced.rest', unplacedTotal, { list: joinAnd(unplacedParts) })}
              </>
            ) : (
              <>
                <strong>
                  {tn('time.periods.plainYear.lead', unplacedTotal, { n: unplacedTotal })}
                </strong>{' '}
                {tn('time.periods.plainYear.rest', unplacedTotal, { list: joinAnd(unplacedParts) })}
              </>
            )}
            {stored.unplacedMomentCount > 0 ? (
              <>
                {' '}
                <Link
                  to={`/app/universes/${universeId}/timeline`}
                  data-testid="chronology-unplaced-link"
                >
                  {t('time.periods.openTimeline')}
                </Link>
              </>
            ) : null}
          </p>
        ) : null}

        {drafts.length > 1 ? (
          <div className="eras__order">
            <p className="field__label" id={`${headingId}-order`}>
              {t('time.periods.earliestFirst')}
            </p>
            <ol
              className="eras__line"
              aria-labelledby={`${headingId}-order`}
              data-testid="era-order"
            >
              {drafts.map((era) => (
                <li key={era.key}>
                  <bdi>{era.name.trim() || t('time.periods.newCap')}</bdi>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {drafts.length > 0 ? (
          <ol className="eras" data-testid="eras">
            {drafts.map((era, index) => {
              const prefix = `eras[${index}]`
              const base = `era-${era.key}`
              const name = era.name.trim() || t('time.periods.newLower')
              const label =
                era.abbreviation.trim() || era.name.trim() || t('time.periods.labelDefault')
              const usage = usageOf(era)
              const inUse = usage !== null
              const first = index === 0
              const last = index === drafts.length - 1

              return (
                <li className="era" key={era.key} data-testid="era">
                  <span className="era__ordinal" aria-hidden="true">
                    {index + 1}
                  </span>

                  <div className="era__body">
                    <div className="era__fields">
                      <div className="field">
                        <label className="field__label" htmlFor={`${base}-name`}>
                          {t('time.periods.name')}
                        </label>
                        <input
                          id={`${base}-name`}
                          className="field__input"
                          placeholder={t('time.periods.namePlaceholder')}
                          autoComplete="off"
                          value={era.name}
                          onChange={(event) => update(index, { name: event.target.value })}
                          aria-invalid={fieldErrors[`${prefix}.name`] ? true : undefined}
                          data-testid="era-name"
                        />
                        {fieldErrors[`${prefix}.name`] ? (
                          <p className="field__error">{fieldErrors[`${prefix}.name`]}</p>
                        ) : null}
                      </div>

                      <div className="field">
                        <label className="field__label" htmlFor={`${base}-abbreviation`}>
                          {t('time.periods.shortLabel')}
                        </label>
                        <input
                          id={`${base}-abbreviation`}
                          className="field__input"
                          placeholder={t('time.periods.abbreviationPlaceholder')}
                          autoComplete="off"
                          value={era.abbreviation}
                          onChange={(event) => update(index, { abbreviation: event.target.value })}
                          aria-invalid={fieldErrors[`${prefix}.abbreviation`] ? true : undefined}
                          aria-describedby={
                            era.abbreviation.trim() ? undefined : `${base}-abbreviation-hint`
                          }
                          data-testid="era-abbreviation"
                        />
                        {/* Only while empty: once there is a label, Write dates as shows it in use. */}
                        {era.abbreviation.trim() ? null : (
                          <p className="field__hint" id={`${base}-abbreviation-hint`}>
                            {t('time.periods.abbreviationHint')}
                          </p>
                        )}
                        {fieldErrors[`${prefix}.abbreviation`] ? (
                          <p className="field__error">{fieldErrors[`${prefix}.abbreviation`]}</p>
                        ) : null}
                      </div>

                      <div className="field">
                        <span className="field__label" id={`${base}-direction`}>
                          {t('time.periods.yearsCount')}
                        </span>
                        <div
                          className="segmented"
                          role="group"
                          aria-labelledby={`${base}-direction`}
                          aria-describedby={`${base}-direction-hint`}
                          data-testid="era-direction"
                        >
                          {DIRECTIONS.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              className="segmented__option"
                              aria-pressed={era.direction === option.value}
                              onClick={() => update(index, { direction: option.value })}
                              data-testid={option.testId}
                            >
                              {option.label()}
                            </button>
                          ))}
                        </div>
                        <p
                          className="field__hint era__run"
                          id={`${base}-direction-hint`}
                          data-testid="era-run"
                        >
                          {era.direction === EraDirection.Descending ? (
                            <>
                              <span className="era__sequence" aria-hidden="true">
                                … → 3 → 2 → 1
                              </span>
                              <span className="visually-hidden">
                                {t('time.periods.countDown.spoken')}
                              </span>
                              {t('time.periods.countDown.text')}
                            </>
                          ) : (
                            <>
                              <span className="era__sequence" aria-hidden="true">
                                1 → 2 → 3 → …
                              </span>
                              <span className="visually-hidden">
                                {t('time.periods.countUp.spoken')}
                              </span>
                              {t('time.periods.countUp.text')}
                            </>
                          )}
                        </p>
                      </div>

                      <div className="field">
                        <span className="field__label" id={`${base}-position`}>
                          {t('time.periods.writeAs')}
                        </span>
                        <div
                          className="segmented"
                          role="group"
                          aria-labelledby={`${base}-position`}
                          data-testid="era-position"
                        >
                          {[EraLabelPosition.BeforeYear, EraLabelPosition.AfterYear].map(
                            (position) => (
                              <button
                                key={position}
                                type="button"
                                className="segmented__option"
                                aria-pressed={era.labelPosition === position}
                                onClick={() => update(index, { labelPosition: position })}
                                data-testid={
                                  position === EraLabelPosition.AfterYear
                                    ? 'era-position-after'
                                    : 'era-position-before'
                                }
                              >
                                <ExampleYear label={label} position={position} />
                              </button>
                            ),
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="era__foot">
                      <p className="era__use" id={`${base}-use`}>
                        {usage ??
                          (era.id ? t('time.periods.nothingDated') : t('time.periods.notSaved'))}
                      </p>
                      <div className="era__tools">
                        <button
                          className="button button--secondary button--sm"
                          type="button"
                          onClick={() => move(index, -1)}
                          aria-disabled={first ? true : undefined}
                          aria-label={t('time.periods.moveEarlier', { name })}
                          data-testid="era-earlier"
                        >
                          <ActionIcon icon={ArrowUp} />
                          {t('time.periods.earlier')}
                        </button>
                        <button
                          className="button button--secondary button--sm"
                          type="button"
                          onClick={() => move(index, 1)}
                          aria-disabled={last ? true : undefined}
                          aria-label={t('time.periods.moveLater', { name })}
                          data-testid="era-later"
                        >
                          <ActionIcon icon={ArrowDown} />
                          {t('time.periods.later')}
                        </button>
                        <button
                          className="button button--secondary button--sm"
                          type="button"
                          onClick={() => {
                            if (!inUse) change(drafts.filter((_, position) => position !== index))
                          }}
                          aria-disabled={inUse ? true : undefined}
                          aria-describedby={inUse ? `${base}-use ${base}-keep` : undefined}
                          title={inUse ? t('time.periods.inUseTitle') : undefined}
                          aria-label={t('time.periods.removeNamed', { name })}
                          data-testid="era-remove"
                        >
                          {t('time.periods.remove')}
                        </button>
                        {inUse ? (
                          <span className="visually-hidden" id={`${base}-keep`}>
                            {t('time.periods.inUseHidden')}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        ) : null}

        <p className="visually-hidden" role="status" data-testid="era-moved">
          {moved}
        </p>

        {fieldErrors.eras ? <p className="field__error">{fieldErrors.eras}</p> : null}

        {blocked ? (
          <CanonBlockNotice universeId={universeId} findings={blocked} linkSubjects />
        ) : null}

        {message ? (
          <p className="form__message" role="alert" data-testid="chronology-error">
            {message}
          </p>
        ) : null}

        {/* Nothing to save and no periods to save: no lone disabled button under the empty state. */}
        {dirty || drafts.length > 0 ? (
          <div className="form__actions eras__actions">
            <SaveAction
              label={t('time.periods.save')}
              isDirty={dirty}
              isSaving={saving}
              saves={saves}
              restingStatus={t('time.periods.saved')}
              statusId={statusId}
              statusTestId="chronology-status"
              testId="save-chronology"
              type="button"
              onSave={() => void save()}
            />
            {dirty ? (
              <button className="button button--secondary" type="button" onClick={discard}>
                {t('time.periods.discard')}
              </button>
            ) : null}
          </div>
        ) : null}
      </section>
    </>
  )
}
