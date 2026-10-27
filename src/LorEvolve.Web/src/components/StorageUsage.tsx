import { formatBytes } from '../lib/bytes'
import { getAccountStorage } from '../profile/api'
import { useUsageLoad } from '../lib/useUsageLoad'
import { UsageItem, UsageMeter } from './UsageItem'

/**
 * Storage in the Profile's Usage section: how much of the account's allowance its pictures use (ADR 0042).
 *
 * One read when the Profile opens - never per picture or per card. Read only: there is nothing to buy or raise here,
 * so nothing offers to. The full state is said in a sentence rather than left to a colour.
 */
export function StorageUsage() {
  const { load, retry } = useUsageLoad(getAccountStorage)

  return (
    <UsageItem name="Storage" testId="usage-storage" load={load} onRetry={retry}>
      {(storage, labelId) => {
        const full = storage.usedBytes >= storage.quotaBytes

        return (
          <>
            <UsageMeter
              labelId={labelId}
              testId="usage-storage"
              amount={`${formatBytes(storage.usedBytes)} used of ${formatBytes(storage.quotaBytes)}`}
              used={storage.usedBytes}
              limit={storage.quotaBytes}
              full={full}
            />

            {full ? (
              <p className="usage__full" data-testid="usage-storage-full">
                Your storage is full. Remove some images to add new ones.
              </p>
            ) : null}

            <p className="settings__note">
              Images on Lore entries and maps in universes you own count here, including entries in
              the Trash and images your collaborators add.
            </p>
          </>
        )
      }}
    </UsageItem>
  )
}
