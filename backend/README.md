# re:string backend

REST API for the app: Node.js, Express 5, PostgreSQL through Drizzle ORM. It follows the layout and
conventions of the Restorus backend. Plain JavaScript (ES modules), no build step.

## Stack

| | |
|---|---|
| Server | Express 5, `cors`, `cookie-parser`, `helmet`, `express-rate-limit` |
| Database | PostgreSQL, `drizzle-orm` + `drizzle-kit` (migrations in `drizzle/`), `pg` |
| Auth | `bcryptjs` for passwords, `jsonwebtoken` for sessions (cookie for browsers, Bearer token for the native app) |
| Validation | `zod` |
| Email | `nodemailer` (without SMTP settings, emails are printed to the console) |
| Config | `dotenv`, one place: `src/config.js` |

## Layout

```
backend/
  src/
    index.js              starts the server (config check, first admin, graceful shutdown)
    app.js                the Express app: middleware, routes, error handling
    config.js             every environment variable, with defaults
    bootstrap.js          creates the first admin when there are no users
    db/                   schema.js, index.js (pool + drizzle), migrate.js
    middleware/           auth (requireAuth, requireRole), validate, rateLimit, error
    routes/               one file per resource: auth, clients, rackets, strings, services, orders, photos, dashboard
    utils/                http (HttpError), password, tokens, session, email, emailTemplates, emailFailure
    scripts/seed.js
  drizzle/                generated SQL migrations (commit them)
  tests/                  api/ (integration, real server + test database), unit/
  Dockerfile  railway.toml  drizzle.config.js  eslint.config.js  .env.example
```

## Running it locally

You need Node 22+ and a PostgreSQL you can reach.

```bash
cd backend
npm install
cp .env.example .env          # then set DATABASE_URL and JWT_SECRET
createdb systema
npm run db:migrate
npm run dev                   # http://localhost:4000, restarts on changes
```

Generate a secret with `openssl rand -base64 48`. A local PostgreSQL (Homebrew, Postgres.app) has a role
named after your OS user, so `DATABASE_URL=postgresql://<you>@localhost:5432/systema` needs no password.

### Scripts

| Command | |
|---|---|
| `npm run dev` | server with `node --watch` |
| `npm start` | server |
| `npm run db:generate` | write a migration after changing `src/db/schema.js` |
| `npm run db:migrate` | apply the migrations |
| `npm run db:push` | push the schema to a throwaway database without a migration |
| `npm run db:studio` | Drizzle Studio on 127.0.0.1 |
| `npm run db:seed` | create the first admin from `SEED_ADMIN_*` |
| `npm test` | unit and API tests |
| `npm run lint` | ESLint |

### Changing the schema

Edit `src/db/schema.js`, run `npm run db:generate -- --name what_changed`, read the SQL in `drizzle/`,
commit it with the schema, then `npm run db:migrate`.

## Environment

See `.env.example`; every variable is described there. Required: `DATABASE_URL`, `JWT_SECRET` (32+
characters). The server refuses to start without them. In production also set `APP_URL` (the app's
address, used in email links and as the only allowed browser origin).

## API

Every error is `{ "error": "message", "code"?: "machine_reason", "fields"?: { "field": "message" } }`.

| | | |
|---|---|---|
| `GET` | `/api/health` | `{ ok: true }`, no auth |
| `POST` | `/api/auth/register` | `{ email, password, full_name? }` → `201 { user, token }`, 409 `email_taken` |
| `POST` | `/api/auth/login` | `{ email, password }` → `{ user, token }`, 401 `invalid_credentials` |
| `POST` | `/api/auth/logout` | clears the cookie |
| `GET` | `/api/auth/me` | the signed-in user |
| `PATCH` | `/api/auth/me` | any of `full_name`, `workshop_name`, `currency` (ISO code), `tension_unit` (`kg`/`lbs`), `timezone` (IANA), `language` (`en`/`uk`), `notifications_enabled`, `setup_completed: true` → the user |
| `POST` | `/api/auth/forgot-password` | `{ email }` → always `{ ok: true }`; emails a link when the address has an account |
| `POST` | `/api/auth/reset-password` | `{ token, password }`; the token works once, for 60 minutes |

A password is 8 to 72 bytes, as in the app. Sign-in answers with the cookie `auth_token` and with the
`token` in the body. A browser keeps the cookie; the native app stores the token (in `expo-secure-store`)
and sends `Authorization: Bearer <token>`.

Changing a password with a reset link ends every session opened before.
Register, login, forgot-password and reset-password are limited to 20 attempts per IP and 15 minutes.

### Stringing: clients, rackets, strings, services, orders

Everything below needs a signed-in user and only ever shows that user's own data (another user's id is a
404, never a 403). Lists answer `{ items }`; a mistake in a body is a 400 with `fields`. JSON is
snake_case. Deleting a client, racket or string hides it from lists and pickers but keeps it for the
orders that used it (an old order never loses its history); an order is deleted for real.

