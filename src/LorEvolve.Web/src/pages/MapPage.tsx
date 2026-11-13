import { useCallback, useEffect, useId, useState } from 'react'
import { ImageUp, MapPin as MapPinIcon, Pencil, Plus, Trash2 } from 'lucide-react'
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import { ActionIcon } from '../components/ActionIcon'
import { ActionMenu } from '../components/ActionMenu'
import { EmptyState } from '../components/EmptyState'
import { MapCalibrationForm, MapScaleSummary, type Fraction } from '../components/MapCalibration'
import { MapForm } from '../components/MapForm'
import { MapPinForm } from '../components/MapPinForm'
import { MapViewer } from '../components/MapViewer'
import { Quoted } from '../components/NameList'
import { PageHeader } from '../components/PageHeader'
import { TypeIcon } from '../components/TypeIcon'
import { ApiError } from '../lib/api'
import { confirmAction } from '../lib/confirm'
import { deleteMap, deletePin, getMap, mapImageUrl, mapsPath, updatePin } from '../maps/api'
import type { MapDetail, MapPin } from '../maps/types'
import { useUniverseAccess } from '../universes/access'
import { useI18n } from '../i18n'
import type { MapsListNotice } from './MapsPage'
import type { WorkspaceContext } from './UniverseWorkspace'

type LoadState =
  { kind: 'loading' } | { kind: 'ready'; map: MapDetail } | { kind: 'missing' } | { kind: 'error' }

type PinForm = { kind: 'new'; at: { x: number; y: number } } | { kind: 'edit'; pin: MapPin }

type MapDialog = 'details' | 'replace' | null

/**
 * One map (issue #52, ADR 0060): the picture panned and zoomed, its pins on it and beside it, and - for an Editor or the
 * owner - the authoring: place a pin by pressing the map or by typing where it goes, drag it or edit its numbers to move
 * it, link it to the entry it stands for, replace the picture with an explicit decision about the pins, rename, delete.
 *
 * The chosen pin lives in the address as `?pin=`, so the entry's page and the assistant can open the map on one pin, and a
 * reload lands where it was. The list beside the picture is the keyboard's and the screen reader's way to every pin,
 * whatever the zoom; the picture's own pins are buttons too.
 */
