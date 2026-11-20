import { useId } from 'react'
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { mapsPath } from '../maps/api'
import { useUniverseAccess } from '../universes/access'
import { useI18n } from '../i18n'
import type { WorkspaceContext } from './UniverseWorkspace'
import { mapPageActions } from '../maps/mapPageActions'
import { useMapPageReads } from '../maps/useMapPageReads'
import { useMapPageState } from '../maps/useMapPageState'
import { MapDialogs } from '../components/maps/MapDialogs'
import { MapHeader } from '../components/maps/MapHeader'
import { MapNotices } from '../components/maps/MapNotices'
import { MapPanelActions } from '../components/maps/MapPanelActions'
import { MapPanelDetail } from '../components/maps/MapPanelDetail'
import { MapPinList } from '../components/maps/MapPinList'
import { MapStage } from '../components/maps/MapStage'
import { ReadGate } from '../components/ReadGate'

/**
 * One map (issue #52, ADR 0060): the picture panned and zoomed, its pins on it and beside it, and - for an Editor or the
 * owner - the authoring: place a pin by pressing the map or by typing where it goes, drag it or edit its numbers to move
 * it, link it to the entry it stands for, replace the picture with an explicit decision about the pins, rename, delete.
 *
 * The chosen pin lives in the address as `?pin=`, so the entry's page and a connected app's source can open the map on one pin, and a
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
  const pageState = useMapPageState({ params, universeId: universe.id, mapId })
  const {
    state,
    setState,
    retry,
    placing,
    setPlacing,
    pinForm,
    setPinForm,
    dialog,
    setDialog,
    focusPinId,
    failure,
    calibrating,
    setCalibrating,
  } = pageState

  const selectedPinId = params.get('pin')

  useMapPageReads({ ...pageState, selectedPinId, setParams })

  const { select, replaceMap, pinSaved, movePin, removePin, removeMap } = mapPageActions({
    ...pageState,
    universe,
    mapId,
    selectedPinId,
    setParams,
    navigate,
    t,
    tn,
    tx,
  })

  // The gate draws loading, missing and failed; the ready page below needs the map outside it.
  if (state.kind !== 'ready') {
    return (
      <ReadGate
        load={state}
        loading={{ text: t('places.mapPage.loading') }}
        error={{
          message: t('places.mapPage.error'),
          onRetry: retry,
          retryLabel: t('places.mapPage.retry'),
          testId: 'map-load-error',
        }}
        missing={
          <EmptyState
            testId="map-missing"
            title={t('places.mapPage.missingTitle')}
            hint={tx('places.mapPage.missingHint', {
              link: <Link to={mapsPath(universe.id)}>{t('places.mapPage.missingLink')}</Link>,
            })}
          />
        }
      >
        {() => null}
      </ReadGate>
    )
  }

  const map = state.value
  const selected = map.pins.find((pin) => pin.id === selectedPinId) ?? null
  const canEdit = access.editContent

  return (
    <section
      className="mapscreen"
      aria-labelledby={headingId}
      data-testid="map-page"
      data-map-id={map.id}
    >
      <MapHeader
        map={map}
        universe={universe}
        headingId={headingId}
        canEdit={canEdit}
        placing={placing}
        setPlacing={setPlacing}
        calibrating={calibrating}
        setDialog={setDialog}
        removeMap={removeMap}
      />

      <MapNotices
        map={map}
        canEdit={canEdit}
        calibrating={calibrating}
        placing={placing}
        setPlacing={setPlacing}
        setPinForm={setPinForm}
        failure={failure}
      />

      <div className="mapscreen__body">
        <MapStage
          universe={universe}
          map={map}
          selectedPinId={selectedPinId}
          select={select}
          focusPinId={focusPinId}
          canEdit={canEdit}
          placing={placing}
          calibrating={calibrating}
          setCalibrating={setCalibrating}
          setPinForm={setPinForm}
          movePin={movePin}
        />

        <aside className="mapscreen__panel" aria-label={t('places.mapPage.panel')}>
          <MapPanelDetail
            universe={universe}
            map={map}
            calibrating={calibrating}
            setCalibrating={setCalibrating}
            setState={setState}
            selected={selected}
            canEdit={canEdit}
            setPinForm={setPinForm}
            removePin={removePin}
          />

          {!calibrating ? (
            <MapPanelActions
              universe={universe}
              map={map}
              canEdit={canEdit}
              setPlacing={setPlacing}
              setCalibrating={setCalibrating}
              setState={setState}
            />
          ) : null}

          <MapPinList map={map} canEdit={canEdit} selectedPinId={selectedPinId} select={select} />
        </aside>
      </div>

      <MapDialogs
        universe={universe}
        map={map}
        pinForm={pinForm}
        setPinForm={setPinForm}
        pinSaved={pinSaved}
        dialog={dialog}
        setDialog={setDialog}
        replaceMap={replaceMap}
      />
    </section>
  )
}
