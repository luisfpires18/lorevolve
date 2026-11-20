import { useCallback, useEffect, useMemo, useState } from 'react'
import { getProjectTemplate, listProjectTypes } from './api'
import { buildTypeTree } from '../lore/typeTree'
import type { ProjectEntityType, ProjectTemplate } from './types'
import { listTypeTemplates } from '../typeTemplates/api'
import type { TypeTemplate } from '../typeTemplates/types'
import { t } from '../i18n'
import { useLoadedList } from '../lib/useLoadedList'

interface Schema {
  types: ProjectEntityType[]
  template: ProjectTemplate | null
}

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
  const read = useCallback(
    (signal?: AbortSignal) =>
      Promise.all([
        listProjectTypes(projectId, signal),
        getProjectTemplate(projectId, signal),
      ]).then(([types, template]): Schema => ({ types, template })),
    // A new reloadKey reads again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, reloadKey],
  )
  const { data, failed, setFailed, busy, setBusy, settle, failing } = useLoadedList(
    read,
    t('projects.schema.failed'),
    { emptyOnFail: { types: [], template: null } },
  )
  const types = data?.types ?? null
  const template = data?.template ?? null
  // The drawer: a type being edited, or 'new' (from the head, or a row's Add child, which sets `childOf`).
  const [editing, setEditing] = useState<ProjectEntityType | 'new' | null>(null)
  const [childOf, setChildOf] = useState<ProjectEntityType | null>(null)
  const [templates, setTemplates] = useState<TypeTemplate[]>([])
  const [fromTemplate, setFromTemplate] = useState(false)
  const [openTypeId, setOpenTypeId] = useState<string | null>(null)
  const [addingFieldTo, setAddingFieldTo] = useState<string | null>(null)
  const tree = useMemo(() => buildTypeTree(types ?? []), [types])

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
    settle({ types: read, template })
    onChanged?.()
  }

  function refresh() {
    read()
      .then((value) => {
        settle(value)
        onChanged?.()
      })
      .catch(failing)
  }

  return {
    types,
    template,
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
