import type { ExchangeStatus, Kind } from './types.ts';
export function transition(kind: Kind, current: ExchangeStatus, next: ExchangeStatus): ExchangeStatus {
    const allowed: Partial<Record<ExchangeStatus, ExchangeStatus[]>> = kind === 'loan'
        ? { Requested: ['Confirmed', 'Declined'], Confirmed: ['Picked up'], 'Picked up': ['Returned'] }
        : { Requested: ['Confirmed', 'Declined'], Confirmed: ['Received'] };
    if (!allowed[current]?.includes(next))
        throw new Error(`Cannot move ${current} to ${next}`);
    return next;
}
export function active(status: ExchangeStatus) { return !['Returned', 'Received', 'Declined'].includes(status); }
