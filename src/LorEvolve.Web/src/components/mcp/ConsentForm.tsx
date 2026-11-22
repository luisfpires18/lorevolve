import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { ConsentToken } from '../../mcp/api'
import { useI18n } from '../../i18n'
import { Button } from '../Button'
import { FormActions } from '../FormActions'

/** The field the decision travels in, beside the request's own parameters. Read by `OAuthEndpoints` on the server. */
const DECISION_FIELD = 'lorevolve_decision'

/**
 * The consent decision's form (ADR 0046): posts the request's parameters back unchanged, with the antiforgery token and
 * the decision. It holds what is being decided as well as the decision, so its buttons can stay pinned to the foot of
 * the screen while a long request scrolls past them (`.consent__actions`). Approve shows only for a request that can be
 * approved (`ready`); otherwise the one button turns it down and goes back.
 */
export function ConsentForm({
  params,
  token,
  ready,
  detailsId,
  children,
}: {
  params: URLSearchParams
  token: ConsentToken
  ready: boolean
  /** The details Approve is described by. */
  detailsId: string
  children: ReactNode
}) {
  const { t } = useI18n()
  const [deciding, setDeciding] = useState(false)
  const submitted = useRef(false)

  // The request exactly as it arrived, for the post back. Repeated names (more than one resource) stay repeated.
  const fields = [...params.entries()].filter(
    ([name]) => name !== DECISION_FIELD && name !== token.fieldName,
  )

  // One decision per screen. The buttons are not disabled: a disabled submit button would leave its own value - the
  // decision - out of the post. A second press is simply not sent.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (submitted.current) {
      event.preventDefault()
      return
    }
    submitted.current = true
    setDeciding(true)
  }

  return (
    <form
      className="consent__form"
      method="post"
      action="/oauth/authorize"
      onSubmit={onSubmit}
      aria-busy={deciding}
      data-testid="consent-form"
    >
      {fields.map(([name, value], index) => (
        <input key={`${name}-${index}`} type="hidden" name={name} value={value} />
      ))}
      <input type="hidden" name={token.fieldName} value={token.token} />
      {children}
      <FormActions inline className="consent__actions">
        {ready ? (
          <Button
            type="submit"
            name={DECISION_FIELD}
            value="approve"
            aria-describedby={detailsId}
            data-testid="consent-approve"
          >
            {deciding ? t('universe.connect.connecting') : t('universe.connect.approve')}
          </Button>
        ) : null}
        <Button
          tone="secondary"
          type="submit"
          name={DECISION_FIELD}
          value="deny"
          data-testid="consent-deny"
        >
          {ready ? t('universe.connect.deny') : t('universe.connect.goBack')}
        </Button>
      </FormActions>
    </form>
  )
}
