import { randomUUID } from 'node:crypto';
import { entry, projects } from './catalog.ts';
import { amount, help, pickup, when } from './format.ts';
import { match } from './matcher.ts';
import { parse } from './parse.ts';
import { first_free_slot, overlaps, schedule_shared } from './scheduler.ts';
import { seed } from './seed.ts';
import { active, transition } from './status.ts';
import { RelayStore } from './store.ts';
import type { ChatResult, Exchange, GroupBuy, Notification, Pending, Request } from './types.ts';
const duration = 60 * 60 * 1000, buffer = 15 * 60 * 1000;
const zoneLimit = Number(process.env.RELAY_ZONE_LIMIT ?? 1);
function samePending(a: Pending, b: Pending) { return a.type === b.type && a.id === b.id; }
export function createChat(store: RelayStore, options: {
    now?: () => number;
    geminiKey?: string;
    model?: string;
} = {}) {
    return (userId: string, text: string, delivery?: {
        messageId: string;
    }): Promise<ChatResult> => store.transaction(async () => {
        if (delivery && store.state.delivered.includes(delivery.messageId))
            return { type: 'message', reply: '' };
        const handle = async (): Promise<ChatResult> => {
            const now = options.now?.() ?? Date.now(), state = store.state;
            let resident = state.residents.find(r => r.id === userId);
            if (!resident) {
                resident = { id: userId, name: `Neighbor ${state.residents.length + 1}`, zone: 0, owned: [] };
                state.residents.push(resident);
            }
            const who = (id: string) => state.residents.find(r => r.id === id)!;
            const notify: Notification[] = [];
            const send = (id: string, message: string) => notify.push({ userId: id, text: message });
            const groupText = (group: GroupBuy) => {
                const price = entry(group.catalogId).demoPrice;
                const slots = group.slots.map(slot => `${who(state.requests.find(r => r.id === slot.id)!.userId).name}: ${when(slot.window)}`).join('; ');
                return `${group.members.length} neighbors need a ${entry(group.catalogId).name} and nobody nearby owns one. Demo price: $${(price / group.members.length).toFixed(2).replace('.00', '')} each instead of $${price} each.\n${slots}\nWant to split one? YES/NO (demo).`;
            };
            const prompt = (pending: Pending, id: string) => {
                if (pending.type === 'group')
                    return groupText(state.groups.find(g => g.id === pending.id)!);
                const exchange = state.exchanges.find(e => e.id === pending.id)!;
                return id === exchange.giver
                    ? `${who(id).name}, ${who(exchange.receiver).name} needs ${amount(exchange.catalogId, exchange.quantity)} ${when(exchange.window)} in demo zone ${who(id).zone}.\nOK to ${exchange.kind === 'gift' ? 'give' : 'lend'} it? Reply YES or NO.`
                    : `${who(exchange.giver).name} can ${exchange.kind === 'gift' ? 'give' : 'lend'} you ${amount(exchange.catalogId, exchange.quantity)} ${when(exchange.window)} in demo zone ${who(exchange.giver).zone}.\nWant it? Reply YES or NO.`;
            };
            const ask = (id: string, pending: Pending) => {
                const queue = state.pending[id] ?? (state.pending[id] = []);
                if (queue.some(p => samePending(p, pending)))
                    return;
                queue.push(pending);
                if (queue.length === 1)
                    send(id, prompt(pending, id));
            };
            const clear = (pending: Pending) => {
                for (const [id, queue] of Object.entries(state.pending)) {
                    const wasFirst = queue[0] && samePending(queue[0], pending);
                    state.pending[id] = queue.filter(p => !samePending(p, pending));
                    if (wasFirst && state.pending[id].length)
                        send(id, prompt(state.pending[id][0], id));
                }
            };
            const updateRequest = (request: Request) => {
                const exchanges = state.exchanges.filter(e => e.requestId === request.id && e.status !== 'Declined');
                const covered = exchanges.reduce((sum, e) => sum + e.quantity, 0);
                request.status = covered < request.quantity ? 'open' : exchanges.every(e => !active(e.status)) ? 'completed' : 'matched';
            };
            const findMatches = (request: Request, requireBoth = false) => {
                if (request.window.end <= now)
                    return { covered: 0, remaining: request.quantity, donors: 0 };
                const existing = state.exchanges.filter(e => e.requestId === request.id && e.status !== 'Declined').reduce((sum, e) => sum + e.quantity, 0);
                const remaining = request.quantity - existing;
                if (remaining <= 0)
                    return { covered: existing, remaining: 0, donors: 0 };
                const available = state.items.map(item => {
                    const reserved = state.exchanges.filter(e => e.item === item.id && active(e.status) && (item.kind === 'gift' || overlaps(e.window, request.window))).reduce((sum, e) => sum + e.quantity, 0);
                    // Loans can be booked sequentially even if the requested windows overlap.
                    const bookings = state.exchanges.filter(e => e.item === item.id && active(e.status)).map(e => e.window);
                    const windows = item.windows.flatMap(w => {
                        const end = Math.min(w.end, request.window.end);
                        const free = first_free_slot(bookings, Math.max(w.start, request.window.start, now), end, duration, buffer);
                        return free ? [{ start: free.start, end }] : [];
                    });
                    return { ...item, windows, quantity: item.kind === 'gift' ? Math.max(0, item.quantity - reserved) : item.quantity };
                });
                const result = match({ ...request, quantity: remaining }, available, state.residents, zoneLimit);
                let allocated = 0, donors = 0;
                const portions: number[] = [];
                for (const allocation of result.allocations) {
                    const item = state.items.find(i => i.id === allocation.itemId)!;
                    const bookings = state.exchanges.filter(e => e.item === item.id && active(e.status)).map(e => e.window);
                    const slot = first_free_slot(bookings, Math.max(now, allocation.window.start), allocation.window.end, duration, buffer);
                    if (!slot)
                        continue;
                    const exchange: Exchange = { id: randomUUID(), item: item.id, catalogId: item.catalogId, quantity: allocation.quantity, giver: item.owner, receiver: request.userId, requestId: request.id, window: slot, status: 'Requested', kind: request.kind, giverConfirmed: false, receiverConfirmed: !requireBoth };
                    const offer = state.requests.find(r => r.type === 'offer' && r.userId === item.owner && r.catalogId === item.catalogId && r.kind === item.kind && r.status !== 'completed');
                    if (offer)
                        exchange.offerId = offer.id;
                    state.exchanges.push(exchange);
                    allocated += exchange.quantity;
                    donors++;
                    portions.push(exchange.quantity);
                    ask(exchange.giver, { type: 'exchange', id: exchange.id });
                    if (requireBoth)
                        ask(exchange.receiver, { type: 'exchange', id: exchange.id });
                }
                updateRequest(request);
                return { covered: existing + allocated, remaining: remaining - allocated, donors, portions };
            };
            const maybeDemand = (request: Request): GroupBuy | undefined => {
                if (request.kind !== 'loan' || request.status !== 'open' || request.quantity !== 1)
                    return;
                const nearby = (r: Request) => state.residents.some(owner => owner.owned.includes(r.catalogId) && Math.abs(owner.zone - r.zone) <= zoneLimit) || state.items.some(item => item.catalogId === r.catalogId && item.quantity > 0 && Math.abs(who(item.owner).zone - r.zone) <= zoneLimit);
                if (nearby(request))
                    return;
                const candidates = state.requests.filter(r => r.type === 'need' && r.catalogId === request.catalogId && r.kind === 'loan' && r.quantity === 1 && r.status === 'open' && r.window.end > now && Math.abs(r.zone - request.zone) <= zoneLimit && !nearby(r));
                const distinct = [...new Map(candidates.map(r => [r.userId, r])).values()];
                if (distinct.length < 2)
                    return;
                // Group buying is for requests in distinct, non-overlapping windows.
                if (distinct.some((a, i) => distinct.some((b, j) => i < j && overlaps(a.window, b.window))))
                    return;
                const calendar = schedule_shared(distinct, duration, buffer);
                if (calendar.unplaced)
                    return;
                let group = state.groups.find(g => g.catalogId === request.catalogId && g.status === 'proposed' && g.members.some(m => distinct.some(r => r.userId === m)));
                if (!group) {
                    group = { id: randomUUID(), catalogId: request.catalogId, requests: distinct.map(r => r.id), members: distinct.map(r => r.userId), accepted: [], declined: [], slots: calendar.slots, status: 'proposed' };
                    state.groups.push(group);
                    for (const id of group.members)
                        ask(id, { type: 'group', id: group.id });
                }
                else if (distinct.some(r => !group!.members.includes(r.userId)) || JSON.stringify(calendar.slots) !== JSON.stringify(group.slots)) {
                    group.requests = distinct.map(r => r.id);
                    group.members = distinct.map(r => r.userId);
                    group.slots = calendar.slots;
                    // Changed members/price/calendar require fresh consent from everybody.
                    group.accepted = [];
                    for (const id of group.members) {
                        const pending: Pending = { type: 'group', id: group.id };
                        const queue = state.pending[id] ?? (state.pending[id] = []);
                        const index = queue.findIndex(p => samePending(p, pending));
                        if (index < 0)
                            ask(id, pending);
                        else if (index === 0)
                            send(id, groupText(group));
                    }
                }
                return group;
            };
            const finish = (type: ChatResult['type'], reply: string): ChatResult => {
                const own = [...new Set(notify.filter(n => n.userId === userId).map(n => n.text))];
                const outgoing = notify.filter(n => n.userId !== userId);
                let direct = reply;
                if (own.length) {
                    const lines = own.length === 1 ? own[0].split('\n') : own.map(text => text.replace(/\n/g, ' '));
                    if (parsed.intent === 'offer' || parsed.project) lines.unshift(reply.split('\n')[0]);
                    direct = lines.length <= 3 ? lines.join('\n') : [...lines.slice(0, 2), lines.slice(2).join(' ')].join('\n');
                }
                return { type, reply: direct, ...(outgoing.length ? { notify: outgoing } : {}) };
            };
            const previousPrompt = state.pending[userId]?.[0];
            let expiredCurrentPrompt = false;
            for (const exchange of state.exchanges.filter(e => e.status === 'Requested' && e.window.end <= now)) {
                if (previousPrompt?.type === 'exchange' && previousPrompt.id === exchange.id) expiredCurrentPrompt = true;
                exchange.status = transition(exchange.kind, exchange.status, 'Declined');
                clear({ type: 'exchange', id: exchange.id });
                const request = state.requests.find(r => r.id === exchange.requestId);
                if (request)
                    updateRequest(request);
            }
            const parsed = await parse(text, { now, geminiKey: options.geminiKey, model: options.model });
            console.log('[relay.parse]', JSON.stringify({ userId, intent: parsed.intent, item: parsed.item, quantity: parsed.quantity }));
            if (parsed.intent === 'help')
                return finish('message', help);
            if (parsed.intent === 'unknown')
                return finish('message', 'I can help you borrow or share nearby.\nTry: I need a ladder Saturday, or I have 20 notebooks to give away.\nText HELP for more.');
            if (parsed.intent === 'clarify')
                return finish('message', parsed.question!);
            if (parsed.intent === 'confirm') {
                if (expiredCurrentPrompt && (parsed.action === 'yes' || parsed.action === 'no')) {
                    const next = state.pending[userId]?.[0];
                    if (next) send(userId, `The earlier proposal expired.\n${prompt(next, userId)}`);
                    return finish('message', 'That proposal expired. Send a new need or offer for a future time.');
                }
                if (parsed.action === 'yes' || parsed.action === 'no') {
                    const pending = state.pending[userId]?.[0];
                    if (!pending)
                        return finish('message', 'There is nothing waiting for YES or NO. Try: I need a ladder Saturday.');
                    if (pending.type === 'group') {
                        const group = state.groups.find(g => g.id === pending.id)!;
                        if (parsed.action === 'no') {
                            group.declined.push(userId);
                            group.status = 'declined';
                            clear(pending);
                            for (const id of group.members)
                                send(id, 'Group buy paused (demo). No purchase was made; your need stays open.');
                            return finish('shared_demand', 'Group buy paused (demo).');
                        }
                        if (!group.accepted.includes(userId))
                            group.accepted.push(userId);
                        state.pending[userId].shift();
                        if (group.accepted.length === group.members.length) {
                            group.status = 'started';
                            clear(pending);
                            for (const id of group.members)
                                send(id, 'Group buy started (demo). No payment or purchase was made.');
                        }
                        else
                            send(userId, 'You said yes. Waiting for the other neighbors; no purchase has been made.');
                        if (state.pending[userId]?.length)
                            send(userId, prompt(state.pending[userId][0], userId));
                        return finish('shared_demand', 'Waiting for neighbors.');
                    }
                    const exchange = state.exchanges.find(e => e.id === pending.id)!;
                    const request = state.requests.find(r => r.id === exchange.requestId)!;
                    if (parsed.action === 'no') {
                        exchange.status = transition(exchange.kind, exchange.status, 'Declined');
                        request.declinedOwners.push(exchange.giver);
                        clear(pending);
                        updateRequest(request);
                        send(exchange.giver, `${who(exchange.receiver).name}'s ${entry(exchange.catalogId).name} match was declined. No handoff is booked.`);
                        send(exchange.receiver, `${who(exchange.giver).name}'s ${entry(exchange.catalogId).name} match was declined. I'll try another neighbor.`);
                        const rematch = findMatches(request, exchange.kind === 'gift');
                        if (rematch.remaining)
                            send(exchange.receiver, `No other match covers ${amount(request.catalogId, rematch.remaining)} yet. Your request stays open; I'll text when a match appears.`);
                        return finish('message', 'No problem. That match was declined.');
                    }
                    if (userId === exchange.giver)
                        exchange.giverConfirmed = true;
                    if (userId === exchange.receiver)
                        exchange.receiverConfirmed = true;
                    state.pending[userId].shift();
                    if (exchange.giverConfirmed && exchange.receiverConfirmed) {
                        const availability = state.items.find(i => i.id === exchange.item)!.windows;
                        const window = availability.map(w => ({ start: Math.max(w.start, request.window.start, now), end: Math.min(w.end, request.window.end) })).find(w => w.end - w.start >= duration);
                        const otherBookings = state.exchanges.filter(e => e.id !== exchange.id && e.item === exchange.item && active(e.status)).map(e => e.window);
                        const slot = window ? first_free_slot(otherBookings, window.start, window.end, duration, buffer) : null;
                        if (!slot) {
                            exchange.status = transition(exchange.kind, exchange.status, 'Declined');
                            clear(pending);
                            updateRequest(request);
                            request.declinedOwners.push(exchange.giver);
                            send(exchange.receiver, 'That window is no longer free. Your request stays open; I will look for another neighbor.');
                            findMatches(request, exchange.kind === 'gift');
                            return finish('message', 'That window is no longer free. I will look for another match.');
                        }
                        exchange.window = slot;
                        exchange.status = transition(exchange.kind, exchange.status, 'Confirmed');
                        clear(pending);
                        const details = pickup(exchange, state.residents);
                        send(exchange.giver, details);
                        send(exchange.receiver, details);
                    }
                    else
                        send(userId, 'Thanks, you confirmed. Waiting for the other neighbor to reply YES.');
                    if (state.pending[userId]?.length)
                        send(userId, prompt(state.pending[userId][0], userId));
                    return finish('loan_status', 'Confirmed.');
                }
                const next = parsed.action === 'picked up' ? 'Picked up' : parsed.action === 'returned' ? 'Returned' : 'Received';
                const expected = next === 'Returned' ? 'Picked up' : 'Confirmed';
                const candidates = state.exchanges.filter(e => e.receiver === userId && e.status === expected && (parsed.item ? e.catalogId === parsed.item : true) && (next === 'Received' ? e.kind === 'gift' : e.kind === 'loan'));
                if (!candidates.length)
                    return finish('message', `No ${next === 'Received' ? 'gift' : 'loan'} is ready for ${parsed.action?.toUpperCase()}. Confirm it first, and pick up a loan before returning it.`);
                if (new Set(candidates.map(e => e.catalogId)).size > 1)
                    return finish('message', `Which item? Reply ${parsed.action?.toUpperCase()} followed by its name, for example ${parsed.action?.toUpperCase()} ladder.`);
                for (const exchange of candidates) {
                    exchange.status = transition(exchange.kind, exchange.status, next);
                    if (next === 'Received') {
                        const item = state.items.find(i => i.id === exchange.item)!;
                        item.quantity = Math.max(0, item.quantity - exchange.quantity);
                        if (!resident.owned.includes(item.catalogId))
                            resident.owned.push(item.catalogId);
                    }
                    updateRequest(state.requests.find(r => r.id === exchange.requestId)!);
                    if (exchange.offerId && next === 'Received') {
                        const offer = state.requests.find(r => r.id === exchange.offerId)!;
                        const received = state.exchanges.filter(e => e.offerId === offer.id && e.status === 'Received').reduce((sum, e) => sum + e.quantity, 0);
                        offer.status = received >= offer.quantity ? 'completed' : 'open';
                    }
                    send(exchange.giver, `${who(userId).name} ${parsed.action} ${amount(exchange.catalogId, exchange.quantity)}. ${next === 'Picked up' ? 'Borrower will text RETURNED when done.' : 'Thanks for sharing nearby!'}`);
                }
                return finish('loan_status', next === 'Picked up' ? 'Pickup recorded. Reply RETURNED when you bring it back.' : 'All done. Thanks for sharing nearby!');
            }
            const newRequest = (catalogId: string, quantity: number): Request => {
                const request: Request = { id: randomUUID(), type: parsed.intent as 'need' | 'offer', userId, catalogId, quantity, zone: resident.zone, window: parsed.window!, status: 'open', kind: parsed.project ? entry(catalogId).kind : parsed.mode!, declinedOwners: [], createdAt: now };
                state.requests.push(request);
                return request;
            };
            if (parsed.intent === 'offer') {
                const request = newRequest(parsed.item!, parsed.quantity);
                state.items.push({ id: randomUUID(), owner: userId, catalogId: request.catalogId, quantity: request.quantity, windows: [request.window], willingToLend: true, kind: request.kind, notes: 'Offer posted via Relay' });
                if (!resident.owned.includes(request.catalogId))
                    resident.owned.push(request.catalogId);
                for (const need of state.requests.filter(r => r.type === 'need' && r.status === 'open' && r.catalogId === request.catalogId && r.kind === request.kind && r.userId !== userId)) {
                    const result = findMatches(need, true);
                    if (result.covered)
                        send(need.userId, `A matching offer appeared for your ${entry(need.catalogId).name} request. ${result.remaining ? `${result.remaining} still needed.` : 'I am arranging the match.'}`);
                }
                return finish(notify.length ? 'match' : 'message', `Got it: ${amount(request.catalogId, request.quantity)} to ${request.kind === 'gift' ? 'give away' : 'lend'}.\nSaved in the demo community. I'll text when a matching need appears.`);
            }
            if (parsed.project) {
                const missing = projects[parsed.project].filter(id => !resident.owned.includes(id));
                if (!missing.length)
                    return finish('tool_list', 'You already own the tools for that project. Want to lend one?');
                const absent: string[] = [];
                for (const id of missing) {
                    const request = newRequest(id, 1);
                    const found = findMatches(request);
                    if (!found.covered)
                        absent.push(entry(id).name);
                    maybeDemand(request);
                }
                return finish('tool_list', `Tools to borrow: ${missing.map(id => entry(id).name).join(', ')}.\nI am asking available neighbors to confirm.${absent.length ? `\nNo nearby match for ${absent.join(', ')}; those requests stay open.` : ''}`);
            }
            const request = newRequest(parsed.item!, parsed.quantity);
            const found = findMatches(request);
            const group = maybeDemand(request);
            if (group)
                return finish('shared_demand', groupText(group));
            if (found.covered) {
                const partial = found.donors > 1 && found.portions ? `I found ${found.portions[0]} of ${request.quantity}, adding ${found.portions.slice(1).reduce((a, b) => a + b, 0)} from ${found.donors === 2 ? 'another neighbor' : `${found.donors - 1} more neighbors`}.` : found.remaining ? `I found ${found.covered} of ${request.quantity}.` : `Found ${amount(request.catalogId, request.quantity)} nearby.`;
                const proposed = state.exchanges.find(e => e.requestId === request.id && e.status === 'Requested');
                return finish('match', `Got it: ${amount(request.catalogId, request.quantity)}, ${when(request.window)}.\n${partial} Asking the ${request.kind === 'gift' ? 'donor' : 'lender'} to confirm.\n${proposed ? `Pickup offered: ${when(proposed.window)}.` : ''}${found.remaining ? ` ${found.remaining} still needed; I'll text when more appear.` : ''}`);
            }
            const ownersNearby = state.residents.some(owner => owner.owned.includes(request.catalogId) && Math.abs(owner.zone - request.zone) <= zoneLimit) || state.items.some(i => i.catalogId === request.catalogId && i.quantity > 0 && Math.abs(who(i.owner).zone - request.zone) <= zoneLimit);
            return finish('message', `${ownersNearby ? 'No available match fits your time and quantity.' : `Nobody nearby owns ${amount(request.catalogId, 1)} in this demo community.`}\nYour request stays open. I'll text when a matching offer appears.`);
        };
        const result = await handle();
        if (delivery) {
            store.state.delivered.push(delivery.messageId);
            const messages = [{ userId, text: result.reply }, ...(result.notify ?? [])];
            store.state.outbox.push(...messages.filter(m => m.text).map(m => ({ ...m, id: randomUUID() })));
        }
        return result;
    });
}
let defaultStore: RelayStore | undefined;
let defaultChat: ReturnType<typeof createChat> | undefined;
export function getStore() {
    if (!defaultStore)
        defaultStore = new RelayStore({ initial: seed() });
    return defaultStore;
}
export async function chat(userId: string, text: string, delivery?: {
    messageId: string;
}): Promise<ChatResult> {
    defaultChat ??= createChat(getStore(), { geminiKey: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL });
    return defaultChat(userId, text, delivery);
}
