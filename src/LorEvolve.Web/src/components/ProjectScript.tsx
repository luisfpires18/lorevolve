import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { EmptyState } from './EmptyState'
import { ManuscriptParts } from './ManuscriptParts'
import { t, useI18n } from '../i18n'
import { ApiError } from '../lib/api'
import { capital, levelWord } from '../projectEntities/levelWords'
import { childrenOf, getStructure, type ProjectStructureTree } from '../projectEntities/structure'
import { projectPath } from '../projects/sections'
import { scriptParts } from '../projectEntities/scriptParts'
import { ScriptPart } from './projectEntities/ScriptPart'
import { errorText } from '../lib/errorText'
import { FormMessage } from './FormMessage'

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
  const [tree, setTree] = useState<ProjectStructureTree | 'none' | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [params] = useSearchParams()
  const structurePath = projectPath(projectId, 'structure', universeId)
  const scriptPath = projectPath(projectId, 'script', universeId)

  const read = useCallback(
    (signal?: AbortSignal) =>
      getStructure(projectId, signal)
        .then(setTree)
        .catch((error: unknown) => {
          if (signal?.aborted) return
          if (error instanceof ApiError && error.status === 404) setTree('none')
          else setFailed(errorText(error, t('projects.structure.failed')))
        }),
    [projectId],
  )

  useEffect(() => {
    const controller = new AbortController()
    void read(controller.signal)
    return () => controller.abort()
  }, [read])

  const structureLink = (
    <Link to={structurePath} data-testid="project-script-structure">
      {t('projects.script.structureLink')}
    </Link>
  )

  if (tree === null) {
    return failed ? (
      <FormMessage testId="project-script-failed">{failed}</FormMessage>
    ) : (
      <p className="projectcard__meta">{t('projects.common.loading')}</p>
    )
  }

  if (tree === 'none') {
    return (
      <EmptyState
        title={t('projects.script.noFormat')}
        hint={tx('projects.script.noFormatHint', { link: structureLink })}
        testId="project-script-no-format"
      />
    )
  }

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
        onSaved={() => void read()}
      />
    </ManuscriptParts>
  )
}
