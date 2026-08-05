# Rupert Yorkville Towers — Resident Service Board

A working bulletin board for residents of Rupert Yorkville Towers. Neighbors post what they
need done — dog walking, babysitting, cleaning, a grocery run — or what they're offering, and
other residents accept the post and sort out the details in a private message thread.

Anyone can browse the board. Posting, accepting and messaging require a resident account with a
real mobile number and a personal email address.

## What's in it

- **Accounts** — name, personal email, mobile number, apartment, password (bcrypt), 30-day
  server-side sessions in a `sessions` table. Guests browse freely; every write is gated.
- **Posts** — "needs help" or "offering", a category, description, apartment, a price range with
  a unit (total / per hour / per visit / …), and one-time or recurring with a schedule note.
  Owners can edit, cancel, reopen.
- **Accepting** — one resident accepts a post; the claim is a conditional `UPDATE` so two people
  can't take the same job. Accepting flips the post to `matched` and opens a message thread with
  a first message already in it. The acceptor can withdraw; either side can mark it completed.
- **Direct messaging** — private threads scoped to a post and a pair of residents, with unread
  counts in the header and 5-second polling so replies appear without a refresh.
- **Contact privacy** — email and phone are only revealed to the two residents on a matched post.
- **User Help panel** — on the footer of every page: kieran4v@gmail.com and 646-617-0040.

## Running it

```bash
npm install
npm start           # http://localhost:3000
```

Environment variables:

| Variable   | Default        | Purpose                                          |
| ---------- | -------------- | ------------------------------------------------ |
| `PORT`     | `3000`         | Port to listen on.                               |
| `DATA_DIR` | `./data`       | Where `rupert.db` (SQLite) lives.                |
| `NODE_ENV` | unset          | Set to `production` to send cookies secure-only. |

The database is created and migrated automatically on first boot — there is no separate setup
step.

## Tests

`npm test` runs an end-to-end pass against a live server on port 3111 with a throwaway database:
signup validation, guest gating, the accept race, contact-detail privacy, thread access control,
unread counts, HTML escaping, status transitions, login/logout and password rotation.

```bash
npm test
```

## Deploying somewhere permanent

The app is a single Node process with a SQLite file, so it runs anywhere that gives you a disk.

**Docker** (any VPS, Fly.io, Render, Railway):

```bash
docker build -t ryt-board .
docker run -d --restart=always -p 80:3000 \
  -e NODE_ENV=production -v /srv/ryt-data:/data -e DATA_DIR=/data ryt-board
```

**Render** — `render.yaml` is included; it provisions a persistent disk mounted at `/data` so the
database survives deploys. Point a domain at the service and run it behind HTTPS.

Whatever the host, two things matter: mount a **persistent volume** for `DATA_DIR` (otherwise
accounts vanish on redeploy), and terminate **HTTPS** in front of the app so session cookies and
passwords aren't sent in the clear. Back up `rupert.db` — copying the file while the app runs is
safe enough with WAL mode, or use `sqlite3 rupert.db ".backup out.db"`.

## Layout

```
server.js              Express app, security headers, shared template locals
src/db.js              SQLite schema + connection
src/auth.js            Password hashing, sessions, the member gate
src/lib.js             Categories, phone/price/date formatting
src/routes/accounts.js Signup, login, account settings
src/routes/posts.js    Board, post CRUD, accept / complete / reopen
src/routes/conversations.js  Threads, messages, polling endpoint
views/                 EJS templates
public/                Stylesheet and the thread's client script
test/e2e.sh            End-to-end test pass
```
