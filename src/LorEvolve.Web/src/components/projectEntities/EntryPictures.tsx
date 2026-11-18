import { useEffect, useState } from 'react'
import { getProjectEntity } from '../../projectEntities/api'
import type { FieldImageRef } from '../../lore/types'
import type { ProjectField } from '../../projectEntities/types'
import { FieldImageInput } from '../FieldImageInput'

/**
 * An entry's pictures, one per Image field of its type: read from the entry itself, because the list carries no
 * pictures. Each is the field's own control, so a picture can be replaced, recropped or removed where it is read.
 */
export function EntryPictures({
  projectId,
  universeId,
  entryId,
  fields,
  busy,
}: {
  projectId: string
  universeId: string
  entryId: string
  fields: ProjectField[]
  busy: boolean
}) {
  const [pictures, setPictures] = useState<FieldImageRef[] | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    getProjectEntity(projectId, entryId, controller.signal)
      .then((read) => setPictures(read.fieldImages))
      .catch(() => {
        if (!controller.signal.aborted) setPictures([])
      })
    return () => controller.abort()
  }, [projectId, entryId])

  if (pictures === null) return null

  return (
    <div className="entry__fieldimages" data-testid={`project-entry-images-${entryId}`}>
      {fields.map((field) => (
        <FieldImageInput
          key={field.id}
          universeId={universeId}
          entityId={entryId}
          fieldId={field.id}
          name={field.name}
          shape={field.imageShape}
          image={pictures.find((one) => one.fieldId === field.id) ?? null}
          pending={null}
          onPending={() => undefined}
          onChanged={(picture) =>
            setPictures((current) => [
              ...(current ?? []).filter((one) => one.fieldId !== field.id),
              ...(picture ? [picture] : []),
            ])
          }
          disabled={busy}
        />
      ))}
    </div>
  )
}
