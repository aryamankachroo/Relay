# Relay over iMessage (Photon)

Neighbors can text Relay instead of opening the website. This folder runs a small bridge on a Mac:
an incoming iMessage goes to the Relay backend's `/api/chat`, and the reply is texted back.

It uses [Photon](https://photon.codes)'s `spectrum-ts` with the local iMessage provider
(`@spectrum-ts/imessage-local`), so it needs no Photon account or keys. It replies from the
iMessage account signed in on the Mac, and every texter acts as the demo resident (Avery),
the same as the website.

## One-time setup on the Mac

1. Open the **Messages** app and check it is signed in (Messages > Settings > iMessage).
   Note the phone number or email shown there. That is the address people text.
2. Open **System Settings > Privacy & Security > Full Disk Access** and turn it on for the app
   you will run the bridge from (Terminal, Cursor, or both). Quit and reopen that app.
   This lets the bridge read `~/Library/Messages/chat.db`, where the Mac stores texts.
3. In this folder:

   ```bash
   cp .env.example .env
   npm install
   ```

   If npm says install scripts were skipped, run
   `npm install-scripts approve better-sqlite3 protobufjs && npm rebuild`.

## Run it

1. Start the Relay backend (see `backend/README.md`) so `http://127.0.0.1:8000/health` answers.
2. In this folder: `npm start`. You should see
   `Relay iMessage bridge is listening.`
3. From a **different** phone or Apple ID, text the Mac's iMessage address, for example
   `im fixing a flat tyre`.
4. The first reply makes macOS ask whether the app may control Messages. Click **OK**.
5. A text comes back in about 5 to 10 seconds with the tools for the project.
6. Try a need: text `I need 20 notebooks Saturday`, then `yes`. It also shows up on the
   website's Activity page.

The bridge terminal prints each text it gets (`<-`) and each reply it sends (`->`).

## Settings (`.env`)

| Name | Default | What it does |
| --- | --- | --- |
| `RELAY_API_URL` | `http://127.0.0.1:8000` | Backend the texts are sent to |
| `RELAY_SITE_URL` | `http://127.0.0.1:5173` | Link added to replies; leave empty to skip |

## Tests

`npm test` checks how each kind of Relay reply is worded as a text.
