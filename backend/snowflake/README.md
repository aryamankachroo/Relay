# Snowflake test data

Tables the backend reads and writes, plus a demo cast. Schema is `RELAY.APP`.

## Setup

1. In Snowsight, run `setup.sql` with Run all. It creates `INVENTORY` and `REQUESTS`, loads 22 inventory rows and grants `RELAY_APP` access.
2. Run `seed_requests.sql`. It loads 4 open requests. Run it again to reset requests between tests.
3. Set `backend/.env`:

```
SNOWFLAKE_ACCOUNT=<orgname-accountname>
SNOWFLAKE_USER=<your user>
SNOWFLAKE_PASSWORD=<your password>
SNOWFLAKE_WAREHOUSE=RELAY_WH
SNOWFLAKE_DATABASE=RELAY
SNOWFLAKE_SCHEMA=APP
SNOWFLAKE_ROLE=RELAY_APP
```

4. Start the API, then add the neighbors to SQLite:

```bash
uvicorn app.main:app --reload --port 8000
bash snowflake/create_residents.sh
```

Loans and handoffs look up residents in SQLite. Without this step they return 404 for Jordan, Sam and Riley.

## What to expect

| Call | Result |
| --- | --- |
| `GET /health` | `snowflake: ok` |
| `GET /api/neighborhood?resident_id=avery` | 17 lendable items from Jordan, Sam, Riley, Maya, Chris, Priya, and Elena. No Noor, no Sam's ladder |
| Chat: "I'm building a bookshelf this weekend" | Drill has no neighbors. Level shows Jordan then Priya. Saw shows Jordan, Maya, Sam, and Elena |
| Chat: "I need a drill Saturday", then "yes" | `GET /api/shared-demand` shows 3 households, $180 alone, $60 shared |
| Chat: "I need 20 notebooks", then "yes" | Match of 12 from Jordan and 8 from Sam |

The drill owner (Noor) is 40 blocks away and the distance limit is 25. That is why drill demand becomes a shared need.

Riley's laser level opens a week from setup. A bookshelf project this weekend skips it, so Level shows only Jordan.

## Notes

- `AVAILABLE_WINDOWS` is a JSON list of `[start, end]` pairs in UTC. Setup builds them from the current date, so rerun it on test day.
- `INVENTORY.CATALOG_ITEM` is a free label. The backend matches it to the catalog by alias, so `Bar clamps` becomes `clamps`. `Pressure washer` has no match on purpose.
- `REQUESTS.CATALOG_ITEM` is the catalog id, such as `drill`.
