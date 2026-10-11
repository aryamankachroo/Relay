import { useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Hammer, HandHelping, Notebook, Send, type LucideIcon } from 'lucide-react'
import { api, apiBase } from '../api/client.ts'
import { replyFromApi } from '../chat/reply.ts'
import {
  createTextMessage,
  type ChatCard,
  type ChatMessage,
  type MessageContent,
} from '../chat/message.ts'
import { RelayMark } from '../components/RelayMark.tsx'
import { ExchangeCard } from '../components/ExchangeCard.tsx'
import { ToolChecklistCard } from '../components/ToolChecklistCard.tsx'
import { demoCommunityLabel } from '../data/index.ts'
import { useActivityFeed } from '../state/activityFeedStore.ts'
import { useCurrentResident } from '../state/currentResident.ts'

const examples: { kicker: string; text: string; icon: LucideIcon; accent: string }[] = [
  {
    kicker: 'A project',
    text: "I'm building a bookshelf this weekend.",
    icon: Hammer,
    accent: 'var(--relay-color-sky-300)',
  },
  {
    kicker: 'Something needed',
    text: 'I need 20 notebooks Saturday morning for a school supply drive.',
    icon: Notebook,
    accent: 'var(--relay-color-mint-300)',
  },
  {
    kicker: 'To lend',
    text: 'I have a ladder to lend.',
    icon: HandHelping,
    accent: 'var(--relay-color-leaf-300)',
  },
]

const inputMaxHeight = 136

export function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const { refresh } = useActivityFeed()
  const logRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const canSend = draft.trim().length > 0
  const announcement = latestRelayAnnouncement(messages)

  useLayoutEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.style.height = '0px'
    input.style.height = `${Math.min(input.scrollHeight, inputMaxHeight)}px`
  }, [draft])

  useLayoutEffect(() => {
    const log = logRef.current
    if (!log || messages.length === 0) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    log.scrollTo({
      top: log.scrollHeight,
      behavior: reduceMotion ? 'auto' : 'smooth',
    })
  }, [messages])

  async function appendExchange(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    const pending = createTextMessage('relay', 'Relay is thinking…', 'pending')
    setMessages((current) => [...current, createTextMessage('user', trimmed), pending])

    let reply: ChatMessage
    try {
      reply = replyFromApi(await api.chat(trimmed), trimmed)
    } catch {
      reply = createTextMessage(
        'relay',
        `I could not reach the Relay API at ${apiBase}. Check that the backend is running, then send that again.`,
        'error',
      )
    }
    setMessages((current) => current.map((message) => (message.id === pending.id ? reply : message)))
    void refresh()
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSend) return
    void appendExchange(draft)
    setDraft('')
    inputRef.current?.focus()
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  return (
    <section className="chat-page" aria-label="Chat with Relay">
      <div className="chat-pond">
        <div className={messages.length === 0 ? 'chat-log chat-log-empty' : 'chat-log'} ref={logRef}>
          <header className="chat-welcome">
            <div className="chat-welcome-lockup">
              <div className="chat-relay-badge">
                <RelayMark className="relay-mark" />
              </div>
              <div className="chat-welcome-copy">
                <p className="eyebrow">Relay</p>
                <h1>What are we making happen?</h1>
              </div>
            </div>
            <p className="chat-intro">
              Relay is how neighbors share a project, a need, or something to give away. A few plain
              sentences are enough to start the next handoff.
            </p>
            <p className="chat-demo-label">{demoCommunityLabel}</p>
            {messages.length === 0 ? (
              <div className="chat-prompts">
                <p className="chat-prompt-label">Try one</p>
                <div className="chat-prompt-grid">
                  {examples.map(({ kicker, text, icon: Icon, accent }) => (
                    <button
                      key={text}
                      type="button"
                      className="chat-prompt"
                      onClick={() => void appendExchange(text)}
                    >
                      <span className="icon-chip chat-prompt-icon" style={{ backgroundColor: accent }}>
                        <Icon aria-hidden="true" size={20} />
                      </span>
                      <span className="chat-prompt-copy">
                        <span className="chat-prompt-kicker">{kicker}</span>
                        <span className="chat-prompt-text">{text}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </header>
          {messages.length > 0 ? (
            <ol className="chat-thread" aria-label="Conversation">
              {messages.map((message) => (
                <ChatBubble key={message.id} message={message} />
              ))}
            </ol>
          ) : null}
        </div>
        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>
        <form className="chat-composer" onSubmit={onSubmit}>
          <label className="sr-only" htmlFor="relay-message">
            Message to Relay
          </label>
          <div className="chat-composer-row">
            <textarea
              ref={inputRef}
              id="relay-message"
              className="chat-input"
              rows={1}
              value={draft}
              placeholder="A project, something you need, or something to give away"
              enterKeyHint="send"
              autoComplete="off"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onInputKeyDown}
            />
            <button type="submit" className="chat-send" disabled={!canSend} aria-label="Send message">
              <Send aria-hidden="true" size={18} />
            </button>
          </div>
          <p className="hint chat-hint">Enter sends. Shift + Enter adds a line.</p>
        </form>
      </div>
    </section>
  )
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const resident = useCurrentResident()
  const isUser = message.author === 'user'
  const isCard = message.content.type === 'card'

  return (
    <li
      className={[
        'chat-row',
        isUser ? 'chat-row-user' : 'chat-row-relay',
        isCard ? 'chat-row-card' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {isUser ? (
        <span className="chat-avatar chat-avatar-user" aria-hidden="true">
          {resident.imageUrl ? (
            <img src={resident.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            resident.initials
          )}
        </span>
      ) : (
        <span className="chat-avatar chat-avatar-relay" aria-hidden="true">
          <RelayMark className="relay-mark" />
        </span>
      )}
      <div
        className={[
          'chat-bubble',
          isUser ? 'chat-bubble-user' : 'chat-bubble-relay',
          isCard ? 'chat-bubble-card' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <p className="chat-speaker">{isUser ? 'You' : 'Relay'}</p>
        <MessageBody content={message.content} />
      </div>
    </li>
  )
}

function MessageBody({ content }: { content: MessageContent }) {
  switch (content.type) {
    case 'text':
      return (
        <p className="chat-text" role={content.tone === 'error' ? 'alert' : undefined}>
          {content.text}
        </p>
      )
    case 'card':
      return <ChatCardSlot card={content.card} />
    default: {
      const unreachable: never = content
      return unreachable
    }
  }
}

function ChatCardSlot({ card }: { card: ChatCard }) {
  switch (card.type) {
    case 'tool-checklist':
      return (
        <ToolChecklistCard
          title={card.title}
          summary={card.summary}
          projectId={card.projectId}
          window={card.window}
          tools={card.tools}
        />
      )
    case 'exchange':
      return <ExchangeCard draft={card.draft} requestId={card.requestId} />
  }
}

function latestRelayAnnouncement(messages: ChatMessage[]) {
  const latest = [...messages].reverse().find((message) => message.author === 'relay')
  if (!latest) return ''
  const relayCount = messages.filter((message) => message.author === 'relay').length
  // Zero-width spaces make an identical reply announce again.
  return `Relay: ${relayAnnouncementText(latest)}${'\u200b'.repeat(relayCount)}`
}

function relayAnnouncementText(message: ChatMessage) {
  switch (message.content.type) {
    case 'text':
      return message.content.text
    case 'card':
      return `${message.content.card.title}. ${message.content.card.summary}`
    default: {
      const unreachable: never = message.content
      return unreachable
    }
  }
}
