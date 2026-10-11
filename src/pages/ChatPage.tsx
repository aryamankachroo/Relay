import { MessageCircle } from 'lucide-react'
import { PlaceholderPage } from '../components/PlaceholderPage.tsx'

export function ChatPage() {
  return (
    <PlaceholderPage
      kicker="Say hello"
      title="Chat"
      description="Ask for a hand, offer something you can lend, or pick up a conversation with a neighbor."
      note="Messages will gather here once people start talking."
      icon={MessageCircle}
      accent="var(--relay-color-sky-300)"
    />
  )
}
