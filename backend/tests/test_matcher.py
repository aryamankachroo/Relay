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
