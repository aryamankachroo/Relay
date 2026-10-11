import { Flower2 } from 'lucide-react'
import { PlaceholderPage } from '../components/PlaceholderPage.tsx'

export function GardenPage() {
  return (
    <PlaceholderPage
      kicker="Shared beds"
      title="Garden"
      description="Seeds, cuttings, and the plants neighbors are tending between houses."
      note="The beds are open. Garden posts will grow here."
      icon={Flower2}
      accent="var(--relay-color-leaf-300)"
    />
  )
}
