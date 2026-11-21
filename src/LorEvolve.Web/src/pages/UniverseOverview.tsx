import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { ConnectToAi } from '../components/ConnectToAi'
import { PageHeader } from '../components/PageHeader'
import { t, tx, useI18n } from '../i18n'
import { listEntities } from '../lore/api'
import { useUniverseAccess } from '../universes/access'
import { groupKey, offered, SECTION_GROUPS } from '../universes/sections'
import { UniverseRole } from '../universes/types'
import type { WorkspaceContext } from './UniverseWorkspace'
import { Callout } from '../components/Callout'
import { OverviewContents } from '../components/universes/OverviewContents'
import { OverviewLede } from '../components/universes/OverviewLede'

/**
 * A universe's front page, set as a book's contents: its name and opening line, then a doorway into
 * each part of it, grouped as the sidebar groups them, with the sections it offers (#273). No feed, no recent items, no counts - a
 * count would mean reading every list just to print a number, and a contents page does not need
 * one to say where things are.
 *
 * One question is asked, of someone who can write here: is there any lore at all? A world with none
 * gets a line saying where to begin, above the contents.
 *
 * The world's parts take the full width; the shorter groups sit side by side once there is room.
 */
export default function UniverseOverview() {
  useI18n()
  const { universe, families } = useOutletContext<WorkspaceContext>()
  const access = useUniverseAccess()
  const shared = universe.accessRole !== UniverseRole.Owner
  const canWrite = access.editContent

  // Which universe was found to have no lore; another universe's answer never shows on this one.
  const [emptyId, setEmptyId] = useState<string | null>(null)
  useEffect(() => {
    if (!canWrite) return
    const controller = new AbortController()
    listEntities(
      universe.id,
      { search: '', entityTypeId: null, canonStatus: null, tag: null, page: 1, pageSize: 1 },
      controller.signal,
    )
      .then((entries) => setEmptyId(entries.totalCount === 0 ? universe.id : null))
      // The line is a hint; without an answer the contents stand by themselves.
      .catch(() => undefined)
    return () => {
      controller.abort()
    }
  }, [universe.id, canWrite])

  // The sidebar's own groups and rules, less the front page. Settings stays out: the lede above links to it (#273).
  const groups = SECTION_GROUPS.flatMap((source) => {
    const name = groupKey(source)
    const sections = offered(source, access, universe.aiHelp, families).filter(
      (section) => section.segment !== 'settings',
    )
    return name && sections.length > 0 ? [{ name, sections }] : []
  })
  const [world, ...rest] = groups

  return (
    <article className="overview">
      <PageHeader
        title={<bdi>{universe.name}</bdi>}
        titleTestId="overview-name"
        titleClassName="titlerule"
        // An outside AI app reading this universe over MCP (ADR 0046): any member may connect their own, so every
        // member's front page offers it.
        actions={
          universe.aiHelp ? (
            <ConnectToAi universeId={universe.id} universeName={universe.name} />
          ) : undefined
        }
        lede={<OverviewLede universe={universe} shared={shared} />}
      />

      {canWrite && emptyId === universe.id ? (
        <Callout look="notice" as="p" testId="overview-start">
          {tx('workspace.overview.empty', {
            lore: <Link to="lore">{t('workspace.overview.emptyLore')}</Link>,
          })}
        </Callout>
      ) : null}

      {world ? <OverviewContents {...world} /> : null}
      {rest.length > 0 ? (
        <div className="contents__pair">
          {rest.map((group) => (
            <OverviewContents key={group.name} {...group} />
          ))}
        </div>
      ) : null}
    </article>
  )
}
