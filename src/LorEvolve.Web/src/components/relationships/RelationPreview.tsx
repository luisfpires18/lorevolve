import type { ReactNode } from 'react'

/**
 * A link as one sentence, "subject verb object", over the form that makes it: the family link form and the relationship
 * form. `isolate` wraps each part in `<bdi>` (the family link form's names); the relationship form's parts are not
 * isolated (#456 G5).
 */
export function RelationPreview({
  subject,
  verb,
  object,
  testId,
  isolate,
}: {
  subject: string
  verb: string
  object: string
  testId: string
  isolate: boolean
}) {
  const part = (text: string): ReactNode => (isolate ? <bdi>{text}</bdi> : text)
  return (
    <p className="relform__reads" data-testid={testId}>
      <span className="relform__subject">{part(subject)}</span>{' '}
      <span className="relform__verb">{part(verb)}</span>{' '}
      <span className="relform__object">{part(object)}</span>
    </p>
  )
}
