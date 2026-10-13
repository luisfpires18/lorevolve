/**
 * Who saved a version, as one item of a history row's meta line: the account's username, or a plain note for a
 * version that recorded no one - saved before Lorex kept authors, or restored from a backup, which carries none.
 */
export function VersionActor({ name }: { name: string | null }) {
  return (
    <span data-testid="version-actor">
      {name === null ? (
        'author not recorded'
      ) : (
        <>
          by <bdi>{name}</bdi>
        </>
      )}
    </span>
  )
}
