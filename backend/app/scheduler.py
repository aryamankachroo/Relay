def overlaps(a0, a1, b0, b1) -> bool:
    return a0 < b1 and b0 < a1


def first_free_slot(bookings, win_start, win_end, duration, buffer):
    """Earliest slot inside the window that misses every booking, plus buffer."""
    start = win_start
    for b0, b1 in sorted(bookings):
        if overlaps(start, start + duration, b0 - buffer, b1 + buffer):
            start = b1 + buffer
    if start + duration <= win_end:
        return (start, start + duration)
    return None


def schedule_shared(requests, duration, buffer):
    """Place requests on one calendar, earliest deadline first.

    Returns (plan, None) or (None, request_that_does_not_fit).
    """
    booked = []
    plan = {}
    for request in sorted(requests, key=lambda item: item.win_end):
        slot = first_free_slot(
            booked,
            request.win_start,
            request.win_end,
            duration,
            buffer,
        )
        if slot is None:
            return None, request
        booked.append(slot)
        plan[request.id] = slot
    return plan, None
