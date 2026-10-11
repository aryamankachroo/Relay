import { bookshelfProject } from '../data/bookshelfProject.ts'
import { formatItemQuantity } from '../data/exchanges.ts'
import { createCardMessage, type ChatMessage } from './message.ts'
import { parseExchange } from './intent.ts'
import { temporaryReply } from './temporaryReply.ts'

const bookshelfRequest = /\bbook\s*shel(?:f|ves)\b/i

export function isBookshelfProjectMessage(text: string) {
  return bookshelfRequest.test(text)
}

/** Bookshelf messages open the tool checklist. Needs and offers open a confirmation card. */
export function replyToMessage(text: string): ChatMessage {
  if (isBookshelfProjectMessage(text)) {
    return createCardMessage('relay', {
      type: 'tool-checklist',
      title: bookshelfProject.title,
      summary: bookshelfProject.summary,
    })
  }

  const draft = parseExchange(text)
  if (draft) {
    const when = draft.windowLabel ? `, ${draft.windowLabel}` : ''
    return createCardMessage('relay', {
      type: 'exchange',
      title: draft.kind === 'need' ? `Need for ${draft.item}` : `Offer of ${draft.item}`,
      summary: `${formatItemQuantity(draft.quantity, draft.item)} at ${draft.pickupArea}${when}. Edit the details, then confirm.`,
      draft,
    })
  }

  return temporaryReply()
}
