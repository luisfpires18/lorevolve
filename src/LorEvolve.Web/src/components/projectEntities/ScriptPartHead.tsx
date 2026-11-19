import { QuietNote } from '../QuietNote'
export function ScriptPartHead({
  where,
  titleId,
  name,
}: {
  where: string
  titleId: string
  name: string
}) {
  return (
    <header className="manuscript__head">
      <QuietNote className="manuscript__where" size="xs" wrap testId="project-script-where">
        <span className="manuscript__position">{where}</span>
      </QuietNote>
      <div className="manuscript__titlerow">
        <h3 className="manuscript__title" id={titleId} data-testid="project-script-title">
          <bdi>{name}</bdi>
        </h3>
      </div>
    </header>
  )
}
