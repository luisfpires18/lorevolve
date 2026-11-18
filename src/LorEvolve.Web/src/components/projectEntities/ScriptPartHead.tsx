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
      <p className="manuscript__where" data-testid="project-script-where">
        <span className="manuscript__position">{where}</span>
      </p>
      <div className="manuscript__titlerow">
        <h3 className="manuscript__title" id={titleId} data-testid="project-script-title">
          <bdi>{name}</bdi>
        </h3>
      </div>
    </header>
  )
}
