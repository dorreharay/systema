# Веб-версія в інтернеті: myrestring.com

Веб-збірка застосунку (`npx expo export --platform web`, статичний експорт Expo Router) лежить на Railway в окремому сервісі
**`web`** проєкту `restring-api`, поруч із `api`, `Postgres` і `site`. Це контейнер із Caddy, який роздає папку `web/dist`: ті самі
засоби, що й у сайту `tryrestring.com` (`site/`), DNS лишається в Namecheap. Бекенд той самий, що в застосунку на телефоні.

| Адреса | Що |
| --- | --- |
| `https://myrestring.com` | веб-версія (сервіс `web`) |
| `https://api.myrestring.com` | бекенд (сервіс `api`), адреса, яку знає веб-збірка |
| `https://account.myrestring.com` | теж бекенд: сторінка скидання пароля з листів (`APP_URL`) |
| `https://api-production-2cd9.up.railway.app` | теж бекенд: адреса Railway, яку знають уже випущені збірки телефона (не вимикати) |
| `https://web-production-d0c28.up.railway.app` | службова адреса сервісу `web` (CORS її не дозволяє: вхід на ній не працює) |

> **Стан на 6 листопада 2026.** Веб відкривається на `https://myrestring.com`, бекенд на `https://api.myrestring.com`: DNS власник додав, а
> сертифікати Let's Encrypt обох доменів видано того ж дня (`/api/health` відповідає `200`, запит із `https://myrestring.com` проходить CORS).
> Вхід через Google потребує, щоб `https://myrestring.com` був в Authorized JavaScript origins (розділ «Що робить власник»). Справжній вхід і
> роботу з даними на цій адресі перевіряє власник: у production тестових акаунтів ми не створювали.

## Що де

| Що | Де |
| --- | --- |
| Збірка й завантаження на Railway | `scripts/deploy-web.sh` (`--build` лише збирає) |
| Контейнер і налаштування Caddy | `web/Dockerfile`, `web/Caddyfile` (маршрути, заголовки, CSP, кеш) |
| Збірка (не в git) | `web/dist` (`.gitignore` у `web/`) |
| Адреса бекенда, яку знає веб-збірка | `EXPO_PUBLIC_API_URL`; скрипт ставить `https://api.myrestring.com`, якщо змінну не задано |
| Google-клієнт веб-входу | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` з `.env` (скрипт попереджає, якщо його немає в збірці) |

`EXPO_PUBLIC_*` зашиваються в збірку, тож зміна адреси API чи ID клієнта потребує нової збірки (тієї самої команди) **і правки CSP** (нижче).

## Розгорнути (оновити) веб

```bash
scripts/deploy-web.sh
```

Скрипт збирає `web/dist` з адресою бекенда, прибирає службові файли Expo (`_sitemap.html`, `_expo/.routes.json`) і вантажить `web/` на Railway
(`railway up ../web --path-as-root --service web --detach --no-gitignore` із `backend/`, де зв'язано Railway CLI). Збірка контейнера
на Railway займає близько хвилини. Статус: `cd backend && railway service status --service web`.

Відкотити: у Railway → сервіс `web` → Deployments → потрібне розгортання → Redeploy (або знову запустити скрипт зі старого коміту).

## Що налаштовано (6 листопада 2026)

```bash
cd backend
railway add --service web --variables "PORT=8080"                                    # сервіс
railway domain --service web --port 8080                                             # службова адреса web-production-d0c28.up.railway.app
railway domain delete myrestring.com --service api --yes                             # корінь був на api, сертифікат там не видався
railway domain myrestring.com --service web --port 8080                              # корінь на web
railway domain api.myrestring.com --service api --port 4000                          # адреса бекенда
railway variable set "CORS_ORIGINS=https://myrestring.com,https://account.myrestring.com" --service api
```

- Корінь `myrestring.com` у Namecheap вже був ALIAS на Railway, тож після переносу на `web` сертифікат видався одразу й сайт запрацював без
  змін у DNS (Railway розносить запити за іменем хоста). Нову ціль Railway називає `f26fqg99.up.railway.app`; стару
  (`svu9cx2q.up.railway.app`) краще замінити на неї, бо Railway може її колись прибрати (`railway domain status myrestring.com --service web`).
- Усі домени Hobby: два на сервіс. `api`: `account.myrestring.com` і `api.myrestring.com`; `web`: `myrestring.com` і одне вільне місце.
- **CORS.** У production сервер дозволяє браузерам лише `APP_URL`; змінна `CORS_ORIGINS` замінює це типове значення, тому `account.myrestring.com`
  у ній лишився. Телефонний застосунок не зачеплено: нативні клієнти не шлють `Origin`. Перевірка (нічого не змінює):
  `curl -i -X OPTIONS https://api.myrestring.com/api/auth/login -H 'Origin: https://myrestring.com' -H 'Access-Control-Request-Method: POST'`
  має відповісти `204` з `access-control-allow-origin: https://myrestring.com`; для чужого походження заголовка немає.

