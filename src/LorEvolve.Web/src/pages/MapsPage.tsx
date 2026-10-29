import { useEffect, useId, useState } from 'react'
import { Plus } from 'lucide-react'
import { Link, useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import { ActionIcon } from '../components/ActionIcon'
import { EmptyState } from '../components/EmptyState'
import { MapForm } from '../components/MapForm'
import { Quoted } from '../components/NameList'
import { PageHeader } from '../components/PageHeader'
import { QueryTabList, TabPanel } from '../components/QueryTabs'
import { useQueryTab, type QueryTab } from '../lib/queryTab'
import { listMaps, mapImageUrl, mapPath } from '../maps/api'
import type { MapSummary } from '../maps/types'
import { useUniverseAccess } from '../universes/access'
import type { WorkspaceContext } from './UniverseWorkspace'

type LoadState =
  { kind: 'loading' } | { kind: 'ready'; maps: MapSummary[] } | { kind: 'error'; message: string }

type MapsTab = 'maps' | 'interactive'

const TABS: readonly QueryTab<MapsTab>[] = [
  { id: 'maps', label: 'Maps' },
  { id: 'interactive', label: 'Interactive map' },
]

/** What a map's page says it did before handing back to the list. */
export interface MapsListNotice {
  deleted?: { name: string }
}

/**
 * A universe's maps (issue #52, ADR 0060): every uploaded picture of the world, by name, each with how many pins it holds.
 * A map is opened to be browsed; a new one is a picture and a name. Nothing here is public, and nothing draws a map
 * that is not the author's own picture.
 */
export default function MapsPage() {
  const access = useUniverseAccess()
  const { universe } = useOutletContext<WorkspaceContext>()
  const navigate = useNavigate()
  const location = useLocation()
  const headingId = useId()
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [reads, setReads] = useState(0)
  const [creating, setCreating] = useState(false)
  const [tab, choose] = useQueryTab(TABS)

  const notice = (location.state as MapsListNotice | null)?.deleted ?? null

  useEffect(() => {
    const controller = new AbortController()
    listMaps(universe.id, controller.signal)
      .then((maps) => setState({ kind: 'ready', maps }))
      .catch(() => {
        if (controller.signal.aborted) return
        setState({ kind: 'error', message: 'The maps could not be read.' })
      })
    return () => controller.abort()
  }, [universe.id, reads])

  const newMap = access.editContent ? (
    <button
      className="button"
      type="button"
      onClick={() => setCreating(true)}
      data-testid="new-map"
    >
      <ActionIcon icon={Plus} />
      New map
    </button>
  ) : undefined

  return (
    <section className="maps" aria-labelledby={headingId} data-testid="maps">
      <PageHeader
        title="Maps"
        titleId={headingId}
        lede="Pictures of this world, each with pins that open the Lore they stand for. Upload a map you already have; LorEvolve draws nothing on it."
        actions={newMap}
      />

      <QueryTabList label="Maps" idPrefix="maps" tabs={TABS} tab={tab} onChoose={choose} />

      <TabPanel idPrefix="maps" id="maps" tab={tab}>
        {notice ? (
          <div className="notice maps__notice" data-testid="maps-deleted-notice">
            <p role="status">
              <Quoted text={notice.name} /> was deleted, with its pins.
            </p>
          </div>
        ) : null}

        {state.kind === 'loading' ? (
          <p className="notice" role="status">
            Unrolling the maps…
          </p>
        ) : null}

        {state.kind === 'error' ? (
          <div className="notice notice--error" role="alert" data-testid="maps-load-error">
            <p>{state.message}</p>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => {
                setState({ kind: 'loading' })
                setReads((current) => current + 1)
              }}
            >
              Try again
            </button>
          </div>
        ) : null}

        {state.kind === 'ready' && state.maps.length > 0 ? (
          <ul className="maplist" data-testid="map-list">
            {state.maps.map((map) => (
              <li className="mapcard" key={map.id} data-testid="map-card" data-map-name={map.name}>
                <Link
                  className="mapcard__link"
                  to={mapPath(universe.id, map.id)}
                  data-testid="map-open"
                >
                  <span className="mapcard__picture">
                    <img
                      src={mapImageUrl(universe.id, map.id, map.image.assetId, 'display')}
                      alt=""
                      width={map.image.width}
                      height={map.image.height}
                      loading="lazy"
                      decoding="async"
                    />
                  </span>
                  <span className="mapcard__name">
                    <bdi>{map.name}</bdi>
                  </span>
                </Link>
                {map.description ? (
                  <p className="mapcard__description" dir="auto">
                    {map.description}
                  </p>
                ) : null}
                <p className="mapcard__meta" data-testid="map-pin-count">
                  {map.pinCount === 0
                    ? 'No pins yet'
                    : `${map.pinCount} ${map.pinCount === 1 ? 'pin' : 'pins'}`}{' '}
                  · {map.image.width} × {map.image.height}
                </p>
              </li>
            ))}
          </ul>
        ) : null}

        {state.kind === 'ready' && state.maps.length === 0 ? (
          <EmptyState
            testId="maps-empty"
            title="No maps yet."
            hint={
              access.editContent
                ? 'Upload a picture of this world - a continent, a city, a ship - and pin the Lore that lives on it.'
                : 'Nobody has uploaded a map of this world yet.'
            }
            action={
              access.editContent ? (
                <button className="button" type="button" onClick={() => setCreating(true)}>
                  <ActionIcon icon={Plus} />
                  New map
                </button>
              ) : undefined
            }
          />
        ) : null}
      </TabPanel>

      <TabPanel idPrefix="maps" id="interactive" tab={tab}>
        <EmptyState
          testId="maps-interactive-soon"
          title="Interactive map is coming."
          hint="Planned, not built yet."
        />
      </TabPanel>

      {creating ? (
        <MapForm
          mode="new"
          universeId={universe.id}
          onClose={() => setCreating(false)}
          onSaved={(map) => {
            setCreating(false)
            void navigate(mapPath(universe.id, map.id))
          }}
        />
      ) : null}
    </section>
  )
}
