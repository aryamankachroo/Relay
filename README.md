# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://npmx.dev/package/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://npmx.dev/package/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

## Clerk authentication

Relay now uses React Router framework mode. `app/root.tsx` configures Clerk's
server middleware, authentication loader, and provider. The login and sign-up
routes use Clerk components inside the existing neighborhood UI.

Set `VITE_CLERK_PUBLISHABLE_KEY` and the server-only `CLERK_SECRET_KEY` in
`.env.local` for development. Never commit this file or prefix the secret key
with `VITE_`. The keys must belong to the same Clerk instance.

Run `npm run dev` to preview, `npm run build` to typecheck and build, and
`npx --yes clerk@latest doctor` to check the Clerk connection. The build is
written to `build/client` and `build/server`; it now requires a Node server
instead of static Vite hosting. To run it with local development keys:

```sh
node --env-file=.env.local node_modules/@react-router/serve/bin.js ./build/server/index.js
```

In deployment, provide both Clerk keys through the server environment and run
`npm start`. Successful sign-in opens the neighborhood app, with account
controls in the sidebar and mobile header. Signed-out visitors see the animated
login flow. Neighborhood features remain a frontend demo.


## Photon Relay agent

The standalone iMessage agent runs on the same project with `npm run bridge`.
It uses the existing Spectrum connection and a separate persisted demo community.
Inventory questions such as `Who has a ladder?` are answered through the FastAPI
backend's Snowflake-backed inventory endpoint. Need/offer matching and YES/NO
transactions in the phone bridge still use its local demo community; they are
not yet synchronized to Snowflake or the website's resident accounts.

Copy the server variables documented in `.env.example` into the gitignored
`.env`: `PROJECT_ID` and `PROJECT_SECRET` are required. Do not expose the secret
in any `VITE_` variable. No extra packages are required beyond the existing
Spectrum and tsx dependencies.

For a two-phone demo, set `DEMO_USER_PHONE` to the first person's sender handle
(usually `+` and the country code) and `DEMO_SECOND_PHONE` to the lender's handle.
Set `DEMO_THIRD_PHONE` to a third person for shared buying. These seed Sam, Mia,
and Dev in the fictional neighborhood. Set these before the first bridge run;
the seed is saved only once. The `[relay.inbound]` log shows the exact sender
handle Spectrum supplies, which may be an email instead of a phone number.
Never use a space/conversation id as a resident id.

Optional variables: `RELAY_STORE_PATH` (default `.relay/state.json`),
`RELAY_TIME_ZONE` (default `America/New_York`), `RELAY_ZONE_LIMIT` (default `1`),
`RELAY_API_URL` (default `http://127.0.0.1:8000`), `GEMINI_API_KEY` and
`GEMINI_MODEL` (default `gemini-2.5-flash-lite`). Start the backend with its
Snowflake configuration before asking inventory questions by phone. If the API
or Snowflake is unavailable, the bridge says it cannot verify inventory rather
than answering from its demo seed. Gemini is only a parsing fallback; all
results are checked against catalog IDs, integer
quantities from 1 through 500, and future windows. Matching, scheduling and status
changes use ordinary functions.

Run one bridge process with a given store at a time; a local lock rejects a second
process. State is written atomically with private file permissions, including
requests, confirmations, message IDs, known spaces and the outbound queue.
To reseed without losing the old demo, choose a new `RELAY_STORE_PATH`.

Text HELP for examples. The supported flows are needs, lending/gift offers,
YES/NO confirmation, PICKED UP, RETURNED and RECEIVED. If several different items
are ready, qualify the action, for example `RETURNED ladder`. Bookshelf requests
expand into tools you do not already own. Nearby zone distances are fictional.
The seed has 20 listings including 12 and 8 notebooks from separate donors and
12 moving boxes; no resident owns a sander. The only drill is outside Sam/Mia/Dev's
nearby radius, so separate drill requests demonstrate shared demand. Prices are
explicit demo prices; group buys do not charge money or purchase anything.

Proactive messages use `imessage(app).space.get(id)` and `space.send(text)` for
remembered contacts. New contacts are not cold-messaged: their notifications
remain queued until they text once. `demo:*` contacts are logged to the console
and queued, which simulates the other residents without sending real messages.
Failed sends are retried at restart or on the next inbound text. Duplicate inbound
message IDs are ignored across restarts. Outbound delivery is at least once: an
abrupt crash after Photon accepts a send but before its local acknowledgement
is saved can still repeat that outgoing message.

Use these checks without sending real texts:

```sh
npm run test:relay
npm run demo:relay
npm run lint
npm run build
```

`demo:relay` runs three isolated conversations in memory: ladder lending,
a new notebook offer that meets an open need, and three neighbors sharing a drill
calendar. The notebook scenario intentionally removes the preseeded notebook
gifts so the later offer can match an open need. `chat(userId, text)` is exported
from `chat.ts` for a future server-side web integration; the bridge additionally
passes the inbound message ID for durable deduplication and outbound queuing.

The optional Gemini HTTP contract is covered with mocked responses. Live Gemini,
new two/three-person iMessage delivery and restoration of a remembered remote
space after restart still need a manual test. The earlier fixed-reply Photon
connection was tested separately.
