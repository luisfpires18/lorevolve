import { useEffect, useMemo, useState } from 'react'
import { getProjectTemplate, listProjectTypes } from './api'
import { buildTypeTree } from '../lore/typeTree'
import type { ProjectEntityType, ProjectTemplate } from './types'
import { listTypeTemplates } from '../typeTemplates/api'
import type { TypeTemplate } from '../typeTemplates/types'
import { t } from '../i18n'
import { errorText } from '../lib/errorText'

/** A project's types: the read, the open drawers, the type tree, and what happens after a write. */
export function useProjectSchema({
  projectId,
  reloadKey,
  universeId,
  onChanged,
}: {
  projectId: string
  reloadKey: number
  universeId?: string
  onChanged?: () => void
}) {
  const [types, setTypes] = useState<ProjectEntityType[] | null>(null)
  const [template, setTemplate] = useState<ProjectTemplate | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // The drawer: a type being edited, or 'new' (from the head, or a row's Add child, which sets `childOf`).
  const [editing, setEditing] = useState<ProjectEntityType | 'new' | null>(null)
  const [childOf, setChildOf] = useState<ProjectEntityType | null>(null)
  const [templates, setTemplates] = useState<TypeTemplate[]>([])
  const [fromTemplate, setFromTemplate] = useState(false)
  const [openTypeId, setOpenTypeId] = useState<string | null>(null)
  const [addingFieldTo, setAddingFieldTo] = useState<string | null>(null)
  const tree = useMemo(() => buildTypeTree(types ?? []), [types])

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      listProjectTypes(projectId, controller.signal),
      getProjectTemplate(projectId, controller.signal),
    ])
      .then(([read, offer]) => {
        setTypes(read)
        setTemplate(offer)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setTypes([])
        setFailed(errorText(error, t('projects.schema.failed')))
      })
    return () => controller.abort()
  }, [projectId, reloadKey])

  useEffect(() => {
    if (!universeId) return
    const controller = new AbortController()
    // A failed read only hides the option; making a type by hand still works.
    listTypeTemplates(universeId, controller.signal)
      .then(setTemplates)
      .catch(() => undefined)
    return () => controller.abort()
  }, [universeId])

  function after(read: ProjectEntityType[]) {
    setTypes(read)
    setBusy(false)
    setFailed(null)
    onChanged?.()
  }

  function refresh() {
    listProjectTypes(projectId)
      .then(after)
      .catch((error: unknown) => {
        setBusy(false)
        setFailed(errorText(error, t('projects.schema.failed')))
      })
  }

  function failing(error: unknown) {
    setBusy(false)
    setFailed(errorText(error, t('projects.schema.failed')))
  }

  return {
    types,
    setTypes,
    template,
    setTemplate,
    failed,
    setFailed,
    busy,
    setBusy,
    editing,
    setEditing,
    childOf,
    setChildOf,
    templates,
    setTemplates,
    fromTemplate,
    setFromTemplate,
    openTypeId,
    setOpenTypeId,
    addingFieldTo,
    setAddingFieldTo,
    tree,
    after,
    refresh,
    failing,
  }
}
