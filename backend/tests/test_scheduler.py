from types import SimpleNamespace

from app.scheduler import first_free_slot, schedule_shared


def _request(request_id, start, end):
    return SimpleNamespace(id=request_id, win_start=start, win_end=end)


def test_three_drill_requests_fit_one_calendar():
    requests = [
        _request("sat", 0, 24),
        _request("sun", 24, 48),
        _request("fri", 100, 124),
    ]
    plan, blocked = schedule_shared(requests, duration=4, buffer=0)
    assert blocked is None
    assert plan == {
        "sat": (0, 4),
        "sun": (24, 4 + 24),
        "fri": (100, 104),
    }


def test_same_slot_gets_the_next_free_one():
    requests = [
        _request("a", 0, 10),
        _request("b", 0, 10),
    ]
    plan, blocked = schedule_shared(requests, duration=4, buffer=0)
    assert blocked is None
    assert plan["a"] == (0, 4)
    assert plan["b"] == (4, 8)


def test_first_free_slot_jumps_past_a_conflict():
    slot = first_free_slot([(0, 2)], win_start=0, win_end=10, duration=2, buffer=0)
    assert slot == (2, 4)
