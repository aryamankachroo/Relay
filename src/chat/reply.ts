import { draftFromConfirmation, formatWindow } from '../api/adapt.ts'
import type { ApiChatCard } from '../api/types.ts'
import { bookshelfProject } from '../data/bookshelfProject.ts'
import { formatItemQuantity } from '../data/exchanges.ts'
import { createCardMessage, createTextMessage, type ChatMessage } from './message.ts'

const bookshelfRequest = /\bbook\s*shel(?:f|ves)\b/i

export function isBookshelfProjectMessage(text: string) {
  return bookshelfRequest.test(text)
}

/** Turns the card `/api/chat` returned into a chat message. */
export function replyFromApi(card: ApiChatCard, text: string): ChatMessage {
  switch (card.type) {
    case 'tool_list': {
      const when = formatWindow(card.window)
      return createCardMessage('relay', {
        type: 'tool-checklist',
        title: isBookshelfProjectMessage(text) ? bookshelfProject.title : 'Your project',
        summary: when
          ? `${bookshelfProject.summary} Planned for ${when}.`
          : bookshelfProject.summary,
        projectId: card.project_id,
        window: card.window,
        tools: card.tools,
      })
    }
    case 'confirmation': {
      const draft = draftFromConfirmation(card)
      const when = draft.windowLabel ? `, ${draft.windowLabel}` : ''
      return createCardMessage('relay', {
        type: 'exchange',
        title: draft.kind === 'need' ? `Need for ${draft.item}` : `Offer of ${draft.item}`,
        summary: `${formatItemQuantity(draft.quantity, draft.item)} at ${draft.pickupArea}${when}. Edit the details, then confirm.`,
        draft,
        requestId: card.request_id,
      })
    }
    case 'match':
      return createTextMessage(
        'relay',
        card.complete
          ? `Matched all ${card.quantity} ${card.item.name.toLowerCase()}. The handoff is waiting on confirmation.`
          : `Matched ${card.filled_quantity} of ${card.quantity} ${card.item.name.toLowerCase()}. The rest stays open.`,
      )
    case 'loan_status':
      return createTextMessage('relay', loanStatusText(card))
    case 'inventory_answer':
      return createTextMessage('relay', card.message)
    case 'no_match':
      return createTextMessage('relay', card.message)
  }
}

function loanStatusText(card: Extract<ApiChatCard, { type: 'loan_status' }>) {
  if (card.record === 'loan') return `That loan is now ${card.status.replace('_', ' ')}.`
  if (card.record === 'handoff') return `That handoff is now ${card.status}.`
  return card.status === 'declined' ? 'Okay, I dropped that request.' : `That request is ${card.status}.`
}
