import { expect, type Page } from '@playwright/test'

/** Trash fixtures shared by the permanent-delete specs: an account, a world, every kind of thing binned, recovery copies. */
export const PASSWORD = 'Test-password-123!'

export type Kind = 'entry' | 'story' | 'chapter' | 'scene' | 'arc' | 'beat' | 'rule'

export function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

export async function signUp(page: Page) {
  const username = unique('eraser')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

export async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data })
  expect(response.ok(), path).toBe(true)
  return ((await response.json()) as { id: string }).id
}

/** Creates an invitation and accepts it only through the owner's protected claim link. */
export async function invite(owner: Page, member: Page, path: string, email: string, role: number) {
  const response = await owner.request.post(path, { data: { email, role } })
  expect(response.ok(), path).toBe(true)
  const invitation = (await response.json()) as { claimToken: string }
  const accepted = await member.request.post(
    `/api/invitations/claim/${encodeURIComponent(invitation.claimToken)}/accept`,
  )
  expect(accepted.ok(), await accepted.text()).toBe(true)
}

export async function trash(page: Page, path: string) {
  expect((await page.request.delete(path)).status(), path).toBe(204)
}

export async function world(page: Page) {
  return post(page, '/api/universes', {
    name: unique('Erasure World '),
    description: null,
    accentColor: null,
  })
}

/** A seeded universe, with helpers that make each kind of thing and throw it in the Trash. */
export function seeder(page: Page, universeId: string) {
  const u = `/api/universes/${universeId}`

  return {
    async entry(name: string) {
      const types = (await (await page.request.get(`${u}/entity-types`)).json()) as {
        id: string
        name: string
      }[]
      const id = await post(page, `${u}/entities`, {
        entityTypeId: types.find((type) => type.name === 'Character')!.id,
        name,
        summary: null,
        canonStatus: 0,
        aliases: [],
        tags: [],
        fields: [],
      })
      return { id, bin: () => trash(page, `${u}/entities/${id}`) }
    },
    async story(title: string) {
      const id = await post(page, `${u}/stories`, {
        title,
        premise: null,
        status: 1,
      })
      const s = `${u}/stories/${id}`
      return {
        id,
        bin: () => trash(page, s),
        async chapter(chapterTitle: string) {
          const chapter = await post(page, `${s}/chapters`, {
            title: chapterTitle,
            summary: null,
            notes: null,
          })
          return {
            id: chapter,
            bin: () => trash(page, `${s}/chapters/${chapter}`),
          }
        },
        async scene(sceneTitle: string, chapterId: string | null = null) {
          const scene = await post(page, `${s}/scenes`, {
            title: sceneTitle,
            summary: null,
            notes: null,
            povEntityId: null,
            chronology: null,
            entityIds: [],
            chapterId,
          })
          return { id: scene, bin: () => trash(page, `${s}/scenes/${scene}`) }
        },
        async arc(arcTitle: string) {
          const arc = await post(page, `${s}/plot-arcs`, {
            title: arcTitle,
            description: null,
            notes: null,
          })
          return {
            id: arc,
            bin: () => trash(page, `${s}/plot-arcs/${arc}`),
            async beat(beatTitle: string) {
              const beat = await post(page, `${s}/plot-arcs/${arc}/beats`, {
                title: beatTitle,
                description: null,
                notes: null,
                sceneIds: [],
                entityIds: [],
              })
              return {
                id: beat,
                bin: () => trash(page, `${s}/plot-beats/${beat}`),
              }
            },
          }
        },
      }
    },
    async rule(title: string) {
      const id = await post(page, `${u}/world-rules`, {
        title,
        description: null,
        expectedUpdatedAt: null,
      })
      return { id, bin: () => trash(page, `${u}/world-rules/${id}`) }
    },
  }
}

/** One of every kind, each in the Trash on its own. Answers the names, by kind. */
export async function everyKind(page: Page, universeId: string): Promise<Record<Kind, string>> {
  const seed = seeder(page, universeId)
  const names: Record<Kind, string> = {
    entry: 'King Eldric',
    story: 'The Drowned Crown',
    chapter: 'Chapter of Ash',
    scene: 'The Last Watch',
    arc: 'The Long Fall',
    beat: 'The Gate Breaks',
    rule: 'No Iron Crosses Water',
  }

  const entry = await seed.entry(names.entry)
  const lonely = await seed.story(names.story)
  const saga = await seed.story('Saga that stays')
  const chapter = await saga.chapter(names.chapter)
  const scene = await saga.scene(names.scene)
  const arc = await saga.arc(names.arc)
  const kept = await saga.arc('Arc that stays')
  const beat = await kept.beat(names.beat)
  const rule = await seed.rule(names.rule)

  for (const thing of [entry, lonely, chapter, scene, arc, beat, rule]) await thing.bin()
  return names
}

export async function trashCount(page: Page, universeId: string) {
  const response = await page.request.get(`/api/universes/${universeId}/trash?pageSize=50`)
  return ((await response.json()) as { totalCount: number }).totalCount
}

export function row(page: Page, name: string) {
  return page.getByTestId(`trash-row-${name}`)
}

export function sideways(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

export interface Copy {
  universeId: string | null
  kind: 'article' | 'manuscript' | 'idea'
  contentId: string
}

/**
 * Puts recovery copies straight into this browser's storage, in the shape `lib/localDrafts.ts` keeps them - as if the
 * author had typed and never saved - so what a permanent delete lets go is read from storage, not through the app.
 */
export async function keepCopies(page: Page, accountId: string, copies: Copy[]) {
  await page.evaluate(
    async ({ accountId, copies }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const opened = indexedDB.open('lorex-recovery', 1)
        opened.onupgradeneeded = () => {
          const store = opened.result.createObjectStore('drafts', { keyPath: 'key' })
          store.createIndex('account-universe', ['accountId', 'universeId'])
        }
        opened.onsuccess = () => resolve(opened.result)
        opened.onerror = () => reject(opened.error)
      })
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('drafts', 'readwrite')
        for (const copy of copies) {
          const key = [accountId, copy.universeId ?? '~', copy.kind, copy.contentId]
            .map((part) => encodeURIComponent(part))
            .join('/')
          transaction.objectStore('drafts').put({
            key,
            accountId,
            ...copy,
            content: `Unsaved ${copy.kind} ${copy.contentId}`,
            baseUpdatedAt: null,
            savedAt: new Date().toISOString(),
          })
        }
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
      })
      database.close()
    },
    { accountId, copies },
  )
}

/** The content ids of every recovery copy this browser holds, read straight from its storage. */
export function heldCopies(page: Page) {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const opened = indexedDB.open('lorex-recovery', 1)
        opened.onsuccess = () => {
          const all = opened.result.transaction('drafts', 'readonly').objectStore('drafts').getAll()
          all.onsuccess = () => {
            opened.result.close()
            resolve((all.result as { contentId: string }[]).map((copy) => copy.contentId).sort())
          }
          all.onerror = () => reject(all.error)
        }
        opened.onerror = () => reject(opened.error)
      }),
  )
}
