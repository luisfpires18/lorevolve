export function FamilyLinkPreview({
  preview,
}: {
  preview: { subject: string; verb: string; object: string }
}) {
  return (
    <p className="relform__reads" data-testid="family-link-preview">
      <span className="relform__subject">
        <bdi>{preview.subject}</bdi>
      </span>{' '}
      <span className="relform__verb">
        <bdi>{preview.verb}</bdi>
      </span>{' '}
      <span className="relform__object">
        <bdi>{preview.object}</bdi>
      </span>
    </p>
  )
}
