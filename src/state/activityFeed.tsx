import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createDirectory, missingResidentIds, type Directory } from '../api/adapt.ts'
import { api } from '../api/client.ts'
import type { ApiActivity } from '../api/types.ts'
import { ActivityFeedContext } from './activityFeedStore.ts'

const pollMs = 5000

/** Loans and handoffs from the API, refreshed every few seconds. */
export function ActivityFeedProvider({ children }: { children: ReactNode }) {
  const [activity, setActivity] = useState<ApiActivity | null>(null)
  const [directory, setDirectory] = useState<Directory | null>(null)
  const [error, setError] = useState<string | null>(null)
  const directoryRef = useRef<Directory | null>(null)

  const refresh = useCallback(async () => {
    try {
      const nextActivity = await api.activity()
      let nextDirectory = directoryRef.current
      const missing = nextDirectory ? missingResidentIds(nextActivity, nextDirectory) : ['catalog']
      if (!nextDirectory || missing.length > 0) {
        const [residents, catalog] = await Promise.all([
          api.residents(),
          nextDirectory ? Promise.resolve(null) : api.catalog(),
        ])
        const catalogRows = catalog ?? (nextDirectory ? [...nextDirectory.catalog.values()] : [])
        nextDirectory = createDirectory(residents, catalogRows)
        directoryRef.current = nextDirectory
        setDirectory(nextDirectory)
      }
      setActivity(nextActivity)
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The Relay API is not answering.')
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), pollMs)
    return () => window.clearInterval(timer)
  }, [refresh])

  const value = useMemo(
    () => ({ activity, directory, error, refresh }),
    [activity, directory, error, refresh],
  )

  return <ActivityFeedContext.Provider value={value}>{children}</ActivityFeedContext.Provider>
}