| | | |
|---|---|---|
| `GET` `POST` | `/api/clients` | `?q=` searches name and phone. A client needs only a `name`; `phone`, `email`, `notes` are optional. Each has `rackets_count`, `orders_count`, `last_order_date` |
| `GET` `PATCH` `DELETE` | `/api/clients/:id` | `GET` adds the client's `rackets` and `orders` (history) |
| `GET` `POST` | `/api/rackets` | `?q=` (brand, model, owner) and `?client_id=`. `{ client_id, brand, model, notes? }`. Each has `orders_count` and `last_setup`: how it was last strung, to prefill a new order |
| `GET` `PATCH` `DELETE` | `/api/rackets/:id` | `GET` adds the racket's `orders`, newest first |
| `GET` `POST` | `/api/strings` | the stringer's catalog. `?q=` (brand, model). `{ brand, model, gauge?, type, default_price? }`, `type`: `polyester`, `multifilament`, `synthetic_gut`, `natural_gut`, `other` |
| `GET` `PATCH` `DELETE` | `/api/strings/:id` | |
| `GET` `POST` | `/api/services` | what the stringer charges for: `{ name, price?, kind: labor\|extra, active }`. New accounts start with Stringing Labor, Grip Replacement and Overgrip Installation, without prices |
| `PATCH` | `/api/services/:id` | `active: false` archives a service (it is no longer offered on new orders), `true` brings it back |
| `GET` `POST` | `/api/orders` | `?status=` (`received`, `in_progress`, `ready`, `completed`, or `active` for the first three), `?q=` (customer, racket, string, `#number`), `?client_id=`, `?racket_id=`, `?limit=&offset=` → `{ items, has_more }`. The queue is by due date, then finished orders, newest first |
| `GET` `PATCH` `DELETE` | `/api/orders/:id` | `GET` adds `services` and `photos`. `PATCH` takes any field of an order plus `status` and `is_paid`; `services` replaces the whole list |
| `POST` | `/api/orders/:id/photos` | the body is the image (JPEG, PNG, WebP or HEIC, up to 8 MB, up to 10 per order); the type is read from the bytes |
| `GET` `DELETE` | `/api/photos/:id` | the image itself (cached by the app: a photo never changes) / remove it |
| `GET` | `/api/dashboard` | `active_orders`, `ready_for_pickup`, `completed_this_month` (the stringer's month, in their time zone) and the next orders `active` by due date |

An order needs a `client_id` and a `racket_id` of that client and nothing else. **Tension is always in
kilograms** (`main_tension`, `cross_tension`, 5 to 60); `tension_unit` in the profile only changes how the
app shows and types it, so a change of unit never touches an old order. The setup (string names, tension,
knots, prices) is copied into the order: editing the catalog later does not rewrite old orders.
`total` is labor + strings + extra services, worked out by the server on every save (null while nothing
has a price). Orders are numbered 1, 2, 3... for each stringer. Payment (`is_paid`) is independent of the
status. Strings the customer brings (`customer_strings`) have no catalog string and no price; a hybrid
(`hybrid`) has a second string for the crosses.

### Adding a resource

1. A table in `src/db/schema.js`, then `npm run db:generate`.
2. `src/routes/<name>.js`: an `express.Router()` that throws `HttpError`, `notFound()` or `forbidden()`
   (Express 5 sends a rejected promise to the error handler on its own). Use `requireAuth` and
   `requireRole('admin')`, `validateBody(zodSchema)`, and `rejectMalformedIds(router)` for `/:id`.
3. `app.use('/api/<name>', router)` in `src/app.js`, and a test in `tests/api/run.mjs`.

## Tests

```bash
npm test               # unit + API
npm run test:unit
npm run test:api
```

The API tests need `psql` and a reachable PostgreSQL. They create the `systema_test` database, apply the
migrations, empty it, start the real server against it and exercise the API end to end. With the Docker
`postgres` image: `PGUSER=postgres PGPASSWORD=postgres npm run test:api`. `TEST_DATABASE_URL`,
`TEST_ADMIN_URL` and `TEST_PORT` override the defaults.

## Deploying

**Docker** (build from this folder; the image applies the migrations, then starts the server):

```bash
docker build -t systema-backend .
docker run -p 4000:4000 --env-file .env -e NODE_ENV=production systema-backend
```

**Railway**: create a service with the root directory `backend/`, add the PostgreSQL plugin (it sets
`DATABASE_URL`), and set `JWT_SECRET` and `APP_URL`. `railway.toml` has the start command and the
health check.

With more than one instance, run `node src/db/migrate.js` as a separate step instead of in the start command.

## Connecting the app

The app talks to this API from `src/lib/api.ts`; sign-in state is in `src/lib/auth.tsx` and the session
token is kept in the keychain (`expo-secure-store`; `localStorage` on the web build).

- **Development:** start the backend (`npm run dev`, port 4000) and the app. The app finds the backend by
  itself: the computer that runs Metro, port 4000, so a phone on the same Wi-Fi works with no setting.
- **Production build:** set `EXPO_PUBLIC_API_URL=https://api.example.com` when building the app.
- **Password reset links** point to `APP_URL/reset-password?token=...` and open the app's reset screen.
  For a native build use the app's own scheme as `APP_URL` (`systema://` while developing). Mail clients
  do not make custom schemes clickable, so for real users set up a universal link (an https address that
  opens the app), or send people to a web page that opens it.

## Not included

Left out because nothing in the app needs them yet: a file store for photos (they are kept in PostgreSQL,
which is enough for a stringer's few photos per order; move them to S3 if that grows), AI calls
(`@anthropic-ai/sdk`), and Restorus' CI pipeline and Terraform, which belong to its AWS account.
