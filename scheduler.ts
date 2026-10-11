import type { TimeWindow } from './types.ts';
export function overlaps(a: TimeWindow, b: TimeWindow, buffer = 0): boolean {
    return a.start < b.end + buffer && b.start < a.end + buffer;
}
export function first_free_slot(bookings: TimeWindow[], winStart: number, winEnd: number, duration: number, buffer: number): TimeWindow | null {
    if (![winStart, winEnd, duration, buffer].every(Number.isFinite) || duration <= 0 || buffer < 0)
        return null;
    let start = winStart;
    for (const booking of [...bookings].sort((a, b) => a.start - b.start)) {
        if (booking.end + buffer <= start)
            continue;
        if (start + duration + buffer <= booking.start)
            break;
        start = booking.end + buffer;
    }
    return start + duration <= winEnd ? { start, end: start + duration } : null;
}
export function schedule_shared<T extends {
    id: string;
    window: TimeWindow;
}>(requests: T[], duration: number, buffer: number): {
    slots: {
        id: string;
        window: TimeWindow;
    }[];
    unplaced?: T;
} {
    const slots: {
        id: string;
        window: TimeWindow;
    }[] = [];
    for (const request of [...requests].sort((a, b) => a.window.end - b.window.end || a.window.start - b.window.start || a.id.localeCompare(b.id))) {
        const window = first_free_slot(slots.map(s => s.window), request.window.start, request.window.end, duration, buffer);
        if (!window)
            return { slots, unplaced: request };
        slots.push({ id: request.id, window });
    }
    return { slots };
}
