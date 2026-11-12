# Studio: several people in one workshop

What of the Studio concept (the deck «Studio: концепція і дизайн», 2026-11-12) is in the code, how it is built, how to try it, and what is
deliberately not there yet. Prices, the store and the plans themselves are in [subscriptions.md](subscriptions.md).

**State on 2026-11-12: stage 1 («Команда») is built and tested, behind a switch that is OFF.** Without `STUDIO_ENABLED=true` (and
`BILLING_ENABLED=true`) the server has no team routes, no invitations and no seats, and the app shows the Studio page as the waiting list it
was. Nothing was deployed, committed or sent to a store. The concept itself says «не будувати без 20 записів або 3 пілотів»; this was built on
the owner's explicit request, so the switch is what keeps that decision open: it is not turned on anywhere.

## What stage 1 is

| In | Not in (stage 2 and later, or not decided) |
|---|---|
| A workshop of up to 3 people (owner + 2), the seats counted with the invitations that are waiting | Rates, payouts, PDF of the report (the deck puts payouts in the second version; accepted) |
| Roles Owner, Master, Receptionist (no «Адміністратор») | Push notifications about assignments, the journal of actions, the web panel |
| Invitation by a code and a link, one use, 7 days, the role set when it is made | A QR code (needs a camera/QR native module, so a new build); universal links (the link opens the website's `/join`) |
| Shared clients, rackets, strings, price list, stock; one order counter | Several workshops per person with a switcher: a person is in at most one workshop of someone else at a time |
| Who took an order in and who strings it; the queue, «Мої», «Без виконавця», «Взяти», «Віддати» | Moving the ownership of a workshop to another account |
| The month report by person (orders, revenue by date paid, average time in work) | Export of the data (CSV) |
| Studio ends: three days of grace, then the workshop is paused for the others, nothing is lost | Rows with versions for two people editing the same order at once (the server serialises changes to one order; the last one wins) |
| Only the owner buys (App Store, as Pro); members buy nothing | Web payment (Apple rule 3.1.3(c): Studio is sold only in the app) |

## The idea in the code: the workshop is the owner's account

The deck planned a `workshop_id` on every table. What is built is smaller and has the same effect: **the data of a workshop stays under
the owner's account** (`user_id` on every table is the owner's id), and a person who works in someone else's workshop is a row of
`workshop_members` that points at that owner. `requireAuth` sets two things on a request:

- `req.user`: who is signed in (the person, for «who did it»);
- `req.workshop`: `{ ownerId, owner, role, member, paused }` (`utils/workshop.js`). Every route that reads or writes the data filters by
  `req.workshop.ownerId`, never by `req.user.id`; settings, plan and the order counter are the owner's (`req.workshop.owner`).

A person who is in nobody's workshop is the owner of their own, a workshop of one, and nothing about them changed: Free and Pro work as
before. Why not `workshop_id` everywhere: it is a rewrite of every query and a data migration with no gain at this stage; if ownership
transfer or several memberships are ever needed, `workshop_members` and `ownerId` are the seam to build them on.

A person who joins someone's workshop sees that workshop's data. **Their own account's data stays as it was, untouched, and comes back
when they leave.** The phone keeps one offline copy per account, so joining and leaving make it read the server again; both are refused
on the phone while changes are waiting to be sent (they would go to the other workshop).

## Roles (enforced by the server, `utils/workshop.js` and the routes)

