from app.matcher import LenderItem, NeedPoint, Supply, fill_partial, rank_lenders


def test_notebooks_partial_match_across_two_donors():
    offers = [
        Supply("donor-a", "jordan", 12),
        Supply("donor-b", "sam", 8),
    ]
    filled, remaining = fill_partial(20, offers)
    assert remaining == 0
    assert [(row.offer_id, row.quantity) for row in filled] == [
        ("donor-a", 12),
        ("donor-b", 8),
    ]


def test_nearer_lender_ranks_first():
    need = NeedPoint("avery", "drill", x=0, y=0)
    inventory = [
        LenderItem("far", "sam", "Sam", 5, 0, "drill", 1, True, "", []),
        LenderItem("near", "jordan", "Jordan", 1, 0, "drill", 1, True, "works", []),
        LenderItem("mine", "avery", "Avery", 0, 0, "drill", 1, True, "", []),
        LenderItem("out", "riley", "Riley", 30, 0, "drill", 1, True, "", []),
    ]
    ranked = rank_lenders(need, inventory, distance_limit=10)
    assert [row["resident_id"] for row in ranked] == ["jordan", "sam"]
    assert ranked[0]["distance"] == 1


def _drill(windows, resident_id="jordan"):
    return LenderItem("inv", resident_id, "Jordan", 1, 0, "drill", 1, True, "", windows)


def _weekend_need(tz=True):
    from datetime import datetime, timezone

    zone = timezone.utc if tz else None
    return NeedPoint(
        "avery",
        "drill",
        x=0,
        y=0,
        window_start=datetime(2026, 10, 10, 9, 0, tzinfo=zone),
        window_end=datetime(2026, 10, 11, 18, 0, tzinfo=zone),
    )


def test_string_windows_from_snowflake_overlap():
    item = _drill([["2026-10-09T00:00:00+00:00", "2026-10-31T23:59:59+00:00"]])
    assert [row["resident_id"] for row in rank_lenders(_weekend_need(), [item], 10)] == ["jordan"]


def test_naive_need_times_compare_with_string_windows():
    item = _drill([["2026-10-09T00:00:00+00:00", "2026-10-31T23:59:59+00:00"]])
    assert len(rank_lenders(_weekend_need(tz=False), [item], 10)) == 1


def test_window_objects_and_z_suffix():
    item = _drill([{"start": "2026-10-09T00:00:00Z", "end": "2026-10-31T23:59:59Z"}])
    assert len(rank_lenders(_weekend_need(), [item], 10)) == 1


def test_window_that_opens_later_is_skipped():
    item = _drill([["2026-10-18T00:00:00+00:00", "2026-11-15T23:59:59+00:00"]])
    assert rank_lenders(_weekend_need(), [item], 10) == []


def test_bad_windows_are_skipped_not_fatal():
    item = _drill(
        [
            "nonsense",
            ["", ""],
            ["not a date", "2026-10-31T00:00:00+00:00"],
            ["2026-10-09T00:00:00+00:00", "2026-10-31T23:59:59+00:00"],
        ]
    )
    assert len(rank_lenders(_weekend_need(), [item], 10)) == 1
    only_bad = _drill(["nonsense", ["x", "y"]])
    assert rank_lenders(_weekend_need(), [only_bad], 10) == []


def test_lender_without_windows_always_fits():
    assert len(rank_lenders(_weekend_need(), [_drill([])], 10)) == 1