## Що робить власник

1. **DNS для `api.myrestring.com`** (зроблено 6 листопада; Namecheap → Domain List → Manage → Advanced DNS → Add New Record), два записи:

   | Тип | Host | Value |
   | --- | --- | --- |
   | CNAME Record | `api` | `7q8ofxjz.up.railway.app` |
   | TXT Record | `_railway-verify.api` | `railway-verify=4df6c5e3ac821d3c5e6d5c3d64302f456857f27a51e51f2a0c8d83c9ba9c4486` |

   (Актуальні значення: `cd backend && railway domain status api.myrestring.com --service api`.) Записи Resend (`send`, `resend._domainkey`,
   `rsend`, `_dmarc`), `account` і корінь не чіпайте. Сертифікат з'являється через якийсь час після того, як DNS розійдеться: стан
   `CERTIFICATE_STATUS_TYPE_VALID` у тій самій команді; тоді `https://api.myrestring.com/api/health` відповідає `200`. До цього браузер
   показує `ERR_CERT_COMMON_NAME_INVALID` (див. «Особливості»).

2. **Google.** <https://console.cloud.google.com> → Google Auth Platform → Clients → Web client («re:string server») → Authorized JavaScript
   origins → додати `https://myrestring.com` (схема й хост, без слеша). Докладніше: `docs/web-sign-in.md`, розділ 1. Поки цього немає,
   кнопка Google на веб-версії показує помилку; вхід за поштою працює.

3. **Необов'язково.**
   - `www.myrestring.com`: `railway domain www.myrestring.com --service web --port 8080` і CNAME `www` на ціль, яку надрукує команда (Caddy сам
     переспрямує `www` на корінь).
   - **Телефонний застосунок на `api.myrestring.com`:** `EXPO_PUBLIC_API_URL` в EAS (`production` і `preview`) досі адреса Railway; нові збірки (або
     `eas update`) можна перевести: `npx eas-cli@latest env:update --name EXPO_PUBLIC_API_URL --value https://api.myrestring.com --environment production`
     (і те саме для `preview`). Старі збірки продовжують ходити на адресу Railway, тож її не видаляти. Не зроблено.
   - Apple: Services ID на `myrestring.com` і `EXPO_PUBLIC_APPLE_SERVICES_ID` у збірці, `docs/web-sign-in.md`, розділ 2; файл
     `apple-developer-domain-association.txt` кладуть у `public/.well-known/` (потрапляє у збірку як є).

## Як Caddy розкладає запити (`web/Caddyfile`)

- Файл як є, або з `.html`, або `index.html` папки: `/login` це `login.html`, `/clients` це `clients/index.html`.
- Маршрути з id у адресі: один файл на маршрут, `/orders/<id>` → `orders/[id].html`, `/orders/<id>/edit` → `orders/[id]/edit.html`,
  `/clients/<id>` → `clients/[id].html`, `/rackets/<id>` → `rackets/[id].html`; застосунок читає id з адреси. **Новий маршрут з
  `[id]` потребує свого рядка в `Caddyfile`.**