| | Owner | Master | Receptionist |
|---|---|---|---|
| See orders | all | their own and the queue (unassigned and not completed) | all |
| Take an order in / change it | any | creates it for themselves; changes only their own | any |
| Delete an order | yes | no | yes |
| Give an order to someone | any master or themselves, or back to the queue | takes a free one for themselves, lets go of their own; a second master reaching for it gets 409 `order_taken` | no |
| Clients, client rackets | yes | yes | yes |
| Catalog (rackets/strings in stock), stock counts, price list | yes | no (orders still take from the stock) | no |
| Month overview, `/api/insights` | yes | no | no |
| Report by person | everyone, with totals | their own line | no |
| Team, invitations, workshop settings (currency, time zone, units, name) | yes | no | no |
| Plan, purchases | yes | no (the plan shown is the workshop's) | no |

The receptionist sees the price of each order (they take the money) but never the money of the month. Interpretation, not stated in the deck:
there is no purchase price in the data at all, so «ціни закупівлі» has nothing to hide yet.

A member of a **paused** workshop (its owner's Studio plus the days of grace is over) can read everything and write nothing: 403
`workshop_paused`. The owner carries on with whatever plan they have, and the team comes back untouched on renewal.

When a person is taken out, or a master is made a receptionist, the orders they had in work go back to the queue; the finished ones keep
their name for the report. Their access ends with their next request.

## Data (migration `0012_studio_team`)

- `workshop_members(owner_id, user_id UNIQUE, role)`: master or receptionist. The owner is not a row.
- `workshop_invites(owner_id, role, code_hash UNIQUE, expires_at)`: only the hash of the code is kept; the row goes when the code is used or
  taken back; an invitation that ran out takes no seat and is cleared when the owner opens the team.
- `orders.accepted_by_id`, `orders.assignee_id`, `orders.assigned_at`: the people, `ON DELETE SET NULL`. Existing orders were given
  `accepted_by_id = user_id` by the migration. An order in a workshop of one never has an assignee.

## API (`routes/team.js`, `routes/orders.js`)

All of `/api/team` is 404 unless Studio is on at the server. Errors carry `code`.

| Request | Who | Notes |
|---|---|---|
| `GET /api/team` | anyone in the workshop | people, seats `{limit, used}`, `can_invite`, `invites` (owner only), `workshop.paused` |
| `POST /api/team/invites {role}` | owner on Studio | 201 with the code once (`ABCDE-FGHJK`, no 0/O/1/I/L) and the link; 402 `studio_required`; 409 `no_seats` |
| `DELETE /api/team/invites/:id` | owner | takes it back |
| `PATCH /api/team/members/:id {role}` | owner | `id` is the membership id from the list |
| `DELETE /api/team/members/:id` | owner | |
| `POST /api/team/preview {code}` | any signed-in person | whose workshop and what role; 404 `invite_invalid` |
| `POST /api/team/join {code}` | any signed-in person | 409 `own_workshop`, `already_member`, `studio_inactive`, `has_team`; answers with the account |
| `POST /api/team/leave` | a member | answers with the account |
| `GET /api/team/report?month=YYYY-MM` | owner, master | the month in the workshop's time zone; money as the overview counts it (the day an order was paid); average hours from «in progress» to «ready» |
| `POST /api/orders/:id/assign {assignee_id}` | owner, master | `null` is the queue; 409 `order_taken`; idempotent |
| `GET /api/orders?assignee=me\|none\|<id>` | | filters on top of the role's own visibility |

`GET /api/auth/me` (and every answer that carries the user) now has `workshop` `{owner_id, role, member, name, owner_name, paused, team}`
and, in `subscription`, `studio_available`, `team`, `seats` (and `member: true` for someone in another's workshop, whose `subscription` is
the workshop's). A member shows the workshop's currency, time zone and unit, has `setup_completed: true`, and may change only their own
name, language and notifications (403 `forbidden_role` on the rest). Strings and catalog rackets carry `last_used` (`order_number`, `at`,
`by`) in a workshop that has a team.

Orders carry `accepted_by`, `assignee` (`{id, name}`, never an address) and `assigned_at`.

## In the app

- **Offline layer** (`src/lib/offline/`): orders carry `accepted_by`, `assignee`, `assigned_at`; a new operation `order.assign` (works without a
  connection, ordered after the order's own create); a new order is made for the person at the phone (a master's is theirs, a receptionist's goes
  to the queue). A refused assignment (`order_taken`, `forbidden_role`) is taken out of the queue and shown, not replayed. Joining or leaving a
  workshop makes the phone read the server again; both are refused while changes wait to be sent.
- **Screens**: Team (`team.tsx`: seats, people, role and removal for the owner, waiting invitations, leave for a member), the invitation sheet (role,
  code shown once, Copy and Share), Join (`join.tsx`: code, check, join; `?code=` is read), Settings rows «Команда» and «Приєднатися до
  майстерні», the Studio page (the waiting list while Studio is not available; with it: «Studio is on» for the owner, redirect to the team for a
  member, the purchase for anyone else), the subscription page for a member (the workshop's plan, nothing to buy).
- **Orders**: chips «Усі / Мої / Без виконавця» (a master starts on «Мої»), the performer on each card and in the wide table, the «Люди» block on the
  order page with «Взяти», «Віддати» (owner: a picker of the owner and the masters) and «Повернути в чергу», a master's read-only view of an order
  that is not theirs. «Команда сьогодні» on the owner's home (from local data) and a compact «Мої / черга» for a master; the report screen
  (`team-report.tsx`, cards on the phone, a table on wide screens, a month switcher).
- **Roles and the paused workshop** in the screens: catalog, stock and price list editing hidden for the others, delete hidden for a master, the
  plan strip, the «Month overview is in Pro» card and the limit sheet never shown to a member, a banner and read-only forms while paused.
- **Texts**: nine languages; the seven besides Ukrainian and English are machine drafts no native has read. The names of the roles are the most
  doubtful words (Master is the stringer of the file's own word in each language).

Checked on screens (2026-11-12) against a local server with Studio on: on the iPhone 17 Pro simulator the owner's home, the orders list, the give
picker, the Team screen and the invitation sheet; on the web build at phone width the master (home, queue and «Take», another's order read-only,
settings, own report), the receptionist (join by code from the preview card to the home, all orders without Take or Give, the team read-only,
the stock), the owner (report, Studio page, order page with «Give to», the new order form with «Who strings it», the history lists with «Give»),
a paused workshop (banner, no «New order»), a Free account (the Studio page says it is bought in the iPhone app), and at desktop width the orders
table with the performer, the team and the report. **Not looked at on a screen:** a master's and a receptionist's views on the simulator, the
Studio purchase in the app (the store was never connected), the invitation sheet's Share and Copy on a device.

## Known gaps

- `https://myrestring.com/join?code=...` opens in the app only when it is opened by hand: universal links are not set up. The code is kept through
  sign-in, sign-up, email confirmation and setup for 7 days (`pending_join_code`), and the code typed in Settings works too.
- `last_used` («Last: name, order N») is on the catalog cards only, not on the racket page.
- The master's home has the two tiles in the middle of the white block, with empty room above and below.

## Settings of the server

| | Default | |
|---|---|---|
| `STUDIO_ENABLED` | `false` | Studio exists. Needs `BILLING_ENABLED=true`; otherwise it is only the waiting list. |
| `STUDIO_SEATS` | `3` | People in a workshop, the owner included. |
| `STUDIO_INVITE_DAYS` | `7` | How long an invitation lives. |

The entitlement `studio` (`REVENUECAT_STUDIO_ENTITLEMENT`) and its prices are in [subscriptions.md](subscriptions.md); it needs the
`studio` offering in RevenueCat for the app to sell it.

## Trying it locally

Use the plans stack of [subscriptions.md](subscriptions.md) (a separate database and port 4001), add `STUDIO_ENABLED=true`, and give the
owner Studio by hand:

```bash
PORT=4001 DATABASE_URL=postgresql://$(whoami)@localhost:5432/systema_plans_check DATABASE_SSL=false \
  BILLING_ENABLED=true BILLING_DEV_GRANTS=true STUDIO_ENABLED=true node src/index.js
# as the owner: POST /api/billing/dev-grant {"plan":"studio"}, then POST /api/team/invites {"role":"master"}
# as a second account: POST /api/team/join {"code":"ABCDE-FGHJK"}
```

Automatic: `cd backend && npm test` (the group «Team» has the rules above; `tests/unit/workshop.mjs` the codes),
`node scripts/test-offline.mjs` (the `order.assign` operation).

## Before it is turned on for anyone

1. The pilot condition of the deck: 20 sign-ups or 3 workshops (the list is read with `studio:interest`, see the website form).
2. The store: a Studio subscription group with the two products and the `studio` entitlement and offering in RevenueCat, and a new native
   build (see subscriptions.md); the app has never bought Studio in a real sandbox.
3. The privacy policy and terms mention a workshop of several people, shared client data and removal of a person; they are in nine languages
   on the website (`check-legal.mjs`) and were not touched.
4. An export of the data (the deck: «експорт доступний завжди») is not built.
5. Texts in the eight languages other than Ukrainian and English are machine drafts, as everywhere (`scripts/check-i18n.mjs`).
