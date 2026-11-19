import { useCallback, useEffect } from 'react'
import { t } from '../i18n'
import { getNode, scriptOf } from './structure'
import type { useScriptPartState } from './useScriptPartState'
import { errorText } from '../lib/errorText'

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
          if (!signal?.aborted) setFailure(errorText(error, t('projects.structure.failed')))
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