- Решта: сторінка «не знайдено» застосунку з кодом 404 (`+not-found.html`). Її заголовки ті самі, що в сторінок (фрагмент `hardening`).
- Файли зі зміненим хешем у назві (`/_expo/static/*`, `/assets/*`) кешуються назавжди, сторінки (`no-cache`) завжди питаються наново.
- `www.myrestring.com` → `https://myrestring.com`; `http` → `https`; `X-Robots-Tag: noindex` (застосунок не для пошуку: сайт це `tryrestring.com`).

**CSP** (`Content-Security-Policy` у `Caddyfile`): скрипти лише свої, один inline-скрипт Expo (за хешем `sha256-…`) і скрипт Google
(`accounts.google.com/gsi/client`); стилі свої й inline (React Native for web пише їх так); запити лише до себе, до API
(`api.myrestring.com`) і до `accounts.google.com/gsi/`; фото з API, `data:` і `blob:` (вибір фото); без фреймів.
Перевірено: запит до стороннього сайту блокується, Google проходить, API блокувався лише CORS (до того, як його дозволили). **Що змінити разом із CSP:** інша адреса API →
`img-src` і `connect-src`; хеш inline-скрипта, якщо Expo змінить його текст
(`printf '%s' 'globalThis.__EXPO_ROUTER_HYDRATE__=true;' | openssl dgst -sha256 -binary | openssl base64 -A`; поточний текст видно у
будь-якому `web/dist/*.html`); нова стороння бібліотека → її адреса.

## Особливості, на які натрапили

- **Вхід через Google з веба потребує бекенда з підтримкою `access_token`** (коміт `80942b4` і новіші, міграція `0006`). До 6 листопада 11:23 (+02:00)
  на проді був старіший бекенд, і `POST /api/auth/google` з `access_token` давав `400 «Google token is required»`. Перевірка без акаунтів:
  `curl -s -X POST https://api.myrestring.com/api/auth/google -H 'Content-Type: application/json' -d '{"access_token":"x"}'` має дати
  `401 google_token_invalid`, а не 400. Бекенд розгортають окремо: `cd backend && railway up . --path-as-root --service api --detach`.

- **`net::ERR_CERT_COMMON_NAME_INVALID` на новому домені** (так було з `api.myrestring.com`, коли власник щойно додав DNS): поки Railway не видав
  сертифікат, його межа віддає чужий (типовий), і браузер відмовляє. Це пауза між додаванням DNS і видачею сертифіката, лише чекати
  (у нас сертифікат видали приблизно через 20 хвилин після створення домену на Railway, о 09:11 UTC); стан:
  `railway domain status <домен> --service <сервіс>` (`VALIDATING_OWNERSHIP` → `VALID`), перевірка поза браузером:
  `curl -s -o /dev/null -w '%{http_code} %{ssl_verify_result}\n' https://<домен>/api/health` (`200 0`). Потім жорстке оновлення сторінки.

- `railway up` не вантажить те, що в `.gitignore`, а `web/dist` там є: тому `--no-gitignore`. Без нього збірка контейнера падає на `COPY dist`.
- `RUN rm -f /srv/_sitemap.html` у `Dockerfile` файл не прибрало (він лишився доступним), тому службові файли скрипт видаляє до завантаження.
- Railway CLI у `backend/` прив'язаний до одного сервісу (зараз `site`), тож завжди з `--service web` (або `api`, `site`): `railway up` без нього піде туди,
  куди прив'язано.
- Лист для скидання пароля веде на `account.myrestring.com/reset-password?token=…`: це сторінка бекенда, яка відкриває **застосунок** через
  `systema://`. Людині, що користується лише веб-версією, вона веб-версії не покаже. (Веб-версія має маршрут `/reset-password`, але лист на
  нього не веде: окреме рішення, і зроблено не було.)
- Токен сесії веб-версії лежить у `localStorage`, дані (кеш і черга змін) в IndexedDB: це браузер того, хто користується.
- Вартість: сервіс статичний (Caddy, кілька десятків МБ пам'яті); на Hobby це центи на місяць понад уже оплачені сервіси.
