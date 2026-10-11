import { Bell } from 'lucide-react'
import { PlaceholderPage } from '../components/PlaceholderPage.tsx'

export function ActivityPage() {
  return (
    <PlaceholderPage
      kicker="Recent"
      title="Activity"
      description="A light record of matches, notes, and finished handoffs around Willow Court."
      note="No activity yet. Completed exchanges will be noted here."
      icon={Bell}
      accent="var(--relay-color-aqua-300)"
    />
  )
}
