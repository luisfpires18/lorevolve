import { isAbsolute, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'

/**
 * The database the run's API uses - `LOREX_E2E_DB` (relative to `src/Lorex.Api`, as the API reads it), else the
 * development database - opened for one write that no API route makes, inside one IMMEDIATE transaction.
 */
function write(change: (db: DatabaseSync) => void) {
  const apiRoot = fileURLToPath(new URL('../../../../src/Lorex.Api/', import.meta.url))
  const configured = process.env.LOREX_E2E_DB ?? 'App_Data/lorex.dev.db'
  const db = new DatabaseSync(isAbsolute(configured) ? configured : resolve(apiRoot, configured))
  try {
    db.exec('PRAGMA busy_timeout = 10000')
    db.exec('BEGIN IMMEDIATE')
    try {
      change(db)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  } finally {
    db.close()
  }
}

/**
 * Makes an account the LoreX Admin (#40) the way a start with `PlatformAdmin:OwnerUserId` does: outside the app, by its
 * immutable id, every other Admin a Member again in the same transaction - there is only ever one, and the database's
 * unique index would refuse a second. The API has no route that grants the role, by design, so a spec writes it straight
 * into the database the run's API uses. The role is read from the database on every admin request, so sessions see it at
 * their next one.
 *
 * Because it moves the one role, specs that use it run serially.
 *
 * Not a spec.
 */
export function grantAdmin(userId: string) {
  write((db) => {
    db.prepare('UPDATE AspNetUsers SET PlatformRole = 0 WHERE PlatformRole = 1 AND Id <> ?').run(
      userId,
    )
    const changed = db.prepare('UPDATE AspNetUsers SET PlatformRole = 1 WHERE Id = ?').run(userId)
    if (Number(changed.changes) !== 1) throw new Error(`No account ${userId} to make Admin.`)
  })
}

/**
 * Marks entries archived, as an older backup restores them: the app has no route that archives an entry, and Lore's lists
 * leave archived entries out (Issue #60).
 */
export function markArchived(entityIds: string[]) {
  write((db) => {
    // Entity ids are stored as upper-case text by EF Core's SQLite provider.
    const archive = db.prepare('UPDATE Entities SET IsArchived = 1 WHERE upper(Id) = upper(?)')
    for (const id of entityIds) {
      if (Number(archive.run(id).changes) !== 1) throw new Error(`No entry ${id} to archive.`)
    }
  })
}

/** The signed-in account's id, as the API says it. */
export async function currentUserId(page: Page) {
  const response = await page.request.get('/api/auth/me')
  return ((await response.json()) as { id: string }).id
}
