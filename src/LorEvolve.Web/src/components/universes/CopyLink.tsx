import { useEffect, useId, useRef, useState } from 'react'
import { useI18n } from '../../i18n'
import { invitationLink } from '../../universes/collaborators'
import { Field } from '../Field'

/**
 * Copies an invitation's link. When the clipboard cannot be written - an older browser, a denied permission, a page not
 * served over https - the link is shown selected instead, so it can be copied by hand. Never a silent failure.
 */
export function CopyLink({
  claimToken,
  label,
  testId,
}: {
  claimToken: string
  label: string
  testId: string
}) {
  const { t } = useI18n()
  const link = invitationLink(claimToken)
  const [status, setStatus] = useState<'idle' | 'copied' | 'manual'>('idle')
  const manualInput = useRef<HTMLInputElement>(null)
  const inputId = useId()

  useEffect(() => {
    if (status === 'manual') manualInput.current?.select()
  }, [status])

  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error('No clipboard')
      await navigator.clipboard.writeText(link)
      setStatus('copied')
    } catch {
      setStatus('manual')
    }
  }

  return (
    <span className="collab__copy">
      <button
        className="button button--secondary"
        type="button"
        onClick={() => void copy()}
        data-testid={testId}
      >
        {label}
      </button>
      <span className="collab__copystatus" role="status" data-testid={`${testId}-status`}>
        {status === 'copied' ? t('universe.collab.copied') : ''}
      </span>
      {status === 'manual' ? (
        <Field label={t('universe.collab.copyManual')} id={inputId} className="collab__manual">
          {() => (
            <input
              ref={manualInput}
              id={inputId}
              name="invite-link"
              className="field__input"
              type="text"
              readOnly
              value={link}
              onFocus={(event) => event.target.select()}
              data-testid={`${testId}-manual`}
            />
          )}
        </Field>
      ) : null}
    </span>
  )
}