export default function MapPage() {
  const { t, tn, tx } = useI18n()
  const access = useUniverseAccess()
  const { universe } = useOutletContext<WorkspaceContext>()
  const { mapId } = useParams<{ mapId: string }>()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const headingId = useId()
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [reads, setReads] = useState(0)
  const [placing, setPlacing] = useState(false)
  const [pinForm, setPinForm] = useState<PinForm | null>(null)
  const [dialog, setDialog] = useState<MapDialog>(null)
  const [focusPinId, setFocusPinId] = useState<string | null>(params.get('pin'))
  const [failure, setFailure] = useState<string | null>(null)
  // Calibrating (issue #53): the two points marked so far, or null when not calibrating.
  const [calibrating, setCalibrating] = useState<Fraction[] | null>(null)

  const selectedPinId = params.get('pin')

  const load = useCallback(
    (signal?: AbortSignal) => {
      if (!mapId) return
      getMap(universe.id, mapId, signal)
        .then((map) => setState({ kind: 'ready', map }))
        .catch((error: unknown) => {
          if (signal?.aborted) return
          setState(
            error instanceof ApiError && error.status === 404
              ? { kind: 'missing' }
              : { kind: 'error' },
          )
        })
    },
    [universe.id, mapId],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load, reads])

  // A pin the address names that the map does not hold: the address is corrected rather than left pointing at nothing.
  useEffect(() => {
    if (state.kind !== 'ready' || !selectedPinId) return
    if (!state.map.pins.some((pin) => pin.id === selectedPinId)) {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          next.delete('pin')
          return next
        },
        { replace: true },
      )
    }
  }, [state, selectedPinId, setParams])

  function select(pinId: string | null, focus = false) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (pinId) next.set('pin', pinId)
        else next.delete('pin')
        return next
      },
      { replace: true },
    )
    if (focus && pinId) setFocusPinId(pinId)
  }

  function replaceMap(map: MapDetail) {
    setState({ kind: 'ready', map })
  }

  function pinSaved(saved: MapPin) {
    setPinForm(null)
    setPlacing(false)
    setState((current) => {
      if (current.kind !== 'ready') return current
      const pins = current.map.pins.some((pin) => pin.id === saved.id)
        ? current.map.pins.map((pin) => (pin.id === saved.id ? saved : pin))
        : [...current.map.pins, saved].sort((a, b) => a.title.localeCompare(b.title))
      return {
        kind: 'ready',
        map: {
          ...current.map,
          pins,
          pinsAwaitingReview: pins.filter((pin) => !pin.placedOnCurrentImage).length,
        },
      }
    })
    select(saved.id)
  }

  async function movePin(pin: MapPin, x: number, y: number) {
    setFailure(null)
    try {
      const saved = await updatePin(universe.id, mapId!, pin.id, {
        title: pin.title,
        note: pin.note,
        x,
        y,
        entityId: pin.lore && !pin.lore.isTrashed ? pin.lore.id : null,
      })
      pinSaved(saved)
    } catch (error: unknown) {
      setFailure(error instanceof ApiError ? error.message : t('places.mapPage.moveFailed'))
      setReads((current) => current + 1)
    }
  }

  async function removePin(pin: MapPin) {
    const confirmed = await confirmAction({
      title: tx('places.mapPage.removePinTitle', { pin: <Quoted text={pin.title} /> }),
      message: pin.lore ? t('places.mapPage.removePinLore') : t('places.mapPage.removePinOnly'),
      confirmLabel: t('places.mapPage.removePinConfirm'),
      variant: 'destructive',
      action: () => deletePin(universe.id, mapId!, pin.id),
    })
    if (!confirmed) return
    setState((current) =>
      current.kind === 'ready'
        ? {
            kind: 'ready',
            map: {
              ...current.map,
              pins: current.map.pins.filter((each) => each.id !== pin.id),
              pinsAwaitingReview: current.map.pins.filter(
                (each) => each.id !== pin.id && !each.placedOnCurrentImage,
              ).length,
            },
          }
        : current,
    )
    if (selectedPinId === pin.id) select(null)
  }

  async function removeMap(map: MapDetail) {
    const confirmed = await confirmAction({
      title: tx('places.mapPage.deleteTitle', { map: <Quoted text={map.name} /> }),
      message: t('places.mapPage.deleteMessage'),
      details:
        map.pins.length > 0
          ? [tn('places.mapPage.pinCount', map.pins.length, { n: map.pins.length })]
          : undefined,
      confirmLabel: t('places.mapPage.deleteConfirm'),
      variant: 'destructive',
      action: () => deleteMap(universe.id, map.id),
    })
    if (!confirmed) return
    void navigate(mapsPath(universe.id), {
      state: { deleted: { name: map.name } } satisfies MapsListNotice,
    })
  }

  if (state.kind === 'loading') {
    return (
      <p className="notice" role="status">
        {t('places.mapPage.loading')}
      </p>
    )
  }

  if (state.kind === 'missing') {
    return (
      <EmptyState
        testId="map-missing"
        title={t('places.mapPage.missingTitle')}
        hint={tx('places.mapPage.missingHint', {
          link: <Link to={mapsPath(universe.id)}>{t('places.mapPage.missingLink')}</Link>,
        })}
      />
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="notice notice--error" role="alert" data-testid="map-load-error">
        <p>{t('places.mapPage.error')}</p>
        <button
          className="button button--secondary"
          type="button"
          onClick={() => setReads((current) => current + 1)}
        >
          {t('places.mapPage.retry')}
        </button>
      </div>
    )
  }

  const { map } = state
  const selected = map.pins.find((pin) => pin.id === selectedPinId) ?? null
  const canEdit = access.editContent

  return (
    <section
      className="mapscreen"
      aria-labelledby={headingId}
      data-testid="map-page"
      data-map-id={map.id}
    >
      <PageHeader
        title={<bdi>{map.name}</bdi>}
        titleId={headingId}
        titleTestId="map-name"
        crumb={<Link to={mapsPath(universe.id)}>{t('places.mapPage.crumb')}</Link>}
        lede={map.description ? <span dir="auto">{map.description}</span> : undefined}
        actions={
          canEdit ? (
            <>
              <button
                className="button"
                type="button"
                aria-pressed={placing}
                disabled={calibrating !== null}
                onClick={() => setPlacing((current) => !current)}
                data-testid="map-add-pin"
              >
                <ActionIcon icon={Plus} />
                {placing ? t('places.mapPage.placingButton') : t('places.mapPage.addPin')}
              </button>
              <ActionMenu
                label={t('places.mapPage.moreActions', { name: map.name })}
                triggerTestId="map-actions"
                panelTestId="map-actions-panel"
              >
                <button
                  className="actionmenu__item"
                  type="button"
                  onClick={() => setDialog('details')}
                  data-testid="map-edit-details"
                >
                  <ActionIcon icon={Pencil} />
                  {t('places.mapPage.editDetails')}
                </button>
                <button
                  className="actionmenu__item"
                  type="button"
                  onClick={() => setDialog('replace')}
                  data-testid="map-replace-image"
                >
                  <ActionIcon icon={ImageUp} />
                  {t('places.mapPage.replacePicture')}
                </button>
                <hr className="actionmenu__divider" />
                <button
                  className="actionmenu__item actionmenu__item--danger"
                  type="button"
                  onClick={() => void removeMap(map)}
                  data-testid="map-delete"
                >
                  <ActionIcon icon={Trash2} />
                  {t('places.mapPage.deleteMap')}
                </button>
              </ActionMenu>
            </>
          ) : undefined
        }
      />

      {map.pinsAwaitingReview > 0 ? (
        <p className="callout mapscreen__review" role="status" data-testid="map-review-notice">
          {tn(
            canEdit ? 'places.mapPage.reviewEditor' : 'places.mapPage.reviewViewer',
            map.pinsAwaitingReview,
            { n: map.pinsAwaitingReview },
          )}
        </p>
      ) : null}

      {calibrating ? (
        <p className="callout mapscreen__placing" role="status" data-testid="map-calibrating-hint">
          {t('places.mapPage.calibrating')}
        </p>
      ) : null}

      {placing ? (
        <p className="callout mapscreen__placing" role="status" data-testid="map-placing-hint">
          {tx('places.mapPage.placing', {
            position: (
              <button
                className="button button--text"
                type="button"
                onClick={() => setPinForm({ kind: 'new', at: { x: 0.5, y: 0.5 } })}
                data-testid="map-place-centre"
              >
                {t('places.mapPage.typePosition')}
              </button>
            ),
          })}{' '}
          <button className="button button--text" type="button" onClick={() => setPlacing(false)}>
            {t('places.mapPage.cancel')}
          </button>
        </p>
      ) : null}

      {failure ? (
        <p className="form__message" role="alert" data-testid="map-failure">
          {failure}
        </p>
      ) : null}

      <div className="mapscreen__body">
        <MapViewer
          src={mapImageUrl(universe.id, map.id, map.image.assetId, 'display')}
          width={map.image.width}
          height={map.image.height}
          name={map.name}
          pins={map.pins}
          selectedPinId={selectedPinId}
          onSelectPin={(pinId) => select(pinId)}
          focusPinId={focusPinId}
          canEdit={canEdit}
          placing={placing || calibrating !== null}
          onPlace={(x, y) => {
            if (calibrating) {
              // Two points, then the next press starts again from the first.
              setCalibrating(calibrating.length >= 2 ? [{ x, y }] : [...calibrating, { x, y }])
            } else {
              setPinForm({ kind: 'new', at: { x, y } })
            }
          }}
          onMovePin={(pin, x, y) => void movePin(pin, x, y)}
          markers={
            calibrating
              ? calibrating.map((point, index) => ({
                  id: index === 0 ? 'a' : 'b',
                  x: point.x,
                  y: point.y,
                  label: index === 0 ? t('places.mapPage.markerA') : t('places.mapPage.markerB'),
                }))
              : map.calibration
                ? [
                    {
                      id: 'a',
                      x: map.calibration.x1,
                      y: map.calibration.y1,
                      label: t('places.mapPage.markerA'),
                    },
                    {
                      id: 'b',
                      x: map.calibration.x2,
                      y: map.calibration.y2,
                      label: t('places.mapPage.markerB'),
                    },
                  ]
                : []
          }
          overlay={(view) => {
            const line = calibrating
              ? calibrating.length === 2
                ? {
                    x1: calibrating[0].x,
                    y1: calibrating[0].y,
                    x2: calibrating[1].x,
                    y2: calibrating[1].y,
                  }
                : null
              : map.calibration
                ? {
                    x1: map.calibration.x1,
                    y1: map.calibration.y1,
                    x2: map.calibration.x2,
                    y2: map.calibration.y2,
                  }
                : null
            if (!line) return null
            return (
              <svg
                className="mapviewer__overlay"
                viewBox={`0 0 ${map.image.width} ${map.image.height}`}
                preserveAspectRatio="none"
                aria-hidden="true"
                focusable="false"
                data-testid="map-scale-line"
              >
                <line
                  x1={line.x1 * map.image.width}
                  y1={line.y1 * map.image.height}
                  x2={line.x2 * map.image.width}
                  y2={line.y2 * map.image.height}
                  strokeWidth={2 / view.scale}
                  strokeDasharray={`${8 / view.scale} ${6 / view.scale}`}
                />
              </svg>
            )
          }}
        />

        <aside className="mapscreen__panel" aria-label={t('places.mapPage.panel')}>
          {calibrating ? (
            <MapCalibrationForm
              universeId={universe.id}
              map={map}
              points={calibrating}
              onPointsChange={setCalibrating}
              onSaved={(calibration) => {
                setCalibrating(null)
                setState({ kind: 'ready', map: { ...map, calibration } })
              }}
              onCancel={() => setCalibrating(null)}
            />
          ) : null}

          {selected && !calibrating ? (
            <div className="pincard" data-testid="map-pin-card">
              <h2 className="pincard__title">
                <bdi>{selected.title}</bdi>
              </h2>
              {!selected.placedOnCurrentImage ? (
                <p className="pincard__review" data-testid="map-pin-card-review">
                  {t('places.mapPage.pinReview')}
                </p>
              ) : null}
              {selected.note ? (
                <p className="pincard__note" dir="auto" data-testid="map-pin-card-note">
                  {selected.note}
                </p>
              ) : null}
              {selected.lore ? (
                selected.lore.isTrashed || !selected.lore.name ? (
                  <p
                    className="pincard__lore pincard__lore--trashed"
                    data-testid="map-pin-card-trashed"
                  >
                    {t('places.mapPage.pinTrashed')}
                  </p>
                ) : (
                  <Link
                    className="pincard__lore"
                    to={`/app/universes/${universe.id}/lore/${selected.lore.id}`}
                    data-testid="map-pin-open-entry"
                  >
                    <TypeIcon iconKey={selected.lore.typeIcon} className="pincard__icon" />
                    <span>
                      {tx('places.mapPage.openEntry', { name: <bdi>{selected.lore.name}</bdi> })}
                      <span className="pincard__type">
                        {' '}
                        {t('places.mapPage.entryType', { type: selected.lore.typeName ?? '' })}
                      </span>
                    </span>
                  </Link>
                )
              ) : (
                <p className="pincard__lore pincard__lore--none">
                  {t('places.mapPage.annotation')}
                </p>
              )}
              <p className="pincard__position">
                {t('places.mapPage.position', {
                  x: (selected.x * 100).toFixed(1),
                  y: (selected.y * 100).toFixed(1),
                })}
              </p>
              {canEdit ? (
                <div className="pincard__actions">
                  <button
                    className="button button--secondary button--sm"
                    type="button"
                    onClick={() => setPinForm({ kind: 'edit', pin: selected })}
                    data-testid="map-pin-edit"
                  >
                    <ActionIcon icon={Pencil} />
                    {t('places.mapPage.editPin')}
                  </button>
                  <button
                    className="button button--secondary button--sm button--danger-quiet"
                    type="button"
                    onClick={() => void removePin(selected)}
                    data-testid="map-pin-remove"
                  >
                    <ActionIcon icon={Trash2} />
                    {t('places.mapPage.removePin')}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {!calibrating ? (
            <MapScaleSummary
              universeId={universe.id}
              map={map}
              canEdit={canEdit}
              onStartCalibrating={() => {
                setPlacing(false)
                setCalibrating(
                  map.calibration
                    ? [
                        { x: map.calibration.x1, y: map.calibration.y1 },
                        { x: map.calibration.x2, y: map.calibration.y2 },
                      ]
                    : [],
                )
              }}
              onRemoved={() => setState({ kind: 'ready', map: { ...map, calibration: null } })}
            />
          ) : null}

          <h2 className="mapscreen__pinsheading">
            {t('places.mapPage.pins')}{' '}
            {map.pins.length > 0 ? (
              <span className="mapscreen__count">({map.pins.length})</span>
            ) : null}
          </h2>
          {map.pins.length === 0 ? (
            <p className="mapscreen__empty" data-testid="map-pins-empty">
              {canEdit ? t('places.mapPage.noPinsEditor') : t('places.mapPage.noPins')}
            </p>
          ) : (
            <ul className="pinlist" data-testid="map-pin-list">
              {map.pins.map((pin) => (
                <li key={pin.id}>
                  <button
                    className="pinlist__item"
                    type="button"
                    aria-pressed={pin.id === selectedPinId}
                    onClick={() => select(pin.id, true)}
                    data-testid="map-pin-row"
                    data-pin-title={pin.title}
                  >
                    <MapPinIcon
                      className="pinlist__icon"
                      aria-hidden="true"
                      focusable="false"
                      strokeWidth={1.75}
                    />
                    <span className="pinlist__text">
                      <bdi>{pin.title}</bdi>
                      {pin.lore?.name ? (
                        <span className="pinlist__lore">
                          {' '}
                          {t('places.mapPage.listType', { type: pin.lore.typeName ?? '' })}
                        </span>
                      ) : null}
                      {!pin.placedOnCurrentImage ? (
                        <span className="pinlist__review">
                          {' '}
                          {t('places.mapPage.awaitingReview')}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      {pinForm ? (
        <MapPinForm
          universeId={universe.id}
          mapId={map.id}
          pin={pinForm.kind === 'edit' ? pinForm.pin : null}
          at={pinForm.kind === 'new' ? pinForm.at : null}
          onClose={() => setPinForm(null)}
          onSaved={pinSaved}
        />
      ) : null}

      {dialog === 'details' ? (
        <MapForm
          mode="details"
          universeId={universe.id}
          map={map}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            setDialog(null)
            replaceMap(saved)
          }}
        />
      ) : null}

      {dialog === 'replace' ? (
        <MapForm
          mode="replace"
          universeId={universe.id}
          map={map}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            setDialog(null)
            replaceMap(saved)
          }}
        />
      ) : null}
    </section>
  )
}
