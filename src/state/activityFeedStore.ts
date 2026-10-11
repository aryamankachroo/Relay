import { createContext, useContext } from 'react'
import type { Directory } from '../api/adapt.ts'
import type { ApiActivity } from '../api/types.ts'

export type ActivityFeed = {
  activity: ApiActivity | null
  directory: Directory | null
  /** Set when the last poll could not reach the API. */
  error: string | null
  refresh: () => Promise<void>
}

export const ActivityFeedContext = createContext<ActivityFeed | null>(null)

export function useActivityFeed() {
  const feed = useContext(ActivityFeedContext)
  if (!feed) throw new Error('useActivityFeed must be used within ActivityFeedProvider')
  return feed
}
