import { apiFetch } from '../lib/api'
import { formatLabel, kindLabel, projectPath } from './sections'
import type { ProjectKindValue } from './types'

/** A production as a phase lists it: the original project's id, name, kind and format (#289). */
export type CinemaProduction = {
  projectId: string
  name: string
  kind: ProjectKindValue
  format: string | null
}

export type CinemaPhase = {
  id: string
  name: string
  summary: string | null
  sortOrder: number
  version: number
  members: CinemaProduction[]
}

export type CinemaSaga = {
  id: string
  name: string
  summary: string | null
  sortOrder: number
  version: number
  phases: CinemaPhase[]
}

export type CinemaSagas = { sagas: CinemaSaga[]; unassigned: CinemaProduction[] }

export type CinemaGroupInput = { name: string; summary: string | null; expectedVersion?: number }

const base = (universeId: string) => `/api/universes/${universeId}/cinema-sagas`
const post = (url: string, body?: unknown) =>
  apiFetch<void>(url, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
const put = (url: string, body: unknown) =>
  apiFetch<void>(url, { method: 'PUT', body: JSON.stringify(body) })
const remove = (url: string) => apiFetch<void>(url, { method: 'DELETE' })

export const listSagas = (universeId: string, signal?: AbortSignal) =>
  apiFetch<CinemaSagas>(base(universeId), { signal })

export const createSaga = (universeId: string, input: CinemaGroupInput) =>
  post(base(universeId), input)

export const saveSaga = (universeId: string, sagaId: string, input: CinemaGroupInput) =>
  put(`${base(universeId)}/${sagaId}`, input)

export const deleteSaga = (universeId: string, sagaId: string) =>
  remove(`${base(universeId)}/${sagaId}`)

export const moveSaga = (universeId: string, sagaId: string, place: number) =>
  post(`${base(universeId)}/${sagaId}/move`, { place })

const phases = (universeId: string, sagaId: string) => `${base(universeId)}/${sagaId}/phases`

export const createPhase = (universeId: string, sagaId: string, input: CinemaGroupInput) =>
  post(phases(universeId, sagaId), input)

export const savePhase = (
  universeId: string,
  sagaId: string,
  phaseId: string,
  input: CinemaGroupInput,
) => put(`${phases(universeId, sagaId)}/${phaseId}`, input)

export const deletePhase = (universeId: string, sagaId: string, phaseId: string) =>
  remove(`${phases(universeId, sagaId)}/${phaseId}`)

export const movePhase = (universeId: string, sagaId: string, phaseId: string, place: number) =>
  post(`${phases(universeId, sagaId)}/${phaseId}/move`, { place })

export const addMember = (universeId: string, sagaId: string, phaseId: string, projectId: string) =>
  post(`${phases(universeId, sagaId)}/${phaseId}/members`, { projectId })

export const removeMember = (
  universeId: string,
  sagaId: string,
  phaseId: string,
  projectId: string,
) => remove(`${phases(universeId, sagaId)}/${phaseId}/members/${projectId}`)

export const moveMember = (
  universeId: string,
  sagaId: string,
  phaseId: string,
  projectId: string,
  place: number,
) => post(`${phases(universeId, sagaId)}/${phaseId}/members/${projectId}/move`, { place })

/** What the edit drawer is for: a new or existing saga, or a new or existing phase of one saga. */
export type Editing = { saga: CinemaSaga | null; phase: CinemaPhase | null; forPhase: boolean }

/** A production's `TypeRow` props: its name opens the original project, its kind and format follow it. */
export function productionRow(universeId: string, production: CinemaProduction) {
  return {
    name: production.name,
    to: projectPath(production.projectId, '', universeId),
    linkTestId: `saga-production-${production.projectId}`,
    count: production.format
      ? `${kindLabel(production.kind)} · ${formatLabel(production.format)}`
      : kindLabel(production.kind),
  }
}
