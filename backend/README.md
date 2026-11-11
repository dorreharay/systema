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
| Email | Resend's HTTP API (`RESEND_API_KEY`) or `nodemailer` over SMTP; with neither, emails are printed to the console |
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
    data/                 the reference catalog: rackets.json, strings.json (names only, no photos)
    middleware/           auth (requireAuth, requireRole), validate, rateLimit, error
    routes/               one file per resource: auth, clients, rackets, strings, reference, services, orders, photos, dashboard, insights
    utils/                http (HttpError), password, tokens, session, email, emailTemplates, emailFailure, google, apple, reference (search),
                          clientIds + operations (the offline mode: ids made by the phone, keys of repeatable changes),
                          messages/ (what the server writes in the language of the account: the reset email and page, the first services)
    scripts/seed.js
  drizzle/                generated SQL migrations (commit them)
  tests/                  api/ (integration, real server + test database), unit/
  Dockerfile  drizzle.config.js  eslint.config.js  .env.example
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
characters). The server refuses to start without them. In production also set `APP_URL` (the public address of
this API, used in email links and as the only allowed browser origin). To send emails set `RESEND_API_KEY` and
`EMAIL_FROM_ADDRESS` (see `../docs/email.md`). To offer sign-in with Google also set `GOOGLE_CLIENT_IDS`, and with Apple
`APPLE_CLIENT_IDS` (and, to revoke an account's Apple token when it is deleted, `APPLE_TEAM_ID`, `APPLE_KEY_ID` and
`APPLE_PRIVATE_KEY`): see below. `BILLING_ENABLED`, `FREE_ORDERS_PER_MONTH`, `BILLING_GRACE_DAYS` and `BILLING_DEV_GRANTS` are about the
subscription plans: see [Subscription plans](#subscription-plans). `EMAIL_VERIFICATION_REQUIRED` and the `EMAIL_CODE_*` variables are about
confirming the email address of a new account: see [Confirming the email address](#confirming-the-email-address).

## API

Every error is `{ "error": "message", "code"?: "machine_reason", "fields"?: { "field": "message" } }`.

| | | |
|---|---|---|
| `GET` | `/api/health` | `{ ok: true }`, no auth |
| `POST` | `/api/auth/register` | `{ email, password, full_name?, language? }` → `201 { user, token }`, 409 `email_taken`. `language` is the language the app was in, one of `en`, `de`, `fr`, `es`, `it`, `pt`, `ja`, `uk`, `pl`: a new account is made in it, and so are its first services (it is `en` without one, and a language the server does not know is ignored); `google` and `apple` take it the same way |
| `POST` | `/api/auth/login` | `{ email, password }` → `{ user, token }`, 401 `invalid_credentials` |
| `POST` | `/api/auth/google` | `{ id_token, language? }`, the ID token from Google Sign-In (the web build sends `{ access_token, language? }` instead) → `{ user, token }` (`201` for a new account); 401 `google_token_invalid`, 403 `google_email_unverified` / `account_inactive`, 409 `google_account_mismatch`, 503 `google_not_configured` / `google_unavailable` |
| `POST` | `/api/auth/apple` | `{ identity_token, authorization_code?, full_name?, language? }`, from Sign in with Apple → `{ user, token }` (`201` for a new account); 400 `apple_email_missing`, 401 `apple_token_invalid`, 403 `account_inactive`, 409 `apple_account_mismatch` / `email_taken`, 503 `apple_not_configured` / `apple_unavailable` |
| `POST` | `/api/auth/logout` | clears the cookie |
| `GET` | `/api/auth/me` | the signed-in user |
| `POST` | `/api/auth/verify-email` | `{ code }`, the code emailed on sign-up → the user, with `email_verified: true`; 400 `invalid_code` (`data.attempts_left`) / `code_expired`, 429 `code_attempts_exceeded`. See [Confirming the email address](#confirming-the-email-address) |
| `POST` | `/api/auth/resend-verification` | → `{ ok: true, retry_after }`; emails a new code (the one before stops working); 429 `code_cooldown` / `code_limit` (`data.retry_after`, in seconds), 502 `email_not_sent` |
| `PATCH` | `/api/auth/me` | any of `full_name`, `workshop_name`, `currency` (ISO code), `tension_unit` (`kg`/`lbs`), `timezone` (IANA), `language` (one of the nine above), `notifications_enabled`, `setup_completed: true` → the user |
| `POST` | `/api/auth/delete-account` | `{ password }` → `{ ok: true }`; deletes the account and everything it owns (clients, rackets, strings, services, orders, photos) for good. The password is checked when the account has one (`403 invalid_password`), and `/me` says whether it does (`has_password`). An account made with Apple has its Apple token revoked first, when the server kept one |
| `POST` | `/api/auth/forgot-password` | `{ email }` → always `{ ok: true }`; emails a link when the address has an account, in the language of the account |
| `POST` | `/api/auth/reset-password` | `{ token, password }`; the token works once, for 60 minutes |

A password is 8 to 72 bytes, as in the app. Sign-in answers with the cookie `auth_token` and with the
`token` in the body. A browser keeps the cookie; the native app stores the token (in `expo-secure-store`)
and sends `Authorization: Bearer <token>`.

Changing a password with a reset link ends every session opened before.
Register, login, Google and Apple sign-in, verify-email, resend-verification, delete-account, forgot-password and reset-password are limited to 20 attempts per IP and 15 minutes.

### Confirming the email address

An account made with an email and a password has to show that the address is its own. A code of six digits is emailed when it signs up, and
until it is typed in, every route but a few answers `403 { "code": "email_not_verified" }`: `GET /me`, `POST /logout`, `POST /delete-account`
and the two routes above are let through, so the app can ask for a code, take it and leave. The user says `email_verified`.

It is a setting of the server, `EMAIL_VERIFICATION_REQUIRED`: **on in production, off everywhere else**. A local server (and the tests) ask for
nothing: `email_verified` is `true` from the start and no code is made. Set it to `true` to try it locally; with no email service set up the
email, code and all, is printed to the console. Set it to `false` in production to switch it off.

- A code works for 15 minutes (`EMAIL_CODE_MINUTES`) and takes 5 wrong guesses (`EMAIL_CODE_ATTEMPTS`); only the newest one counts. A guess
  is counted before it is looked at, so guesses sent together get no more than 5 looks between them. Only a keyed hash of a code is stored
  (table `email_codes`), and it is only good for the account it was made for.
- Another code is refused for 60 seconds after the last (`EMAIL_CODE_RESEND_SECONDS`) and after 6 in an hour (`EMAIL_CODE_SENDS_PER_HOUR`).
  A code whose email could not be sent is not kept.
- Sign-up sends the first code without waiting for the email to go out. A sign-in of an account that has not confirmed sends one only when
  none can still be typed in.
- Accounts made with Google, and with Apple when Apple calls the address verified, are confirmed from the start (an address Apple does not
  call verified is confirmed with a code). Choosing a new password through the emailed link confirms the address too, and so does linking the
  account to Google or Apple.
- Migration `0009` counts every account that exists as confirmed: they signed up before it was asked for. Before turning this on in production,
  the app version with the screen that asks for the code has to be out, or an old version will be answered `email_not_verified` for a new account.

### Sign in with Google

The app signs in with Google on the device and sends the **ID token** to `POST /api/auth/google`. The server checks
it (`src/utils/google.js`): signed with Google's published keys, issued to one of the client IDs in
`GOOGLE_CLIENT_IDS`, not expired, and the email verified by Google. The web build cannot get an ID token (a page gets one only
through a button Google draws, and the web build has its own), so it sends an `access_token` instead, in place of the
`id_token` (one of the two, never both): the server asks Google about it (`src/utils/google.js`: `tokeninfo`, whom the token
was made out to, which has to be one of `GOOGLE_CLIENT_IDS`, the same Web client ID as the phone's, or any other app's token
would sign anyone in; `userinfo`, the name, an extra), and the answer is handled exactly as an ID token's is. Google not
answering is 503 `google_unavailable`. `GOOGLE_TOKENINFO_URL` and `GOOGLE_USERINFO_URL` are where those two questions go; only a
test has a reason to change them. Then it answers with the same `{ user, token }`
as a password sign-in. With no `GOOGLE_CLIENT_IDS` the endpoint answers 503 `google_not_configured`. The Google Cloud
side is set up as described in [`../docs/google-sign-in.md`](../docs/google-sign-in.md).

Which account the token belongs to, in this order:

1. The one already linked to the Google user (`users.google_sub`, Google's own id, which does not change when the
   person changes their address).
2. The one with the same email. It is linked now. Signing up with a password never checked that the address is the
   person's, so a password somebody else set must not survive Google showing whose address it is: the password is
   removed and every session opened before ends (the person can set a password again with "Forgot password").
   An address already linked to a *different* Google user is refused (409 `google_account_mismatch`).
3. Otherwise a new account, made like one from `/register` but with no password (`users.password_hash` is null).

An inactive account is refused (403) and left as it was.

### Sign in with Apple

The app signs in with Apple on the device (the web build, with Sign in with Apple JS, in the browser: see
[`../docs/web-sign-in.md`](../docs/web-sign-in.md)) and sends what Apple gave it to `POST /api/auth/apple`:
`{ identity_token, authorization_code?, full_name? }`. `identity_token` is the token (up to 8192 characters);
`authorization_code` (up to 2048) is the code that came with it, and `full_name` (up to 100, trimmed) is the name, which
Apple gives only the first time a person authorizes the app. The server checks the token (`src/utils/apple.js`): RS256,
signed with Apple's published keys (`APPLE_KEYS_URL`), issued by `https://appleid.apple.com` to one of the identifiers in
`APPLE_CLIENT_IDS`, not expired. The identifiers are the app's bundle ID, which the token of the native sign-in is made out
to, and the Services ID of the web sign-in, which the browser's is made out to (the bundle ID goes first). With no
`APPLE_CLIENT_IDS` the endpoint answers 503 `apple_not_configured`; a token that
fails the check is 401 `apple_token_invalid`, and Apple's keys out of reach is 503 `apple_unavailable`. Then it answers with
the same `{ user, token }` as a password sign-in (`201` for a new account, `200` otherwise).

Which account the token belongs to, in this order:

1. The one already linked to the Apple user (`users.apple_sub`, Apple's own id; it does not change when the person changes
   or hides their address). The email of the token is not looked at.
2. Otherwise, when the token has an email and Apple calls it verified, the account with that email. It is linked now, with
   the same consequence as for Google: a password on it is removed and every session opened before ends. An address
   already linked to a *different* Apple user is refused (409 `apple_account_mismatch`). The `full_name` is not used: the
   account is not new.
3. Otherwise a new account, made like one from `/register` (default services and starter catalog) but with no password,
   on the email of the token, which may be the address Apple made up for a person who hides theirs
   (`…@privaterelay.appleid.com`), and with the `full_name` of the request. An email that Apple does not call verified
   links nothing: if an account has it, the answer is 409 `email_taken`.

With no usable email in the token and no account linked to its Apple user, the answer is 400 `apple_email_missing` (the
person can stop using their Apple ID for the app in the Apple ID settings and try again). An inactive account is refused
(403 `account_inactive`) and left as it was. The email is compared as everywhere else (trimmed, lower case).

**Revoking.** Apple keeps a person linked to the app until it is told otherwise, and expects an app that offers account
deletion to tell it. For that the server needs a Sign in with Apple key from the Apple Developer account (Keys, with "Sign
in with Apple" ticked; the `.p8` file): `APPLE_TEAM_ID`, `APPLE_KEY_ID` and `APPLE_PRIVATE_KEY` (the text of the file; `\n`
for its line breaks when it is on one line). All three or none, and with them `APPLE_CLIENT_IDS`: the server refuses to
start otherwise. With the key, a sign-in that comes with an `authorization_code` trades it with Apple for a refresh token,
which is kept in `users.apple_refresh_token` (never sent to the app), and `delete-account` revokes that token before it
deletes the account. Apple has the code traded, and the token revoked, only by the client it was made out to, so the trade is
made as the identifier the identity token was made out to (the bundle ID for the app, the Services ID for the browser), and
that is kept with the token in `users.apple_client_id` (empty for a token kept before that column, which was always the
app's: the first of `APPLE_CLIENT_IDS`). Both calls sign a short-lived ES256 client secret with the key (the team, the key and
that client in it; one key serves both, as the Services ID is grouped with the app's primary App ID) and are best effort:
whatever goes wrong is logged as `[apple] …` (nothing secret in it) and the sign-in or the deletion goes on. `APPLE_AUTH_URL` is the base of Apple's `/token` and `/revoke` endpoints and `APPLE_KEYS_URL`
is where its keys are; only a test has a reason to change them.

### Subscription plans

An account is on Free, Pro or Studio (`plan`, `plan_period`, `plan_expires_at`, `plan_trial`, `plan_renews` of `users`). All of it is off
unless `BILLING_ENABLED=true`: every account then has everything, nothing is counted and the app shows no plans. See
`../docs/subscriptions.md` for what is built and what is left before a first payment.

- **The user** (`/api/auth/me`, and the answers of the sign-ins) has a `subscription`: `enabled`, `plan` (what the account holds now: the
  paid plan until `plan_expires_at` and `BILLING_GRACE_DAYS` after it, otherwise `free`), `trial`, `renews`, `period`, `expires_at`,
  `holds_until`, `expired` (it had a plan that has run out), `checked_at`, `entitlements` (`orders_per_month`, `stock`, `month_overview`)
  and `free` (what the account falls back to).
- **The limit.** On Free, `POST /api/orders` answers `402 order_limit_reached` with `data: { limit, used, resets_on }` once the stringer has
  made `FREE_ORDERS_PER_MONTH` orders in their calendar month (their time zone; a deleted order gives its place back). An order made without a
  connection (an `at` more than five minutes old) and an order that is sent again with its `id` are never turned away.
- **The stock** is paused on Free, not taken away. Where `entitlements.stock` is false the rackets and strings are answered as not counted
  (`track_stock: false`, `available: true`, the count itself is still sent), `?in_stock=1` lists everything, an order takes nothing from the stock
  and is never refused with `out_of_stock`, and a request cannot write `track_stock` (a form of the paused view sends `false`, which must not
  switch the counting off for good), while a count (`stock`, or a change by an amount) is still written. On Pro the counting goes on from the
  counts that were left.
- `POST /api/billing/dev-grant` `{ plan, period?, trial?, renews?, days? }` → the user: gives the signed-in account a plan by hand. It is a
  `404` unless `BILLING_DEV_GRANTS=true`, and that setting does nothing in production.
- **The store** is RevenueCat (`utils/revenuecat.js`): the app buys through its SDK with the account's id as the customer id, and the server asks
  it what the customer holds (`GET /v1/subscribers/{id}`, `REVENUECAT_SECRET_KEY`) and writes the `plan*` columns. `POST /api/billing/sync`
  (signed in, rate limited by `BILLING_SYNC_RATE_LIMIT_MAX` a minute) does that for the signed-in account and answers with the user; it is
  `503 billing_unavailable` without the key and `502 billing_unreachable` when RevenueCat cannot answer. `POST /api/billing/revenuecat` is
  RevenueCat's webhook: its `Authorization` header must be `REVENUECAT_WEBHOOK_AUTH` (without that setting the route is a `404`), and what a
  notice says is not used, only whom it is about (`app_user_id`, `original_app_user_id`, `aliases`, both sides of a `TRANSFER`): the server
  asks RevenueCat for the state of those accounts. A notice about nobody here, and a `TEST`, are answered `200`; one the server could not deal
  with because RevenueCat could not be asked is answered `502`, so that RevenueCat sends it again. The entitlements are `REVENUECAT_PRO_ENTITLEMENT`
  and `REVENUECAT_STUDIO_ENTITLEMENT` (`pro` and `studio`).

### Stringing: clients, rackets, strings, services, orders

Everything below needs a signed-in user and only ever shows that user's own data (another user's id is a
404, never a 403). Lists answer `{ items }`; a mistake in a body is a 400 with `fields`. JSON is
snake_case. Deleting a client, racket or string hides it from lists and pickers but keeps it for the
orders that used it (an old order never loses its history); an order is deleted for real.

| | | |
|---|---|---|
| `GET` `POST` | `/api/clients` | `?q=` searches name and phone. A client needs a `name` and a `phone`; `email` and `notes` are optional. Each has `rackets_count`, `orders_count`, `last_order_date`. `POST` takes an optional `id` (see [Working without a connection](#working-without-a-connection)) |
| `GET` `PATCH` `DELETE` | `/api/clients/:id` | `GET` adds the client's `rackets` and `orders` (history) |
| `GET` `POST` | `/api/rackets` | `?q=` (brand, model, owner), `?client_id=`, `?kind=client` or `catalog`, `?in_stock=1`. `{ client_id?, brand, model, notes?, track_stock?, stock? }`: with a `client_id` it is that client's racket; without one it is a catalog racket, one the stringer keeps in stock (see Stock below). Each has `orders_count` and, for a client's racket, `last_setup`: how it was last strung, to prefill a new order |
| `GET` `PATCH` `DELETE` | `/api/rackets/:id` | `GET` adds the racket's `orders`, newest first |
| `POST` | `/api/rackets/:id/stock` | `{ delta, op_id }`: adds `delta` rackets (a whole number, negative to take away) to a catalog racket's stock, once for each `op_id` → the racket (see [Working without a connection](#working-without-a-connection)) |
| `GET` `POST` | `/api/strings` | the stringer's catalog. `?q=` (brand, model), `?in_stock=1`. `{ brand, model, gauge?, type, default_price?, track_stock?, stock? }`, `type`: `polyester`, `multifilament`, `synthetic_gut`, `natural_gut`, `other` |
| `GET` `PATCH` `DELETE` | `/api/strings/:id` | |
| `POST` | `/api/strings/:id/stock` | `{ delta, op_id }`: the same for sets of a string (whole or half) → the string |
| `GET` | `/api/reference` | what the reference catalog holds: `updated`, and for `rackets` and `strings` the `count` and the `brands` |
| `GET` | `/api/reference/rackets` | the rackets that exist, to find one by a part of its name. `?q=`, `?brand=`, `?limit=` (1 to 50, 20 by default), `?offset=` → `{ items, has_more }`, each item `{ id, brand, model }` |
| `GET` | `/api/reference/strings` | the same for strings, and `?type=`. Each item is `{ id, brand, model, type, gauges }`: `gauges` are the sizes in mm, from the thinnest, empty when they are not known |
| `GET` `POST` | `/api/services` | what the stringer charges for: `{ name, price?, kind: labor\|extra, active }`. New accounts start with Main Service (the stringing itself, which every order gets), Grip Replacement and Overgrip Installation (named in the language of the account), without prices |
| `PATCH` | `/api/services/:id` | `active: false` archives a service (it is no longer offered on new orders), `true` brings it back |
| `GET` `POST` | `/api/orders` | `?status=` (`received`, `in_progress`, `ready`, `completed`, or `active` for the first three), `?q=` (customer, racket, string, `#number`), `?client_id=`, `?racket_id=`, `?limit=&offset=` → `{ items, has_more }`. The queue is by due date, then finished orders, newest first. `?details=1` adds each order's `services` and `photos`, as `GET /api/orders/:id` has them |
| `GET` `PATCH` `DELETE` | `/api/orders/:id` | `GET` adds `services` and `photos`. `PATCH` takes any field of an order plus `status` and `is_paid`; `services` replaces the whole list. `POST` and `PATCH` take `at`, the moment of the tap on the phone (see [Working without a connection](#working-without-a-connection)); `POST` also an `id` |
| `POST` | `/api/orders/:id/photos` | the body is the image (JPEG, PNG, WebP or HEIC, up to 8 MB, up to 10 per order); the type is read from the bytes |
| `GET` `DELETE` | `/api/photos/:id` | the image itself (cached by the app: a photo never changes) / remove it |
| `GET` | `/api/dashboard` | `active_orders`, `ready_for_pickup`, `completed_this_month` (the stringer's month, in their time zone) and the next orders `active` by due date |
| `GET` | `/api/insights` | what the home screen charts, in the stringer's time zone: `revenue` (what was paid this month day by day, and `previous_total` for the same days of last month), `workload` (the work still to do on each of the next seven days, and `overdue`) and `receivables` (what is unpaid, `debtors`, and the best `top_clients`) |

An order needs a `client_id` and a `racket_id` (one of that client's rackets, or a catalog racket, which
goes with any client) and nothing else. Instead of a `racket_id` it can carry `new_racket: { brand, model }`, for
a racket that the client does not have yet (the app picks one from the reference list): it is the client's racket
of that name when they have one (names are compared without regard to case, spaces, dashes or accents), and
otherwise it is made **in the same transaction as the order**, so an order that fails (out of stock, say) leaves
no racket behind, and a racket that was picked for an order that was never made is never saved. `PATCH` takes it
too. Sending both a `racket_id` and a `new_racket`, or neither on a new order, is a `400`. **Tension is always in
kilograms** (`main_tension`, `cross_tension`, 5 to 60); `tension_unit` in the profile only changes how the
app shows and types it, so a change of unit never touches an old order. The setup (string names, tension,
knots, prices) is copied into the order: editing the catalog later does not rewrite old orders.
`total` is labor + strings + extra services, worked out by the server on every save (null while nothing
has a price). Orders are numbered 1, 2, 3... for each stringer. Payment (`is_paid`) is independent of the
status. Strings the customer brings (`customer_strings`) have no catalog string and no price; a hybrid
(`hybrid`) has a second string for the crosses.

**Stock.** A catalog racket and a string can be counted: `track_stock: true` and a `stock`, in pieces for a
racket and in sets for a string (whole or half). What is not counted is always there, so data from before
the stock existed is untouched; every item has `available` for the pickers. (A client's racket is never
counted: it is theirs, not for sale.) An order takes what it uses when it is created: one catalog racket,
one set of its string (half a set of each for a hybrid, nothing for strings the customer brings), and
`stock_used` keeps exactly what it took. Changing the racket or the strings of an order gives back what it
took and takes the new ones; deleting the order gives it back; any other edit leaves the stock alone. When
there is not enough, nothing is saved and the answer is a `409` with `code: "out_of_stock"` and `fields`
naming `racket_id`, `main_string_id` or `cross_string_id`. Taking is a single conditional update, so two
orders for the last item cannot both get it.

**Starter catalog.** A new account (a sign-up, or the first admin made on start) begins with a catalog of the rackets
and strings that are in most workshops: about sixty of each, a string once for each size, every one counted and with
none in stock, so that what comes in is a matter of setting a count and not of typing a name. They are listed in
`src/data/starter-catalog.json` as names of the reference list, and a name or a size that the list does not have stops
the server from starting. It is made with the account, in the same transaction, and `STARTER_CATALOG=false` turns it
off. Accounts that already exist are not changed.

**Reference catalog.** `/api/reference` is a list of the rackets and strings that exist, to fill in a new racket
or string of the stringer's own catalog from a part of its name. It is not the stringer's data: it is the same for
everyone and the routes above never touch it. It is read once from `src/data/rackets.json` and
`src/data/strings.json` when the server starts and searched in memory (no table, nothing to migrate), so it is
light, and an answer may be kept for an hour. A search is by words: every word of `q` has to be the start of a word
of the name or be inside it, so `pure dr` finds Pure Drive; case, accents, spaces and dashes do not matter
(`hyperg` finds Hyper-G) and `98+` is not `98`. A gauge can be typed `1.25`, `1,25` or `125`, and the type of a
string can be searched too (`poly`). Brands are found by their Ukrainian spelling as well (`бабола`), and the
initials and versions that people say (`ps97`, `v14`) are aliases of a model. What fits a search equally well goes
by the length of the model, so the base model comes before its variants (`Pure Drive`, then `Pure Drive Lite`).
Without `q` the answer is the list itself, by brand and model. It holds names, never photos. It was written by hand, not copied from a shop or a
brand's site, and it is a starting point rather than everything that was ever made: a model that is not in it is
added to the catalog by typing it, as before. To add one, put it in the JSON file; `npm run test:unit` checks the
files (a duplicate, an empty alias or a wrong gauge also stops the server from starting). `npm run dev` restarts on
a change of code, not of a JSON file: restart it after editing the list.

### Working without a connection

The app keeps its own copy of the stringer's data, and what is done without a connection is sent when it is back, one request after another.
So that a request that is sent twice does no harm (the connection dropped after the server had done the work, and the app never heard the
answer), and so that a stock changed on two devices adds up, the API has four things. All of them are optional, and an older build of the
app, which sends none of them, works as it did.

**Ids made by the phone.** `POST /api/clients`, `/api/rackets`, `/api/strings`, `/api/services` and `/api/orders` take an optional `id` (a
UUID), and so does the racket an order names (`new_racket.id`, in a `POST` and in a `PATCH` of an order). A change (`PATCH`) never takes one.
The phone names what it makes, so that the orders it makes after can point at it before the server has heard of it.

- A row with that `id` that is this stringer's already (a hidden one too: it was made, and a repeat of the request that made it is answered)
  is not made again. The answer is **`200`** and not `201`, with the row as it is now (so the counts of a client or of a racket,
  `rackets_count`, `orders_count`, `last_order_date`, `last_setup`, are today's). Nothing else happens: the body is checked for its shape and
  for nothing else (a name that has been changed, a phone number that another client has, a client or a string that has been removed
  since), the stock is not touched and no order number is used.
- The `id` of another stringer's row is a `409` `{ "error": "This id is already in use", "code": "id_conflict" }`, which says nothing more.
  The same goes for a racket named by an order with an `id` that is taken; the order is not made.
- Two copies of one request at the same moment make one row: the second waits for the first (clients and orders: a lock of the stringer and
  the id; the rest: `INSERT … ON CONFLICT DO NOTHING`) and gets the `200`. Two stringers who choose one id at the same moment get one
  `201` and one `409`.
- A racket that an order names (`new_racket`) is made with its `id`, in the transaction of the order. When the client has a racket of that
  name already, that one is used and the `id` is not (the answer shows the racket's real `id`).
- `PATCH` and `DELETE` of an order wait for each other: the transaction takes a lock of the stringer and the order first, and reads the
  order (what it took from the stock, the racket it points at) only then. A change that the phone sends again while the first copy is
  still being made finds the order as the first left it and moves no stock a second time (it gets its `200`, a repeat of a delete its
  `404`), and a repeat that names a racket finds the racket the first one made, and is not a `409`.

**Stock changed by an amount.** `POST /api/rackets/:id/stock` takes `{ "delta": 3, "op_id": "<uuid>" }` (a whole number), and
`POST /api/strings/:id/stock` the same with whole or half sets. They add `delta` to the stock (a negative one takes away) and answer `200` with
the item as `GET` shows it. The new stock is `least(greatest(stock + delta, 0), 100000)`, worked out by one `UPDATE`, so it never goes below
0 or above what a stock may hold (the most that `stock` can be set to), and two changes at the same moment both count. Two devices that change one stock add up,
and do not overwrite each other as they would with the absolute `stock` of a `PATCH`, which still works. `track_stock` is not touched: an item
that is not counted adds up too, and counting it is a `PATCH` of `track_stock`. A client's racket has no stock (`400`, `fields.delta`); an
unknown, removed or another stringer's item is a `404`; `|delta|` is at most 100000 and 0 changes nothing.

`op_id` is a UUID the phone makes up for each change. It is written to `applied_operations (user_id, op_id, created_at)` in the same
transaction as the change, and a request whose key is there already is answered (`200`, the item as it is now) and not applied again, so a
change that is sent twice, or by two requests at the same moment, is made once. A refused request (`400`, `404`) leaves no key.
Keys older than 90 days are deleted when the server starts and every 24 hours after.

**The time of a tap.** `POST /api/orders` and `PATCH /api/orders/:id` take an optional `at`, an ISO 8601 date and time with a `Z` or an offset
(`2026-11-05T09:30:00Z`, `…T11:30:00+02:00`): when the thing was done on the phone. A status that was changed, or an order that was paid,
with no connection is dated by the tap and not by the moment the request got through, so `started_at`, `ready_at`, `completed_at` and
`paid_at` are right, and so is the day that the revenue of the home screen counts a payment in. On a `POST` it is the `created_at` of the
order (and its `paid_at`, when it is sent paid). A moment that is in the future (a clock that is ahead) or more than 90 days ago (a clock that
is wrong) is not believed: the time of the request is used. `updated_at` is always the time of the request. A malformed `at` is a `400` with
`fields.at`.

**Orders with their details.** `GET /api/orders?details=1` (or `true`) gives each order on the page its `services` and `photos` too, as
`GET /api/orders/:id` does, read with one query each for the whole page. Without it the list is as it was. It is how the app loads a copy of
all the orders in a few requests and not one for each.

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

**Railway** (the project `restring-api`: a `Postgres` service and an `api` one, in EU West). Railway builds from the
`Dockerfile` by itself, so nothing else is needed in the repository: `railway.toml` is deprecated (Railway reads it only for
old services, and no longer at all from 2026-12-01), so the settings live in the service. From this folder, with the
[Railway CLI](https://docs.railway.com/cli) signed in (`railway login`):

```bash
railway init --name restring-api                    # the project; links this folder to it
railway add --database postgres                     # the database
railway add --service api                           # the server, empty for now
# The Hobby plan deploys to one region only. A new service also lands in the workspace's default one (US East,
# `iad`), so it is taken out explicitly; the database is moved the same way:
railway service scale --service api iad=0 eu-west=1
railway service scale --service Postgres iad=0 eu-west=1
railway variable set 'DATABASE_URL=${{Postgres.DATABASE_URL}}' --service api --skip-deploys
railway variable set 'APP_URL=https://<the address railway domain gives>' --service api --skip-deploys
railway variable set PORT=4000 --service api --skip-deploys
railway variable set CLIENT_IP_HEADER=x-real-ip --service api --skip-deploys
openssl rand -base64 48 | tr -d '\n' | railway variable set JWT_SECRET --stdin --service api --skip-deploys
railway up . --path-as-root --service api --detach  # the first deploy, and every later one
railway domain --service api --port 4000            # the public address (https://….up.railway.app)
```

The health check (`/api/health`) is set on the service with the API: `serviceInstanceUpdate(… input: { healthcheckPath:
"/api/health", dockerfilePath: "Dockerfile" })` (`railway api '<mutation>'`). `CLIENT_IP_HEADER=x-real-ip` is needed
because Railway does not say how many proxies are in front of the server: its edge overwrites `x-real-ip` with the client's
address, and the limit on login attempts counts by it (see `.env.example`). Without it every request would be counted under
whatever proxy it came through. Railway's Hobby plan blocks outbound SMTP (ports 25, 465, 587), so emails (a password reset)
go out through Resend's HTTPS API: set `EMAIL_FROM_ADDRESS` and, in the dashboard so that it stays out of the shell history,
`RESEND_API_KEY`; the steps are in `../docs/email.md`.

With more than one instance, run `node src/db/migrate.js` as a separate step instead of in the start command.

## Connecting the app

The app talks to this API from `src/lib/api.ts`; sign-in state is in `src/lib/auth.tsx` and the session
token is kept in the keychain (`expo-secure-store`; `localStorage` on the web build).

- **Development:** start the backend (`npm run dev`, port 4000) and the app. The app finds the backend by
  itself: the computer that runs Metro, port 4000, so a phone on the same Wi-Fi works with no setting.
- **Production build:** set `EXPO_PUBLIC_API_URL=https://api.example.com` when building the app.
- **Password reset links** point to `APP_URL/reset-password?token=...`. Mail clients do not make the app's own
  scheme (`systema://`) a link, so `APP_URL` is the public https address of this API, which serves a small page
  at that path (`src/utils/pages.js`): it opens the app's reset screen with the token (`systema://reset-password?token=…`),
  by itself and with a button, in the language the browser asks for (any of the app's nine; Ukrainian otherwise). A universal link (an https address of your own domain that iOS opens in the app
  directly) would skip the page, and is something to add later.

## Not included

Left out because nothing in the app needs them yet: a file store for photos (they are kept in PostgreSQL,
which is enough for a stringer's few photos per order; move them to S3 if that grows), AI calls
(`@anthropic-ai/sdk`), and Restorus' CI pipeline and Terraform, which belong to its AWS account.
