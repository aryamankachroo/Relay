import { Package } from 'lucide-react'
import { PlaceholderPage } from '../components/PlaceholderPage.tsx'

export function MyStuffPage() {
  return (
    <PlaceholderPage
      kicker="Your shelf"
      title="My Stuff"
      description="Projects you are planning and the tools you are willing to share live on this shelf."
      note="Nothing is listed yet. A project or a tool will show up here when you add one."
      icon={Package}
      accent="var(--relay-color-mint-300)"
    />
  )
}
