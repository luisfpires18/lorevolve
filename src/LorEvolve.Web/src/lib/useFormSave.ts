import { useRef, useState } from 'react'
import { ApiError } from './api'

type FieldErrors = Record<string, string>

export interface FormSaveOptions {
  /**
   * The message when the API names fields: a fixed string, `null` for none, or worked out from the
   * refused fields. With no field named, the API's own message shows.
   */
  needChange: string | null | ((fieldErrors: FieldErrors, error: ApiError) => string | null)
  /** The message for anything that is not an API answer (or, with `badRequestOnly`, not a 400). */
  failed: string | ((error: unknown) => string)
  /**
   * Looked at first: `true` when the form has handled the error itself (a conflict, a gate), a
   * string to show as the message, `false` to go on with the shared rules.
   */
  refusal?: (error: unknown) => boolean | string
  /** Only a 400 names fields; any other API answer is `failed`. */
  badRequestOnly?: boolean
  /** Called with the refused fields once they are set, for example to open or focus them. */
  onFieldErrors?: (fieldErrors: FieldErrors, error: ApiError) => void
}

/**
 * One save of a form: clears the last message and field errors, holds `isSaving` while `run`
 * runs, maps a refusal to field errors and a message, and ignores a second save while one runs.
 * Options given to `save` override the hook's for that call. Catalogue: `docs/design/ui-components.md`.
 */
export function useFormSave(options: FormSaveOptions) {
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const running = useRef(false)

  /** Runs one save; resolves `true` when `run` finished without throwing, `false` otherwise or when skipped. */
  async function save(run: () => Promise<unknown>, overrides?: Partial<FormSaveOptions>) {
    if (running.current) return false
    const { needChange, failed, refusal, badRequestOnly, onFieldErrors } = {
      ...options,
      ...overrides,
    }
    running.current = true
    setMessage(null)
    setFieldErrors({})
    setIsSaving(true)
    try {
      await run()
      return true
    } catch (error: unknown) {
      const handled = refusal?.(error) ?? false
      if (typeof handled === 'string') {
        setMessage(handled)
      } else if (handled) {
        // The form showed this refusal its own way.
      } else if (error instanceof ApiError && (!badRequestOnly || error.status === 400)) {
        const refused = error.fieldErrors
        setFieldErrors(refused)
        setMessage(
          Object.keys(refused).length === 0
            ? error.message
            : typeof needChange === 'function'
              ? needChange(refused, error)
              : needChange,
        )
        onFieldErrors?.(refused, error)
      } else {
        setMessage(typeof failed === 'function' ? failed(error) : failed)
      }
      return false
    } finally {
      running.current = false
      setIsSaving(false)
    }
  }

  return { isSaving, message, setMessage, fieldErrors, setFieldErrors, save }
}
