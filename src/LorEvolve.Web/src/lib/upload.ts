import { apiErrorFrom } from './api'

/** How far the bytes have got. `ratio` is null while the browser cannot say how many there are. */
export interface UploadProgress {
  loaded: number
  total: number | null
  ratio: number | null
}

/**
 * One multipart upload, with the one thing `fetch` cannot give: how much of the body has actually
 * left the browser.
 *
 * `fetch` has no upload-progress event. A request body can be a stream whose pulls are countable,
 * but that is not wired to `FormData`, needs HTTP/2 and duplex support, and is not something to
 * build the only upload in the product on. `XMLHttpRequest` has had `upload.onprogress` for
 * fifteen years, so this is the one place LorEvolve uses it - a focused helper for the endpoints
 * that send a file, not a replacement for `apiFetch`.
 *
 * The body is a form for a picture and the file itself for a backup, which the server reads as a
 * raw stream. A `Blob` carries the browser's guess at its type; the server ignores it either way.
 *
 * Everything else is deliberately identical to `apiFetch`: same-origin, the session cookie the
 * browser already holds, `Accept: application/json`, no `Content-Type` (the FormData boundary is
 * the browser's), 204 as `undefined`, and a failure as the same `ApiError` with the same field
 * errors and code - see `apiErrorFrom`.
 *
 * `onProgress` reports the browser's own byte counts and is called once more with a full ratio
 * when the body is away. After that the request is in the server's hands and no number is
 * available or honest, which is why the caller switches to an indeterminate state rather than
 * pretending the last few percent are still moving.
 */
export function apiUpload<T>(
  path: string,
  body: FormData | Blob,
  {
    method = 'PUT',
    onProgress,
    signal,
  }: {
    method?: string
    onProgress?: (progress: UploadProgress) => void
    signal?: AbortSignal
  } = {},
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open(method, path, true)
    request.setRequestHeader('Accept', 'application/json')
    request.responseType = 'text'

    // Same-origin, so the cookie rides along exactly as it does on a fetch.
    request.withCredentials = true

    function stopListening() {
      signal?.removeEventListener('abort', abort)
    }

    function abort() {
      request.abort()
    }

    if (onProgress) {
      request.upload.addEventListener('progress', (event) => {
        onProgress({
          loaded: event.loaded,
          total: event.lengthComputable ? event.total : null,
          ratio: event.lengthComputable && event.total > 0 ? event.loaded / event.total : null,
        })
      })

      // Fires once the last byte is out, whether or not any progress event was computable.
      request.upload.addEventListener('load', () => {
        onProgress({ loaded: 1, total: 1, ratio: 1 })
      })
    }

    request.addEventListener('load', () => {
      stopListening()

      if (request.status === 204 || request.responseText.length === 0) {
        resolve(undefined as T)
        return
      }

      let payload: unknown = null
      try {
        payload = JSON.parse(request.responseText)
      } catch {
        // A body that is not JSON is only ever a proxy or a server error page. It is read the
        // same way an empty one is: by status alone.
      }

      if (request.status >= 200 && request.status < 300) {
        resolve(payload as T)
      } else {
        reject(apiErrorFrom(request.status, payload))
      }
    })

    request.addEventListener('error', () => {
      stopListening()
      // No status and no body: the request never reached the server, or the connection died.
      reject(apiErrorFrom(0, null))
    })

    request.addEventListener('abort', () => {
      stopListening()
      reject(new DOMException('The upload was cancelled.', 'AbortError'))
    })

    if (signal?.aborted) {
      reject(new DOMException('The upload was cancelled.', 'AbortError'))
      return
    }

    signal?.addEventListener('abort', abort)
    request.send(body)
  })
}
