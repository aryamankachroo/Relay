import { entry } from './catalog.ts';
import type { Exchange, Resident, TimeWindow } from './types.ts';
export const timeZone = process.env.RELAY_TIME_ZONE || 'America/New_York';
export function when(window: TimeWindow): string {
    const start = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(window.start);
    const end = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(window.end);
    return `${start}–${end}`;
}
export function amount(id: string, quantity: number) { return quantity === 1 ? (['notebooks', 'moving-boxes', 'clamps'].includes(id) ? `1 ${entry(id).name}` : `a ${entry(id).name}`) : `${quantity} ${entry(id).name}`; }
export function pickup(exchange: Exchange, residents: Resident[]) {
    const giver = residents.find(r => r.id === exchange.giver);
    const receiver = residents.find(r => r.id === exchange.receiver);
    return `Confirmed: ${amount(exchange.catalogId, exchange.quantity)} from ${giver?.name ?? 'your neighbor'} for ${receiver?.name ?? 'you'}.\nPickup in demo zone ${giver?.zone ?? '?'}: ${when(exchange.window)}. ${exchange.kind === 'gift' ? 'Receiver: reply RECEIVED after the handoff.' : 'Borrower: reply PICKED UP, then RETURNED when done.'}`;
}
export const help = 'Before you buy it, find it nearby. Demo community: share or borrow nearby.\nTry: I need a ladder Saturday, or I have 20 notebooks to give away.\nReply YES/NO when asked; PICKED UP, RETURNED or RECEIVED to finish.';
export const confused = 'Sorry, I got confused. Try: I need a ladder Saturday.';
