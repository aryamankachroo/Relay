import { catalog, lookup, projects } from './catalog.ts';
import { timeZone } from './format.ts';
import type { Kind, TimeWindow } from './types.ts';
export type Parsed = {
    intent: 'need' | 'offer' | 'confirm' | 'help' | 'unknown' | 'clarify';
    item?: string;
    quantity: number;
    window?: TimeWindow;
    mode?: Kind;
    action?: 'yes' | 'no' | 'picked up' | 'returned' | 'received';
    project?: string;
    question?: string;
};
export type ParseOptions = {
    now?: number;
    geminiKey?: string;
    model?: string;
};
const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const dayMs = 86400000;
function localDate(now: number) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    return Date.UTC(Number(parts.find(p => p.type === 'year')!.value), Number(parts.find(p => p.type === 'month')!.value) - 1, Number(parts.find(p => p.type === 'day')!.value));
}
function localTime(day: number, hour: number) {
    const desired = day + hour * 3600000;
    let candidate = desired;
    for (let i = 0; i < 3; i++) {
        const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(candidate);
        const get = (key: string) => Number(parts.find(p => p.type === key)!.value);
        const displayed = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
        candidate += desired - displayed;
    }
    return candidate;
}
export function parseWindow(text: string, now: number): TimeWindow | null {
    const today = localDate(now);
    let day = today;
    const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    const named = days.findIndex(d => new RegExp(`\\b${d}\\b`).test(text));
    if (iso) {
        day = Date.parse(`${iso[1]}T00:00:00Z`);
        if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== iso[1] || day < today)
            return null;
    }
    else if (/\byesterday\b|\blast (monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekend)\b/.test(text))
        return null;
    else if (/\btomorrow\b/.test(text))
        day += dayMs;
    else if (/\bweekend\b/.test(text)) {
        day += (6 - new Date(today).getUTCDay() + 7) % 7 * dayMs;
    }
    else if (named >= 0) {
        let offset = (named - new Date(today).getUTCDay() + 7) % 7;
        if (/\bnext\b/.test(text) && offset === 0)
            offset = 7;
        day += offset * dayMs;
    }
    const explicit = Boolean(iso || named >= 0 || /\b(today|tomorrow|weekend)\b/.test(text));
    const clock = text.match(/\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b/);
    let startHour = 8, endHour = 20;
    if (/\bmorning\b/.test(text))
        endHour = 12;
    if (/\bafternoon\b/.test(text)) {
        startHour = 12;
        endHour = 17;
    }
    if (/\bevening\b/.test(text)) {
        startHour = 17;
        endHour = 21;
    }
    if (clock) {
        startHour = Number(clock[1]) % 12 + (clock[3] === 'pm' ? 12 : 0);
        endHour = startHour + 2;
    }
    let start = localTime(day, startHour) + (clock ? Number(clock[2] ?? 0) * 60000 : 0);
    let end = localTime(day, endHour) + (clock ? Number(clock[2] ?? 0) * 60000 : 0);
    if (/\bby\b/.test(text) && explicit)
        start = now;
    if (/\bweekend\b/.test(text))
        end += dayMs;
    if (!explicit) {
        start = now;
        end = now + 7 * dayMs;
    }
    if (end <= now)
        return null;
    start = Math.max(start, now);
    return end > start ? { start, end } : null;
}
function clarify(question: string): Parsed { return { intent: 'clarify', quantity: 1, question }; }
export async function parse(raw: string, options: ParseOptions = {}): Promise<Parsed> {
    const now = options.now ?? Date.now();
    const text = raw.trim().toLowerCase().replace(/[.!?]+$/, '');
    if (/^(help|what can you do|what do you do)$/.test(text))
        return { intent: 'help', quantity: 1 };
    const status = text.match(/^(picked up|returned|received)\s+(.+)$/);
    if (status) {
        const item = lookup(status[2]);
        return item ? { intent: 'confirm', action: status[1] as Parsed['action'], item: item.id, quantity: 1 } : clarify('Which item did you pick up, return, or receive?');
    }
    if (['yes', 'no', 'picked up', 'returned', 'received'].includes(text))
        return { intent: 'confirm', action: text as Parsed['action'], quantity: 1 };
    const need = /\b(need|borrow|looking for|building|making)\b/.test(text);
    const offer = /\b(i have|i can lend|i can give|giving away|give away|offering|i own)\b/.test(text);
    const project = Object.keys(projects).find(p => new RegExp(`\\b${p}\\b`).test(text));
    const item = lookup(text);
    const quantityMatch = text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, '').replace(/\b\d{1,2}(?::\d{2})?\s*(am|pm)\b/g, '').match(/(?<![\w])(-?\d+(?:\.\d+)?)\b/);
    const quantity = quantityMatch ? Number(quantityMatch[1]) : 1;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500)
        return clarify('How many do you need or have, between 1 and 500?');
    if (need && offer)
        return clarify('Are you looking for something, or offering it to a neighbor?');
    if (need || offer) {
        if (!item && !project)
            return clarify('Which item do you mean? Try a ladder, drill, or notebooks.');
        const window = parseWindow(text, now);
        if (!window)
            return clarify('What future day or time works for you?');
        return { intent: need ? 'need' : 'offer', item: item?.id, quantity, window, project: need ? project : undefined, mode: /\b(give|gift|keep|giveaway)\b/.test(text) ? 'gift' : item?.kind ?? 'loan' };
    }
    if (options.geminiKey) {
        try {
            const model = options.model ?? process.env.GEMINI_MODEL ?? 'gemini-2.5-flash-lite';
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': options.geminiKey }, signal: AbortSignal.timeout(10000),
                body: JSON.stringify({ contents: [{ parts: [{ text: `Extract a neighborhood need or offer. Catalog IDs: ${catalog.map(i => i.id).join(', ')}. Return unknown if unclear. Do not invent items, dates or quantities. Window is the user's literal future date phrase, or an empty string. Text: ${raw}` }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: { type: 'OBJECT', properties: { intent: { type: 'STRING', enum: ['need', 'offer', 'unknown'] }, item: { type: 'STRING' }, quantity: { type: 'INTEGER' }, window: { type: 'STRING' } }, required: ['intent', 'item', 'quantity', 'window'] } } })
            });
            if (!response.ok)
                return { intent: 'unknown', quantity: 1 };
            const data = await response.json() as {
                candidates?: {
                    content?: {
                        parts?: {
                            text?: string;
                        }[];
                    };
                }[];
            };
            const result = JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}') as Record<string, unknown>;
            if (result.intent !== 'need' && result.intent !== 'offer')
                return { intent: 'unknown', quantity: 1 };
            if (typeof result.item !== 'string' || !catalog.some(i => i.id === result.item))
                return clarify('Which item do you mean? Try a ladder, drill, or notebooks.');
            if (!Number.isInteger(result.quantity) || Number(result.quantity) < 1 || Number(result.quantity) > 500)
                return clarify('How many do you need or have, between 1 and 500?');
            if (typeof result.window !== 'string')
                return clarify('What future day or time works for you?');
            const window = parseWindow(result.window.toLowerCase(), now);
            if (!window)
                return clarify('What future day or time works for you?');
            return { intent: result.intent, item: result.item, quantity: Number(result.quantity), window, mode: catalog.find(i => i.id === result.item)!.kind };
        }
        catch { /* Rules still work when optional AI is unavailable. */ }
    }
    return { intent: 'unknown', quantity: 1 };
}
