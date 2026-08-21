# 🚢 Deployment

> The API also serves the built React bundle, so **the whole product deploys as
> a single service** — one URL, no CORS, one cold start.

**Current hosted application:**
[https://swiftroute-am6m.onrender.com](https://swiftroute-am6m.onrender.com) ·
[health check](https://swiftroute-am6m.onrender.com/api/health)

---

## Contents

1. [How the build works](#how-the-build-works)
2. [Render — recommended](#render--recommended)
3. [Docker](#docker)
4. [Railway](#railway)
5. [Fly.io](#flyio)
6. [Split deployment (Vercel + Render)](#split-deployment-vercel--render)
7. [Environment variables](#environment-variables)
8. [Wiring real notifications](#wiring-real-notifications)
9. [Production checklist](#production-checklist)
10. [Troubleshooting](#troubleshooting)

---

## How the build works

```mermaid
flowchart TD
    A["npm ci --include=dev"] --> B["npm run build"]
    B --> C["server: prisma generate → tsc<br/>→ server/dist"]
    B --> D["web: tsc --noEmit → vite build<br/>→ server/public"]
    C & D --> E["npm start<br/>node server/dist/bootstrap.js"]

    E --> F["1 · db push<br/><i>idempotent — a no-op once the tables exist</i>"]
    F --> G["2 · seed<br/><i>only if the database is empty</i>"]
    G --> H["3 · listen on PORT"]

    H --> I["GET /api/*  → REST"]
    H --> J["GET /*      → index.html"]
    H --> K["GET /assets → immutable cache"]

    style E fill:#ede9fe,stroke:#7c3aed,color:#4c1d95
    style H fill:#dcfce7,stroke:#16a34a,color:#14532d
```

[`bootstrap.ts`](../server/src/bootstrap.ts) exists because free-tier hosts give
you a single start command and no release phase. The sequence is safe to repeat
on every restart, and `BOOTSTRAP_DB=false` disables it once you manage
migrations yourself.

---

## Render — recommended

Free tier, managed PostgreSQL, and the repo ships a blueprint.

### One-click

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Shanmuk4622/Unthinkable-LastMile-Delivery-Track-assignment)

1. Push this repo to GitHub.
2. Render dashboard → **New** → **Blueprint** → select the repo.
3. Render reads [`render.yaml`](../render.yaml) and provisions:
   - a **PostgreSQL** instance (`swiftroute-db`),
   - a **web service** with `DATABASE_URL` already wired,
   - generated values for `JWT_SECRET` and `JWT_REFRESH_SECRET`.
4. It runs `npm ci --include=dev && npm run build`, then `npm start`. The
   explicit `--include=dev` is required because Render builds with
   `NODE_ENV=production`, while TypeScript, Vite, Prisma CLI and the Node type
   definitions are build-time development dependencies.
5. On first boot the app applies the schema and seeds the demo data.

### Then set the public URL variables

Once the service has a URL, set these so the tracking links inside notification
e-mails resolve:

```
API_PUBLIC_URL = https://your-service-name.onrender.com
WEB_PUBLIC_URL = https://your-service-name.onrender.com
```

Replace `your-service-name` with the exact URL shown on the web service page.
Both values point at the same host because the API serves the React build.

For the checked-in hosted demo, both values are:

```text
https://swiftroute-am6m.onrender.com
```

### And change the seed credentials

`render.yaml` marks `SEED_ADMIN_PASSWORD` and `SEED_DEMO_PASSWORD` as
`sync: false`, so Render prompts you. **Set them before sharing the URL.**

### Manual setup, if you prefer

| Field | Value |
|---|---|
| Environment | Node |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm start` |
| Health check path | `/api/health` |

---

## Docker

### Compose — app + PostgreSQL

```bash
docker compose up --build
# → http://localhost:4000
```

The app waits for the database's healthcheck, applies the schema and seeds on
first boot.

### Image only

```bash
docker build -t swiftroute .

# SQLite on a persistent volume
docker run -p 4000:4000 \
  -e DATABASE_URL="file:/data/dev.db" \
  -v swiftroute-data:/data \
  swiftroute

# or an external PostgreSQL
docker run -p 4000:4000 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/swiftroute" \
  -e JWT_SECRET="$(openssl rand -hex 48)" \
  -e JWT_REFRESH_SECRET="$(openssl rand -hex 48)" \
  swiftroute
```

The [`Dockerfile`](../Dockerfile) is multi-stage, runs as a **non-root** user,
uses `tini` so `SIGTERM` reaches the graceful shutdown in
[`server.ts`](../server/src/server.ts), and carries a real `HEALTHCHECK`.

---

## Railway

1. **New Project → Deploy from GitHub repo.**
2. Add a **PostgreSQL** plugin — Railway injects `DATABASE_URL` automatically.
3. Set the build and start commands:
   ```
   Build:  npm ci --include=dev && npm run build
   Start:  npm start
   ```
4. Add `JWT_SECRET` and `JWT_REFRESH_SECRET`.
5. Generate a domain, then set `API_PUBLIC_URL` and `WEB_PUBLIC_URL` to it.

Railway sets `PORT` itself; the app reads it.

---

## Fly.io

```bash
fly launch --no-deploy          # generates fly.toml; keep the Dockerfile
fly postgres create             # then: fly postgres attach <name>
fly secrets set \
  JWT_SECRET="$(openssl rand -hex 48)" \
  JWT_REFRESH_SECRET="$(openssl rand -hex 48)"
fly deploy
```

In `fly.toml`, set `internal_port = 4000` and point the HTTP check at
`/api/health`.

---

## Split deployment (Vercel + Render)

The single-service build is simpler and recommended. If you specifically want
the client on Vercel's CDN:

**API on Render** — as above, plus:

```
CORS_ORIGINS = https://your-app.vercel.app
WEB_PUBLIC_URL = https://your-app.vercel.app
```

> The CORS policy already allows any `*.vercel.app` preview deployment, so
> branch previews work without further configuration.

**Client on Vercel:**

| Field | Value |
|---|---|
| Root directory | `web` |
| Build command | `npm run build` |
| Output directory | `../server/public` *(or change `outDir` to `dist`)* |
| Env var | `VITE_API_BASE_URL = https://your-api.onrender.com/api` |

Add a rewrite so client-side routes resolve:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

---

## Environment variables

Every variable has a safe default; the app boots with an empty `.env`. Full
documentation is in [`.env.example`](../.env.example).

### Must set in production

| Variable | Why |
|---|---|
| `NODE_ENV=production` | Enables JSON logging, hides stack traces from error responses |
| `DATABASE_URL` | PostgreSQL. The Prisma provider switches itself. |
| `JWT_SECRET` | ⚠️ `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_REFRESH_SECRET` | ⚠️ A **different** long random string |
| `API_PUBLIC_URL` · `WEB_PUBLIC_URL` | Tracking links inside notification e-mails |
| `SEED_ADMIN_PASSWORD` · `SEED_DEMO_PASSWORD` | ⚠️ The defaults are public in this repo |

### Worth reviewing

| Variable | Default | Notes |
|---|---|---|
| `BOOTSTRAP_DB` | `true` | Applies the schema + seeds on boot. Set `false` once you use migrations. |
| `SEED_DEMO_ORDERS` | `true` | `false` seeds only configuration and accounts |
| `CORS_ORIGINS` | localhost | Only needed for a split deployment |
| `RATE_LIMIT_MAX` | `600` / 15 min | Per IP |
| `ASSIGN_*` | see [AUTO_ASSIGNMENT.md](AUTO_ASSIGNMENT.md#tuning-the-weights) | Dispatch tuning |

---

## Wiring real notifications

Both default to `console`, which persists and renders every message in the
in-app outbox without sending anything. To go live:

### E-mail — Brevo (300/day free)

```env
NOTIFY_EMAIL_PROVIDER=smtp
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=2525
SMTP_SECURE=false
SMTP_USER=your-login@smtp-brevo.com
SMTP_PASS=your-smtp-key
MAIL_FROM_NAME=SwiftRoute
MAIL_FROM_ADDRESS=no-reply@yourdomain.dev
```

Render free web services block outbound ports `25`, `465`, and `587`, so use
Brevo's supported `2525` fallback here. This restriction is documented in
[Render's free-tier limits](https://render.com/docs/free), and Brevo documents
`2525` as the alternative when `587` is blocked in
[its SMTP-port guide](https://help.brevo.com/hc/en-us/articles/10905415650322-Which-SMTP-port-should-I-use-Port-587-465-or-2525).

<details>
<summary>Other free options</summary>

| Provider | Host | Port | Notes |
|---|---|---:|---|
| **Mailtrap** (sandbox) | `sandbox.smtp.mailtrap.io` | 2525 | Captures everything — ideal for a Render demo |
| **Gmail** | `smtp.gmail.com` | 587 | Not reachable from Render free; requires an App Password elsewhere |
| **Resend** | `smtp.resend.com` | 587 | Not reachable from Render free; use its HTTPS API or another host |

</details>

Verify without sending: `GET /api/notifications/transports` runs a real SMTP
handshake and reports the result. The admin **Notifications** screen shows it.

### SMS — Twilio trial

```env
NOTIFY_SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxx
TWILIO_FROM_NUMBER=+15005550006
```

> Twilio trial accounts can only message **verified** numbers. Incomplete
> credentials fall back to `console` with a warning rather than throwing.

---

## Production checklist

- [ ] `NODE_ENV=production`
- [ ] `JWT_SECRET` and `JWT_REFRESH_SECRET` are long, random and **different**
- [ ] `SEED_ADMIN_PASSWORD` / `SEED_DEMO_PASSWORD` changed from the repo defaults
- [ ] `DATABASE_URL` points at PostgreSQL, not SQLite
- [ ] `API_PUBLIC_URL` and `WEB_PUBLIC_URL` set to the live URL
- [ ] `/api/health` returns `200` with `"database": "up"`
- [ ] Signed in as admin and confirmed the seeded zones and rate cards exist
- [ ] Placed one order end to end and watched it get assigned
- [ ] Checked the notification outbox renders a message
- [ ] Considered `SEED_DEMO_ORDERS=false` if you do not want sample data
- [ ] Considered `BOOTSTRAP_DB=false` + `npm run db:deploy` for a real migration history
- [ ] Planned for the free PostgreSQL database's 30-day expiry (upgrade or export before then)

---

## Troubleshooting

<details>
<summary><b>The first request takes about a minute</b></summary>

Render free web services spin down after 15 minutes without inbound traffic and
can take about one minute to wake. The browser displays a loading page while
that happens. `GET /api/health` is the cheapest manual warm-up request.
</details>

<details>
<summary><b>What happens to the free PostgreSQL database after 30 days?</b></summary>

Render's free PostgreSQL databases expire 30 days after creation and then enter
a 14-day grace period before deletion. For an assignment demo, create a fresh
free database and redeploy if it expires; for durable production use, upgrade
or export the data before expiry. See
[Render's current free database limits](https://render.com/docs/free#free-postgres).
</details>

<details>
<summary><b><code>Environment variable not found: DATABASE_URL</code></b></summary>

The Prisma CLI only reads `.env` from the schema folder and the current
directory. This repo keeps one canonical `.env` at the root, and
[`scripts/prisma.mjs`](../server/scripts/prisma.mjs) loads it before delegating.
Always go through the npm scripts (`npm run db:push`), never `npx prisma`
directly.
</details>

<details>
<summary><b><code>EPERM: operation not permitted, rename … query_engine-windows.dll.node</code></b></summary>

Windows only. A running dev server holds the Prisma query engine open. Stop
`npm run dev` before `npm run build`.
</details>

<details>
<summary><b>The dev proxy hangs, or returns 500 / ECONNREFUSED</b></summary>

Two causes, both already handled in [`vite.config.ts`](../web/vite.config.ts):

1. **`localhost` on Windows** resolves to both `::1` and `127.0.0.1`, and Node's
   happy-eyeballs connector can fail the request with `EADDRINUSE`. The proxy
   targets `127.0.0.1` explicitly.
2. **An ambient `PORT`.** Many dev harnesses export `PORT` for the *frontend*,
   which would make the API proxy point at itself. The target is derived from
   `API_PUBLIC_URL` (or `VITE_API_PROXY_PORT`), never a bare `PORT`.

If you changed the API port, update `API_PUBLIC_URL` in `.env` and restart Vite.
</details>

<details>
<summary><b>The build succeeds but the site 404s on refresh</b></summary>

The SPA fallback only runs when `server/public/index.html` exists. Confirm
`npm run build` ran the **web** workspace, not just the server.
</details>

<details>
<summary><b>Notifications say <code>CONSOLE</code> even though I set SMTP</b></summary>

`NOTIFY_EMAIL_PROVIDER=smtp` also requires `SMTP_HOST` to be non-empty;
otherwise the service logs a warning and falls back rather than throwing. Check
`GET /api/notifications/transports`.
</details>

<details>
<summary><b>Auto-assignment always fails with 409</b></summary>

The dispatcher needs at least one agent that is `AVAILABLE`, under capacity, and
whose vehicle can carry the weight. Open the order in the admin console — the
dispatch panel lists every rejected agent **and the reason**.
</details>

---

## Related

- 📄 [ARCHITECTURE.md](ARCHITECTURE.md) — why single-service
- 📄 [DATABASE.md](DATABASE.md#migrations) — migrations in production
- 📄 [NOTIFICATIONS.md](NOTIFICATIONS.md) — provider details
- 📄 [`.env.example`](../.env.example) — every variable
