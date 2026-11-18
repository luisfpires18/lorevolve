import { useCallback, useEffect } from 'react'
import { t } from '../i18n'
import { getNode, scriptOf } from './structure'
import type { useScriptPartState } from './useScriptPartState'

export function useScriptPartLoad({
  projectId,
  nodeId,
  setNode,
  setDraft,
  setScript,
  setChanged,
  setFailure,
}: ReturnType<typeof useScriptPartState> & { projectId: string; nodeId: string }) {
  const load = useCallback(
    (signal?: AbortSignal) =>
      getNode(projectId, nodeId, signal)
        .then((read) => {
          setNode(read)
          setDraft(read.body ?? '')
          setScript(scriptOf(read))
          setChanged(false)
          setFailure(null)
        })
        .catch((error: unknown) => {
          if (!signal?.aborted)
            setFailure(error instanceof Error ? error.message : t('projects.structure.failed'))
        }),
    [projectId, nodeId],
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  return { load }
}
