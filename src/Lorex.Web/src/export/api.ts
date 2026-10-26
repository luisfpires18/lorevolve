import { ApiError } from '../lib/api'

/**
 * Downloading a backup, which is the one place the client asks for a file rather than JSON.
 *
 * `apiFetch` cannot be reused here: it parses the body, and the body is the artefact. So this
 * makes the same same-origin, cookie-carrying request by hand and reads the response as a blob
 * instead. A failure still arrives as ProblemDetails and is still raised as an `ApiError`, so
 * the page handles it exactly as it handles any other refusal.
 *
 * The artefact is a ZIP: the backup document plus every entry's original picture beside it. The
 * client neither opens it nor knows what is inside - it asks, and it saves what comes back.
 */
const FALLBACK_FILE_NAME = 'lorex-universe.zip'

/**
 * The name the server chose, out of `Content-Disposition`. Only the basename is kept: a
 * response is not allowed to steer where the file lands.
 */
function fileNameFrom(header: string | null) {
  const match = header?.match(/filename="?([^";]+)"?/i)
  const name = match?.[1]?.split(/[/\\]/).pop()?.trim()

  return name && name.length > 0 ? name : FALLBACK_FILE_NAME
}

/** Hands the blob to the browser as a download, then lets go of the object URL. */
function save(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = fileName
  document.body.append(anchor)
  anchor.click()
  anchor.remove()

  // Revoked on the next turn: revoking synchronously can race the download starting.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * Downloads one universe's backup and returns the filename it was saved under, so the page
 * can say which file to look for.
 */
export function downloadUniverseBackup(universeId: string): Promise<string> {
  return download(
    `/api/universes/${universeId}/export`,
    'That backup could not be prepared. Try again.',
  )
}

/**
 * Downloads the readable export (issue #11): the same universe as Markdown pages with its
 * pictures, for reading and keeping. LoreX never reads it back - a backup is what restores.
 */
export function downloadReadableExport(universeId: string): Promise<string> {
  return download(
    `/api/universes/${universeId}/export/readable`,
    'That export could not be prepared. Try again.',
  )
}

async function download(path: string, fallbackMessage: string): Promise<string> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    // The archive when it works, ProblemDetails when it does not - and a refusal is read as
    // JSON below, so both have to be asked for.
    headers: { Accept: 'application/zip, application/json' },
  })

  if (!response.ok) {
    const isJson = response.headers.get('content-type')?.includes('json') ?? false
    const problem = isJson ? ((await response.json()) as { detail?: string; title?: string }) : null

    throw new ApiError(response.status, problem?.detail ?? problem?.title ?? fallbackMessage)
  }

  const fileName = fileNameFrom(response.headers.get('content-disposition'))
  save(await response.blob(), fileName)

  return fileName
}
