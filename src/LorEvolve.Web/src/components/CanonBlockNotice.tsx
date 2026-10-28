import { Link } from 'react-router-dom'
import { CanonSubjectKind, SUBJECT_KIND_LABELS } from '../canon/types'
import type { CanonBlockingFinding, CanonBlockingSubject } from '../canon/types'

interface Props {
  universeId: string
  findings: CanonBlockingFinding[]

  /**
   * Whether a subject id still names something that exists.
   *
   * A refused write is rolled back, so a *creation* that was blocked leaves its own
   * subject id pointing at a row that never survived. Callers editing an existing record
   * pass true; callers creating one pass false rather than offering a link into nothing.
   */
  linkSubjects: boolean
}

/**
 * What the promotion gate refused, said once, the same way everywhere.
 *
 * This is deliberately not a failure banner. The write is the only thing that did not
 * happen: the draft is untouched, nothing was recorded, and nothing was dismissed or
 * fixed on the author's behalf - ADR 0012. So it reads as a returned page with the
 * objection written in the margin, and it names what disagrees rather than what went
 * wrong.
 */
export function CanonBlockNotice({ universeId, findings, linkSubjects }: Props) {
  return (
    <section className="refusal" role="alert" data-testid="canon-blocked">
      <p className="refusal__eyebrow">Not saved</p>
      <h3 className="refusal__title">
        {findings.length === 1
          ? 'This change would contradict settled canon.'
          : `This change would contradict settled canon in ${findings.length} ways.`}
      </h3>
      <p className="refusal__lede">
        Your edits are still here and nothing was written. Correct what disagrees, or step a Canon
        status back, then save again.
      </p>

      <ol className="refusal__findings">
        {findings.map((finding) => (
          <li className="refusal__finding" key={finding.fingerprint}>
            <p className="refusal__rule">{finding.ruleCode}</p>
            <h4 className="refusal__what">{finding.title}</h4>
            <p className="refusal__account">{finding.explanation}</p>
            {finding.subjects.length > 0 ? (
              <ul className="refusal__subjects">
                {finding.subjects.map((subject) => (
                  <li key={`${subject.kind}-${subject.subjectId}-${subject.role}`}>
                    {subjectLine(universeId, subject, linkSubjects)}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>

      <p className="refusal__aside">
        Only a High finding refuses a save, and only the save that would create one.{' '}
        <Link to={`/app/universes/${universeId}/canon`}>Canon integrity</Link> lists everything else
        this world is already carrying.
      </p>
    </section>
  )
}

/**
 * An entry is the one subject kind with a page of its own, so it is the one that gets a
 * link. The others are named and left alone rather than routed somewhere approximate.
 */
function subjectLine(universeId: string, subject: CanonBlockingSubject, linkSubjects: boolean) {
  const kind = SUBJECT_KIND_LABELS[subject.kind]
  const linkable = linkSubjects && subject.kind === CanonSubjectKind.Entity

  // The role stays outside the link, as it does on a recorded finding: it labels the
  // subject rather than being part of what is being pointed at.
  return (
    <>
      <span className="refusal__role">{subject.role}</span>
      {linkable ? (
        <Link to={`/app/universes/${universeId}/lore/${subject.subjectId}`}>{kind}</Link>
      ) : (
        kind
      )}
    </>
  )
}
