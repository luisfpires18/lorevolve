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
import { useI18n } from '../i18n'
import type { WorkspaceContext } from './UniverseWorkspace'

type LoadState = { kind: 'loading' } | { kind: 'ready'; maps: MapSummary[] } | { kind: 'error' }

type MapsTab = 'maps' | 'interactive'

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
  const { t, tn, tx } = useI18n()
  const access = useUniverseAccess()
  const { universe } = useOutletContext<WorkspaceContext>()
  const navigate = useNavigate()
  const location = useLocation()
  const headingId = useId()
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [reads, setReads] = useState(0)
  const [creating, setCreating] = useState(false)
  const TABS: readonly QueryTab<MapsTab>[] = [
    { id: 'maps', label: t('places.maps.tabMaps') },
    { id: 'interactive', label: t('places.maps.tabInteractive') },
  ]
  const [tab, choose] = useQueryTab(TABS)

  const notice = (location.state as MapsListNotice | null)?.deleted ?? null

  useEffect(() => {
    const controller = new AbortController()
    listMaps(universe.id, controller.signal)
      .then((maps) => setState({ kind: 'ready', maps }))
      .catch(() => {
        if (controller.signal.aborted) return
        setState({ kind: 'error' })
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
      {t('places.maps.new')}
    </button>
  ) : undefined

  return (
    <section className="maps" aria-labelledby={headingId} data-testid="maps">
      <PageHeader
        title={t('places.maps.title')}
        titleId={headingId}
        lede={t('places.maps.lede')}
        actions={newMap}
      />

      <QueryTabList
        label={t('places.maps.tabsLabel')}
        idPrefix="maps"
        tabs={TABS}
        tab={tab}
        onChoose={choose}
      />

      <TabPanel idPrefix="maps" id="maps" tab={tab}>
        {notice ? (
          <div className="notice maps__notice" data-testid="maps-deleted-notice">
            <p role="status">
              {tx('places.maps.deleted', { name: <Quoted text={notice.name} /> })}
            </p>
          </div>
        ) : null}

        {state.kind === 'loading' ? (
          <p className="notice" role="status">
            {t('places.maps.loading')}
          </p>
        ) : null}

        {state.kind === 'error' ? (
          <div className="notice notice--error" role="alert" data-testid="maps-load-error">
            <p>{t('places.maps.error')}</p>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => {
                setState({ kind: 'loading' })
                setReads((current) => current + 1)
              }}
            >
              {t('places.maps.retry')}
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
                  {t('places.maps.meta', {
                    pins:
                      map.pinCount === 0
                        ? t('places.maps.noPins')
                        : tn('places.maps.pins', map.pinCount, { n: map.pinCount }),
                    width: map.image.width,
                    height: map.image.height,
                  })}
                </p>
              </li>
            ))}
          </ul>
        ) : null}

        {state.kind === 'ready' && state.maps.length === 0 ? (
          <EmptyState
            testId="maps-empty"
            title={t('places.maps.emptyTitle')}
            hint={
              access.editContent ? t('places.maps.emptyHintEditor') : t('places.maps.emptyHint')
            }
            action={
              access.editContent ? (
                <button className="button" type="button" onClick={() => setCreating(true)}>
                  <ActionIcon icon={Plus} />
                  {t('places.maps.new')}
                </button>
              ) : undefined
            }
          />
        ) : null}
      </TabPanel>

      <TabPanel idPrefix="maps" id="interactive" tab={tab}>
        <EmptyState
          testId="maps-interactive-soon"
          title={t('places.maps.soonTitle')}
          hint={t('places.maps.soonHint')}
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
