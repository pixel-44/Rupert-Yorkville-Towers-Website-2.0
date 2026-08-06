# Rupert Yorkville Towers — Resident Service Board

A working bulletin board for residents of Rupert Yorkville Towers. Neighbors post what they
need done — dog walking, babysitting, cleaning, a grocery run — or what they're offering, and
other residents accept the post and sort out the details in a private message thread.

Anyone can browse the board. Posting, accepting and messaging require a resident account with a
real mobile number and a personal email address.

Runs on **Netlify**: static assets from the CDN, the Express app as a single serverless
function, and Postgres for storage.

## Put it online

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/pixel-44/Rupert-Yorkville-Towers-Website-2.0)

That button creates the site, connects this repository, and asks for the two environment
variables below. Add the Netlify DB extension when prompted (or paste your own Postgres URL)
and the first deploy comes back with a live `*.netlify.app` address. Details and the manual
route are under [Deploying to Netlify](#deploying-to-netlify).

## What's in it

- **Accounts** — name, personal email, mobile number, apartment, password (bcrypt). Sessions
  live in the database, so they survive across serverless instances. Guests browse freely;
  every write is gated.
- **Posts** — "needs help" or "offering", a category, description, apartment, a price range with
  a unit (total / per hour / per visit / …), and one-time or recurring with a schedule note.
  Owners can edit, cancel, reopen.
- **Accepting** — one resident accepts a post; the claim is a conditional `UPDATE` so two people
  can't take the same job even from different function instances. Accepting flips the post to
  `matched` and opens a message thread with a first message already in it. The acceptor can
  withdraw; either side can mark it completed.
- **Direct messaging** — private threads scoped to a post and a pair of residents, with unread
  counts in the header and 5-second polling so replies appear without a refresh.
- **Contact privacy** — email and phone are only revealed to the two residents on a matched post.
- **User Help panel** — on the footer of every page: kieran4v@gmail.com and 646-617-0040.

## Deploying to Netlify

**1. Create the database.** The app needs Postgres — Netlify functions have no persistent disk,
so nothing can be stored in a file. Any Postgres works; two easy options:

- **Netlify DB** (Neon under the hood, free tier): in your site's dashboard, add the Netlify DB
  extension, or run `netlify db init` from the repo. It sets `NETLIFY_DATABASE_URL` for you.
- **Neon / Supabase / anything else**: create a database and copy its connection string.

**2. Connect the repo.** In Netlify: *Add new site → Import an existing project → GitHub →*
this repository. Build settings come from `netlify.toml` — publish directory `public`,
functions directory `netlify/functions`, no build command needed.

**3. Set environment variables** under *Site configuration → Environment variables*:

| Variable       | Value                        | Notes                                                     |
| -------------- | ---------------------------- | --------------------------------------------------------- |
| `DATABASE_URL` | your Postgres connection URL | Skip if you used Netlify DB — `NETLIFY_DATABASE_URL` works too. |
| `NODE_ENV`     | `production`                 | Makes session cookies https-only and enables HSTS.        |

If your provider gives both a direct and a **pooled** connection string, use the pooled one —
serverless functions open and drop connections constantly.

**4. Deploy.** The schema is created automatically on the first request (guarded by a Postgres
advisory lock, so simultaneous cold starts can't collide). To set it up ahead of time instead,
run `DATABASE_URL=… npm run migrate` locally.

**5. Add your domain.** *Domain management → Add a domain*. Netlify issues the HTTPS
certificate. Until then the site lives at `your-site-name.netlify.app`.

Nothing else needs a server. Backups are your database provider's job — Neon and Supabase both
do point-in-time restore on their paid tiers, and free tiers keep short-window backups.

## Running it locally

```bash
npm install
export DATABASE_URL="postgres://localhost:5432/ryt"   # any Postgres you can reach
npm run migrate                                       # optional; the app also self-migrates
npm start                                             # http://localhost:3000
```

`npm start` runs the same Express app directly, which is the quickest way to work on it.
`netlify dev` also works and proxies through Netlify's local edge.

| Variable       | Default | Purpose                                                      |
| -------------- | ------- | ------------------------------------------------------------ |
| `DATABASE_URL` | —       | Postgres connection string. Required. `NETLIFY_DATABASE_URL` is used as a fallback. |
| `PORT`         | `3000`  | Local listener port only; unused on Netlify.                 |
| `NODE_ENV`     | unset   | `production` turns on secure cookies and HSTS.               |
| `PG_POOL_MAX`  | `3`     | Connections per function instance.                           |
| `PG_SSL_NO_VERIFY` | unset | Set to `1` only for a provider with a self-signed certificate. |

## Tests

Both suites need a throwaway Postgres database — **they drop every table before running.**

```bash
export TEST_DATABASE_URL="postgres://localhost:5432/ryt_test"
npm test
```

- `test/e2e.sh` boots a real server and drives it with curl: signup validation, guest gating,
  the accept race, contact-detail privacy, thread access control, unread counts, HTML escaping,
  status transitions, login/logout, password rotation and cross-site POST rejection.
- `test/function.js` invokes the Netlify function handler with the Lambda-style events Netlify
  actually sends, checking that templates resolve inside the bundle, cookies survive both header
  shapes, and rewritten paths keep their query strings.

## Layout

```
netlify.toml               Publish dir, functions dir, catch-all rewrite
netlify/functions/server.js  Netlify entry point (wraps the Express app)
server.js                  Local entry point (listens on a port)
src/app.js                 Express app: security headers, shared template locals, routes
src/db.js                  Postgres pool, query helpers, schema bootstrap
src/schema.sql             Tables and indexes (idempotent)
src/auth.js                Password hashing, sessions, member gate, login throttle
src/lib.js                 Categories, phone/price/date formatting, async route wrapper
src/routes/accounts.js     Signup, login, account settings
src/routes/posts.js        Board, post CRUD, accept / complete / reopen
src/routes/conversations.js  Threads, messages, polling endpoint
scripts/migrate.js         Apply schema; --reset drops everything first
views/                     EJS templates
public/                    CDN-served stylesheet, client script, favicon
test/                      End-to-end and function-handler suites
```
