import { overlaps } from './scheduler.ts';
import type { Item, Request, Resident, TimeWindow } from './types.ts';
export type Allocation = {
    itemId: string;
    owner: string;
    quantity: number;
    window: TimeWindow;
    distance: number;
};
export function match(request: Request, items: Item[], residents: Resident[], zoneLimit = 1): {
    allocations: Allocation[];
    covered: number;
    remaining: number;
} {
    const candidates = items.flatMap(item => {
        const owner = residents.find(r => r.id === item.owner);
        if (!owner || item.owner === request.userId || request.declinedOwners.includes(item.owner) || item.catalogId !== request.catalogId || item.kind !== request.kind || !item.willingToLend || item.quantity < 1 || Math.abs(owner.zone - request.zone) > zoneLimit)
            return [];
        const windows = item.windows.filter(w => overlaps(w, request.window)).map(w => ({ start: Math.max(w.start, request.window.start), end: Math.min(w.end, request.window.end) }));
        const window = windows.sort((a, b) => (b.end - b.start) - (a.end - a.start))[0];
        if (!window)
            return [];
        return [{ item, window, distance: Math.abs(owner.zone - request.zone) }];
    }).sort((a, b) => a.distance - b.distance || (b.window.end - b.window.start) - (a.window.end - a.window.start) || a.item.id.localeCompare(b.item.id));
    let remaining = request.quantity;
    const allocations: Allocation[] = [];
    for (const { item, window, distance } of candidates) {
        if (!remaining)
            break;
        const quantity = Math.min(item.quantity, remaining);
        allocations.push({ itemId: item.id, owner: item.owner, quantity, window, distance });
        remaining -= quantity;
    }
    return { allocations, covered: request.quantity - remaining, remaining };
}
