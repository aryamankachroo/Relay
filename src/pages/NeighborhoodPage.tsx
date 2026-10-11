import { Map } from 'lucide-react'
import { PlaceholderPage } from '../components/PlaceholderPage.tsx'

export function NeighborhoodPage() {
  return (
    <PlaceholderPage
      kicker="Around the block"
      title="Neighborhood"
      description="See what people nearby need, what they can lend, and where a handoff might happen."
      note="The block is quiet for now. Nearby offers and needs will land here."
      icon={Map}
      accent="var(--relay-color-turquoise-300)"
    />
  )
}
