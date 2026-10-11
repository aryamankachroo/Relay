import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createDirectory, type Directory } from '../api/adapt.ts'
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
      const [nextActivity, residents, catalog] = await Promise.all([
        api.activity(),
        directoryRef.current ? null : api.residents(),
        directoryRef.current ? null : api.catalog(),
      ])
      if (residents && catalog) {
        directoryRef.current = createDirectory(residents, catalog)
        setDirectory(directoryRef.current)
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
