# Relay backend

FastAPI service for the Relay hackathon app. The Vite UI stays at the repo root. This API does not change those pages.

Snowflake credentials stay empty until the warehouse is set up and the inventory dataset is uploaded. The API boots without them. Inventory and neighborhood reads return `snowflake: "not_configured"` and an empty list. Confirmed needs, offers, and borrow asks are stored in SQLite until those env vars are filled, then the same routes write and read Snowflake.

Loans, handoffs, projects, and the garden counter stay in SQLite (`backend/relay.db`).

## Run

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Docs: http://127.0.0.1:8000/docs

The UI dev server is http://127.0.0.1:5173. CORS allows that origin.

```bash
npm install
npm run dev
```

## Snowflake

`backend/.env` is local and gitignored. The checked-out configuration contains the account, user, warehouse, database, schema, role and Gemini model; set `SNOWFLAKE_PASSWORD` there after rotating the password shared in chat. Do not put credentials in source control.

Set up a new Snowflake account in this order:

1. In Snowsight, run `snowflake/bootstrap.sql` using an account administrator role. It creates the application role, warehouse, database and schema, then grants the application role to `RAMLOLS2604`.
2. Run `snowflake/setup.sql` to create and seed the `INVENTORY`, `REQUESTS` and `RESIDENTS` tables.
3. Optionally run `snowflake/seed_requests.sql` to load the four demo requests.
4. Put the rotated password in `backend/.env`, then start the API and check `GET /health` for `snowflake: "ok"`.

The app role is not an administrator. The bootstrap script must be run with an account administrator role.

- `SNOWFLAKE_ACCOUNT`
- `SNOWFLAKE_USER`
- `SNOWFLAKE_PASSWORD`
- `SNOWFLAKE_WAREHOUSE`
- `SNOWFLAKE_DATABASE`
- `SNOWFLAKE_SCHEMA`
- `SNOWFLAKE_ROLE`

`GET /health` reports `not_configured`, `ok`, or `error`.

Inventory SQL lives in `app/snowflake_store.py`. Until the upload is visible it expects `INVENTORY` columns: `RESIDENT_ID`, `RESIDENT_NAME`, `X`, `Y`, `CATALOG_ITEM`, `QUANTITY`, `WILLING_TO_LEND`, `CONDITION_NOTE`, `AVAILABLE_WINDOWS`.

Confirmed requests expect a `REQUESTS` table: `ID`, `RESIDENT_ID`, `KIND` (`need`, `offer`, or `borrow`), `RAW_TEXT`, `CATALOG_ITEM`, `QUANTITY`, `AREA`, `WINDOW_START`, `WINDOW_END`, `STATUS`, `CREATED_AT`.

Catalog names the matcher knows: Drill, Saw, Level, Sander, Clamps, Tape measure, Notebooks, Ladder. Aliases such as "cordless drill" map to Drill. A drill's demo price is 6000 cents ($60).

`GEMINI_API_KEY` is optional. With no key, chat uses the catalog and a bookshelf tool list.

## Chat cards

`POST /api/chat` with `{ "resident_id": "avery", "message": "..." }`.

- `tool_list` for a project such as "I'm building a bookshelf this weekend."
- `confirmation` for a need or offer. A later message of `yes` or `no` publishes or drops it.
- `match` when an open need lines up with offers. Partial fills are included.
- `loan_status` when a loan or handoff changes.
- `no_match` when a request stays open or the message is unclear.
- `yes` / `no` also accepts or declines the latest loan request for a lender, or confirms a handoff.

Default resident is Avery Moss, id `avery`, 14 Willow Court.

## Other routes

- `GET /api/my-stuff?resident_id=avery`
- `GET /api/neighborhood?resident_id=avery`
- `GET /api/activity?resident_id=avery`
- `POST /api/loans` then `.../respond`, `.../pickup`, `.../return`
- `POST /api/handoffs/{id}/confirm`, `.../decline`, `.../received`
- `GET /api/shared-demand` and `POST /api/shared-demand/{catalog_item_id}/group-buy`
- `GET /api/garden` returns `{ "count" }` of completed loans and handoffs

A taken loan window returns 409 and `next_free_slot`. Shared demand does not claim that nobody owns an item while inventory is unavailable.

## Tests

```bash
cd backend
python -m pytest
```

Matcher and scheduler tests do not need Snowflake. After the inventory upload, fill in `.env` and hit My Stuff, Neighborhood, and the notebook and drill flows again.
