import { SCHEMA_VERSION } from './conditionSchema.ts'
import type { SystemRuleDetail, SystemRuleInput } from './types'
import type { Json } from './guard.ts'

/**
 * The PUT for a loaded rule: the builder's title and condition, and everything else exactly as it was read. An update
 * is a whole-record save, so `exceptions` and `dependsOn` are sent back untouched; the builder never edits either.
 */
export function toUpdateRequest(
  detail: SystemRuleDetail,
  title: string,
  condition: Json,
): SystemRuleInput {
  return {
    title,
    description: detail.description,
    projectId: detail.projectId,
    schemaVersion: detail.schemaVersion ?? SCHEMA_VERSION,
    condition,
    dependsOn: detail.dependsOn,
    exceptions: detail.exceptions ?? null,
    expectedVersion: detail.version,
  }
}

/** The POST for a new guard: no description, no exceptions, no dependencies. */
export function toCreateRequest(
  title: string,
  condition: Json,
  projectId: string | null,
): SystemRuleInput {
  return { title, description: '', projectId, schemaVersion: SCHEMA_VERSION, condition }
}
