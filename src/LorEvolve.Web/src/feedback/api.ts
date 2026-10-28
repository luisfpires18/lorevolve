import { apiFetch } from '../lib/api'

/** Mirrors the backend enum, sent as its number. */
export const FeedbackKind = {
  Bug: 0,
  Feature: 1,
} as const

export type FeedbackKindValue = (typeof FeedbackKind)[keyof typeof FeedbackKind]

export interface FeedbackReport {
  id: string
  kind: FeedbackKindValue
  text: string
  /** The path it was sent from, without query or host. */
  page: string | null
  createdAt: string
  userId: string
  userName: string | null
}

export interface FeedbackReportPage {
  items: FeedbackReport[]
  page: number
  pageSize: number
  totalCount: number
}

export function sendFeedback(kind: FeedbackKindValue, text: string, page: string) {
  return apiFetch<void>('/api/feedback', {
    method: 'POST',
    body: JSON.stringify({ kind, text, page }),
  })
}

export function listFeedback(page: number, signal?: AbortSignal) {
  return apiFetch<FeedbackReportPage>(`/api/admin/feedback?page=${page}`, { signal })
}
