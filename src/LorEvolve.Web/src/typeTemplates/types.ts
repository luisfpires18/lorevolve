import type { ProjectField } from '../projectEntities/types'

/** A universe's reusable type (#281). Never linked to a game's types: a game gets its own copy. */
export type TypeTemplate = {
  id: string
  name: string
  description: string | null
  icon: string | null
  accentColor: string | null
  createdAt: string
  updatedAt: string
  fields: ProjectField[]
}
