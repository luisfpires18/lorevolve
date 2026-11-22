import { useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { EmptyState } from './EmptyState'
import { ManuscriptParts } from './ManuscriptParts'
import { t, useI18n } from '../i18n'
import { capital, levelWord } from '../projectEntities/levelWords'
import { childrenOf, getStructure } from '../projectEntities/structure'
import { projectPath } from '../projects/sections'
import { scriptParts } from '../projectEntities/scriptParts'
import { ScriptPart } from './projectEntities/ScriptPart'
import { useAsyncRead } from '../lib/useAsyncRead'
import { FormMessage } from './FormMessage'
import { QuietNote } from './QuietNote'

/**
 * A Series', Film's or Comic's Script view (#377): every node of its structure listed beside the text it holds, in the
 * Manuscript layout. The part open is named by `?node=`, the same link Structure uses, and is the first one by default.
 * Each part saves through the node's own route with the version it was read at, so a change made elsewhere is refused
 * rather than overwritten.
 */
export function ProjectScript({
  projectId,
  universeId,
}: {
  projectId: string
  universeId: string
}) {
  const { tx } = useI18n()
  const [params] = useSearchParams()
  const structurePath = projectPath(projectId, 'structure', universeId)
  const scriptPath = projectPath(projectId, 'script', universeId)

  // A 404 is a project with no format yet. A save reads again quietly and keeps the parts shown if that read fails.
  const read = useCallback((signal: AbortSignal) => getStructure(projectId, signal), [projectId])
  const { load, refresh } = useAsyncRead(read, {
    missing: true,
    failed: t('projects.structure.failed'),
  })

  const structureLink = (
    <Link to={structurePath} data-testid="project-script-structure">
      {t('projects.script.structureLink')}
    </Link>
  )

  if (load.kind === 'loading')
    return <QuietNote spacing="flush">{t('projects.common.loading')}</QuietNote>
  if (load.kind === 'error')
    return <FormMessage testId="project-script-failed">{load.message}</FormMessage>

  if (load.kind === 'missing') {
    return (
      <EmptyState
        title={t('projects.script.noFormat')}
        hint={tx('projects.script.noFormatHint', { link: structureLink })}
        testId="project-script-no-format"
      />
    )
  }

  const tree = load.value
  const groups = scriptParts({ tree, scriptPath })

  if (groups.length === 0) {
    return (
      <EmptyState
        title={t('projects.script.empty')}
        hint={tx('projects.script.emptyHint', { link: structureLink })}
        testId="project-script-empty"
      />
    )
  }

  const asked = params.get('node')
  const current = tree.nodes.find((node) => node.id === asked) ?? childrenOf(tree, null)[0]
  const siblings = childrenOf(tree, current.parentId)

  return (
    <ManuscriptParts
      groups={groups}
      currentId={current.id}
      heading={t('projects.script.heading')}
      outlineLabel={t('projects.script.outline')}
      toggleLabel={t('projects.script.parts')}
      closeLabel={t('projects.script.closeParts')}
      chooseLabel={t('projects.script.choose')}
      noneLabel={t('projects.script.empty')}
    >
      <ScriptPart
        key={current.id}
        projectId={projectId}
        universeId={universeId}
        nodeId={current.id}
        where={t('projects.script.position', {
          level: capital(levelWord(current.level)),
          number: siblings.findIndex((node) => node.id === current.id) + 1,
          total: siblings.length,
        })}
        onSaved={refresh}
      />
    </ManuscriptParts>
  )
}
