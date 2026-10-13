# Relay

Relay helps neighbors lend what they already own. You say what you are making or what you need. Gemini, then Backboard, then a catalog check turns that into a real item. The app matches people in the same city and keeps the booking on a calendar so one item is not promised twice.

## Run

Frontend, from the repo root:

```sh
npm install
npm run dev
```

The UI is at http://127.0.0.1:5173.

Backend:

```sh
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

API docs: http://127.0.0.1:8000/docs

iMessage bridge, from `imessage/`: copy `.env.example` to `.env`, then `npm install` and `npm start`.

## Environment files

Each example file says where the real values go. Do not commit those files.

| Example | Copy to | What it holds |
| --- | --- | --- |
| `.env.example` | `.env.local` | Clerk and Mapbox keys for the UI |
| `backend/.env.example` | `backend/.env` | Clerk secret key, Snowflake, Gemini, and Backboard |
| `imessage/.env.example` | `imessage/.env` | Backend and site URLs for the text bridge |

`.env.local` and `backend/.env` are gitignored. Example files must stay placeholders.

The Clerk **secret key** goes in `backend/.env` as `CLERK_SECRET_KEY`. The publishable key stays in `.env.local`. You do not paste a session token. After sign-in the app sends it as `Authorization: Bearer` on each API call, and the API uses that account as the resident. Set `CLERK_ISSUER` in `backend/.env` when you want to name the Frontend API URL yourself. When it is blank, the API derives that URL from the publishable key.

## First visit

After Clerk sign-in, Relay asks for your city, a short note about you, and one thing you can lend. Your account is your own resident. It is not assigned to a demo neighbor. Listings you see are limited to that city, inside a 400-block radius.

The catalog is general on purpose: chairs, bikes, tents, tools, and supplies, not one-off product names.

## Checks

```sh
cd backend && source .venv/bin/activate && python -m pytest
npm run lint
npm run test:unit
npm run build
npm start
```

`npm start` serves `build/client`. A visit to `/activity` or `/my-stuff` returns the app shell, so a refresh on those routes keeps working.

Browser coverage needs Clerk development keys. Put `VITE_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` in `.env.local`, or export `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`. Then run `npm run test:e2e`. The test creates two temporary Clerk users, walks onboarding, a shelf edit, a loan, and a partial handoff, then deletes those users. If setup fails after a user is created, that user is deleted too. GitHub Actions runs the same check when repository secrets `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` are set. Without them, that job skips instead of failing.

Chat still answers “I’m building a bookshelf this weekend” and “I need 20 notebooks Saturday morning” when the model keys are empty, using the catalog fallback.
