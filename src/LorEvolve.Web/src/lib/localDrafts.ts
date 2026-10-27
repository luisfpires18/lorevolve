/**
 * Recovery copies of unsaved writing, kept in this browser and nowhere else.
 *
 * A recovery copy is not a save. It never reaches the API, never becomes a saved version, never moves a timestamp and
 * never appears in a backup: it exists so that writing lost before a save - a crash, a closed tab, a dead battery - can
 * be offered back the next time the same account opens the same article or manuscript. Saving stays explicit (ADR 0029).
 *
 * IndexedDB, not `localStorage`: an article is up to 200,000 characters of document and a manuscript up to a million, and
 * `localStorage` is a few megabytes for the whole site, synchronous on the main thread, and fails a write by throwing
 * mid-keystroke. IndexedDB takes large strings asynchronously under a quota the browser sizes to the disk.
 *
 * Every copy is keyed by the signed-in account, the universe, what it is and the id it belongs to, and is handed back
 * only to that same account. Signing out destroys nothing - that would defeat recovery - and another account on the
 * same browser is never offered one. No credential, token or cookie is ever stored here: the account's id is a key,
 * nothing more.
 *
 * Storage can be missing, full or refused. Every function here fails as a rejected promise and nothing else, so an
 * editor can carry on writing and saving without it.
 */

export type DraftKind = 'article' | 'manuscript' | 'idea' | 'idea-board'

/**
 * Which recovery copy: whose, in which universe, of what, and of which article, scene or idea.
 *
 * `universeId` is null for writing that belongs to the account rather than to a universe - an idea, which outlives any
 * universe it is associated with (ADR 0030). A copy with no universe is never let go with a deleted universe's copies.
 */
export interface DraftScope {
  accountId: string
  universeId: string | null
  kind: DraftKind
  contentId: string
}

export interface LocalDraft extends DraftScope {
  key: string

  /** The unsaved text: the article's document, the manuscript's prose, or an idea's fields, exactly as the editor held it. */
  content: string

  /** The `updatedAt` of the saved text this copy was written over, as the API gave it - null when nothing was saved. */
  baseUpdatedAt: string | null

  /** When this device last kept the copy, by this device's clock. Shown, and never compared with a save. */
  savedAt: string
}

const DATABASE = 'lorevolve-recovery'
const VERSION = 1
const STORE = 'drafts'
const BY_UNIVERSE = 'account-universe'

/** Stands in a key for "no universe". Never an id: universe ids are GUIDs. */
const NO_UNIVERSE = '~'

export function draftKey(scope: DraftScope) {
  return [scope.accountId, scope.universeId ?? NO_UNIVERSE, scope.kind, scope.contentId]
    .map((part) => encodeURIComponent(part))
    .join('/')
}

let opening: Promise<IDBDatabase> | null = null

function open() {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Recovery copies are not available in this browser.'))
      return
    }

    const request = indexedDB.open(DATABASE, VERSION)

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE)) {
        const store = database.createObjectStore(STORE, { keyPath: 'key' })
        store.createIndex(BY_UNIVERSE, ['accountId', 'universeId'])
      }
    }

    request.onsuccess = () => {
      const database = request.result
      // A newer LorEvolve in another tab wants to change the store: step aside, and open again on the next call.
      database.onversionchange = () => {
        database.close()
        opening = null
      }
      resolve(database)
    }

    request.onerror = () =>
      reject(request.error ?? new Error('Recovery copies could not be opened.'))
    request.onblocked = () => reject(new Error('Recovery copies are held by another tab.'))
  })

  // A failed open is not remembered, so storage that becomes available later is used then.
  opening.catch(() => {
    opening = null
  })

  return opening
}

/** One transaction on the store, settled when the transaction itself completes rather than when its request does. */
function transact<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  return open().then(
    (database) =>
      new Promise<T | undefined>((resolve, reject) => {
        const transaction = database.transaction(STORE, mode)
        const request = work(transaction.objectStore(STORE))
        transaction.oncomplete = () => resolve(request ? request.result : undefined)
        transaction.onerror = () => reject(transaction.error ?? new Error('Recovery copy failed.'))
        transaction.onabort = () => reject(transaction.error ?? new Error('Recovery copy failed.'))
      }),
  )
}

/**
 * One queue per copy, so reads, writes and deletes of it land in the order they were asked for: a copy dropped as its
 * editor is left cannot be written back by a write that started a moment earlier, and a page opening the same article
 * reads only once both have landed.
 */
const queues = new Map<string, Promise<unknown>>()

function inOrder<T>(key: string, work: () => Promise<T>) {
  const next = (queues.get(key) ?? Promise.resolve()).then(work, work)
  const settled = next.then(
    () => undefined,
    () => undefined,
  )
  queues.set(key, settled)
  void settled.then(() => {
    if (queues.get(key) === settled) queues.delete(key)
  })
  return next
}

/** The copy for this scope, or null. A record naming any other account is never returned, whatever its key. */
export function readDraft(scope: DraftScope) {
  const key = draftKey(scope)
  return inOrder(key, async () => {
    const found = await transact<LocalDraft | undefined>('readonly', (store) => store.get(key))
    return found && found.accountId === scope.accountId && found.kind === scope.kind ? found : null
  })
}

/** Keeps `content` as this scope's copy, replacing any before it. */
export function keepDraft(scope: DraftScope, content: string, baseUpdatedAt: string | null) {
  const key = draftKey(scope)
  const record: LocalDraft = {
    key,
    accountId: scope.accountId,
    universeId: scope.universeId,
    kind: scope.kind,
    contentId: scope.contentId,
    content,
    baseUpdatedAt,
    savedAt: new Date().toISOString(),
  }
  return inOrder(key, async () => {
    await transact('readwrite', (store) => store.put(record))
  })
}

/** Lets this scope's copy go, if there is one. */
export function discardDraft(scope: DraftScope) {
  const key = draftKey(scope)
  return inOrder(key, async () => {
    await transact('readwrite', (store) => store.delete(key))
  })
}

/**
 * Lets every copy an account kept in one universe go - for a universe that has been deleted, and so has nothing left to
 * recover into. A copy kept with no universe is not in the index this walks - IndexedDB leaves a record whose key would
 * hold a null out of it - so an idea's copy is never among them.
 */
export function discardUniverseDrafts(accountId: string, universeId: string) {
  return transact('readwrite', (store) => {
    const cursor = store.index(BY_UNIVERSE).openCursor(IDBKeyRange.only([accountId, universeId]))
    cursor.onsuccess = () => {
      const current = cursor.result
      if (current) {
        current.delete()
        current.continue()
      }
    }
  }).then(() => undefined)
}
