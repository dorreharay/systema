# Вхід через Google та Apple у веб-версії

Веб-збірка застосунку (`npx expo start --web`, `npx expo export --platform web`) входить так само, як застосунок на телефоні:
кнопки Apple та Google на екранах входу й реєстрації, той самий бекенд, ті самі правила акаунтів. Нативні бібліотеки
(`@react-native-google-signin/google-signin`, `expo-apple-authentication`) у браузері не працюють, тому веб користується
бібліотеками самих Google та Apple. Нових пакетів і нативних змін немає, тож нова збірка застосунку не потрібна.

> **Стан на 5 листопада 2026.** Код написано й перевірено на підставних Google та Apple (тести бекенду, запуск у браузері).
> **Google** вмикається одразу, щойно в консолі Google додано адресу сторінки (розділ 1). **Apple** вимкнений, доки не задано
> `EXPO_PUBLIC_APPLE_SERVICES_ID`: йому потрібна публічна https-адреса, на localhost він не працює (розділ 2). Справжній вхід
> через Google чи Apple ще ніхто не пробував: вікна Google і Apple відкриваються лише від справжнього кліку людини, тож у
> перевірці їх замінювали підставні. Справжні бібліотеки завантажувалися, а натискання на кнопки доходило до бібліотек Google і
> Apple (вікно відкривалось, коли клік людський).

## Як це влаштовано

1. На екранах входу й реєстрації веб-збірка завантажує скрипт провайдера (Google: `accounts.google.com/gsi/client`, Apple:
   `appleid.cdn-apple.com/…/appleid.auth.js`). Лише там, де є кнопки, і лише в браузері; у телефонний бандл вони не
   потрапляють.
2. **Google.** Кнопка та сама, що в застосунку (темний квадрат 54×54 із «G», звичайна кнопка сторінки). Натискання викликає
   `requestAccessToken` бібліотеки Google (режим *token model*, зроблений саме для сторінок зі своєю кнопкою) у вікні Google з
   вибором акаунта. Бібліотека віддає **access-токен**, а не ID-токен, як телефон: ID-токен сторінка отримує лише через кнопку,
   яку малює сама Google, а така кнопка не придатна. Спроба покласти її прозорою на нашу не працює: на комп'ютері Google малює
   її в iframe, який відмовляється від натискань, якщо його не видно (захист від клікджекінгу); на телефонному розмірі кнопка
   інша, тому там усе виглядало б справним. Бекенд питає в Google про access-токен (`oauth2.googleapis.com/tokeninfo`: кому
   виданий; `…/userinfo`: імʼя) і приймає його лише тоді, коли він виданий **одному з наших клієнтів** (`GOOGLE_CLIENT_IDS`,
   той самий Web client ID, що й для телефона); без цієї перевірки токен із будь-якого іншого застосунку впустив би будь-кого.
3. **Apple.** Кнопку Apple для сторінки бібліотека Apple не малює меншою за 130 px завширшки, тож квадратну 54×54 малюємо самі
   (біла, з чорним логотипом; справжній `<button>`, тож клавіатура й скрінрідер працюють). Натискання викликає
   `AppleID.auth.signIn()` у вікні Apple, і це відбувається в самому кліку: браузер відкриває вікно лише з дії людини.
   Токен Apple виданий не на bundle ID застосунку, а на **Services ID** веб-входу, тому бекенд мусить знати й його
   (`APPLE_CLIENT_IDS`).
4. Далі те саме, що в застосунку: бекенд перевіряє токен, знаходить або створює акаунт (за тими самими правилами: той самий
   підтверджений email дає той самий акаунт, пароль при цьому видаляється, відкриті сесії завершуються), нового акаунта
   створює **мовою застосунку** і віддає токен сесії. Веб тримає його в `localStorage`.
5. Apple дає один і той самий `sub` для застосунку й для веб-входу (він один на команду), тому людина, яка зареєструвалась на
   телефоні, потрапляє в той самий акаунт у браузері, і навпаки.

| Що | Де |
|---|---|
| Завантаження скриптів | `src/lib/load-script.ts` |
| Google: бібліотека й вікно входу (кнопка спільна з телефоном) | `src/lib/google-sign-in.web.ts`, `src/components/google-sign-in-button.tsx` |
| Apple: бібліотека й кнопка | `src/lib/apple-sign-in.web.ts`, `src/components/apple-sign-in-button.web.tsx`, `src/components/icons/apple-icon.tsx` |
| Бекенд: перевірка access-токена Google | `verifyGoogleAccessToken` у `backend/src/utils/google.js`, `POST /api/auth/google { access_token }` |
| Бекенд: аудиторії Apple, обмін коду й відкликання токена тим client_id, на який Apple видала код | `backend/src/utils/apple.js`, `backend/src/routes/auth.js`, колонка `users.apple_client_id` (міграція `0006_apple_web_client`) |

| Змінна | Де | Значення |
|---|---|---|
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | `.env` (уже є) | Web client ID. Без нього кнопки Google у вебі немає |
| `EXPO_PUBLIC_APPLE_SERVICES_ID` | `.env`, або змінна середовища під час `expo export` | Services ID, напр. `com.velar.restring.web`. Без нього кнопки Apple у вебі немає |
| `GOOGLE_CLIENT_IDS` | Railway, `backend/.env` | Web client ID вже там. Інших ID не треба. Сервер має виходити в інтернет до `oauth2.googleapis.com` і `openidconnect.googleapis.com` |
| `APPLE_CLIENT_IDS` | Railway, `backend/.env` | `com.velar.restring,com.velar.restring.web`: bundle ID **першим**, Services ID другим |

Усі ці значення публічні (вони й так лежать у зібраному застосунку). Секретів у цьому розділі немає; `.p8` ключ Apple, як і
раніше, лише у вас і на Railway.

## 1. Google (≈ 3 хв, працює на localhost)

Той самий Web client, що й для застосунку («re:string server», його ID у `.env`), треба дозволити для адрес веб-сторінки.

1. <https://console.cloud.google.com> → проєкт `re:string` (угорі має бути вибраний саме він).
2. ☰ → **Google Auth Platform** → **Clients** → клієнт типу **Web application** («re:string server»; його ID закінчується на
   `…71760.apps.googleusercontent.com`).
3. У блоці **Authorized JavaScript origins** → **Add URI**. Додайте:
   - `http://localhost` і `http://localhost:8081` (обидві: Google так вимагає для перевірок на комп'ютері);
   - адресу веб-версії, коли вона з'явиться, напр. `https://app.tryrestring.com` (лише схема й хост, без шляху та без `/` в кінці).
4. **Save**. Зміна діє від кількох хвилин до кількох годин.
5. **Authorized redirect URIs** не чіпайте й не додавайте: вхід іде через вікно, яке Google відкриває сама, а не через
   перенаправлення на нашу адресу.

Перевірка: `npx expo start --web`, **`http://localhost:8081/login`** (саме `localhost`, не `127.0.0.1` і не IP у мережі: це інше
походження, Google його не прийме) → кнопка Google → вікно Google з вибором акаунта → екран першого налаштування. Якщо вікно
показує «Помилка 401: invalid_client … no registered origin», адреси ще немає в *Authorized JavaScript origins* цього клієнта
(або зміна ще не набула чинності). Вийти й увійти знову: акаунт той самий.

> Окремий веб-клієнт не потрібен. Якщо ви все ж захочете окремий (наприклад, щоб не змішувати адреси), створіть ще один
> Web client, додайте його ID у `GOOGLE_CLIENT_IDS` на Railway **й** у `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` веб-збірки; нативні
> збірки лишаються при старому.

## 2. Apple (потрібна https-адреса веб-версії)

Бібліотека Apple приймає лише зареєстровані в Apple домени з https, `localhost` і IP-адреси вона не приймає. Тому спершу
потрібна адреса, на якій веб-версію справді відкривають (розділ 3). Для прикладу нижче це `app.tryrestring.com`, а Services
ID `com.velar.restring.web`; підставте свої.

Знадобиться платний акаунт розробника (він є) і, щоб видалення акаунта відкликало токен Apple, ключ із
`docs/apple-sign-in.md` (розділ 3 там). **`.p8` у чат не надсилайте.** Окремий ключ для веб-входу не потрібен: той самий
ключ працює для Services ID, який згруповано з тим самим App ID.

1. <https://developer.apple.com/account> → **Certificates, Identifiers & Profiles** → **Identifiers** → **+** → **Services IDs**
   → **Continue**.
2. *Description*: `re:string Web`. *Identifier*: `com.velar.restring.web`. **Continue** → **Register**.
3. Відкрийте щойно створений Services ID, увімкніть **Sign in with Apple** і натисніть **Configure**:
   - *Primary App ID*: `com.velar.restring` (саме з ним згруповано Services ID: так той самий ключ і той самий користувач Apple);
   - *Domains and Subdomains*: хост без `https://`, напр. `app.tryrestring.com`;
   - *Return URLs*: `https://app.tryrestring.com/` (**із косою рискою в кінці**: сторінка передає саме `адреса/`, а Apple порівнює
     рядок у рядок);
   - **Next** → **Done** → **Continue** → **Save**.
4. Якщо портал просить перевірити домен (кнопка **Download** і **Verify**): завантажте файл
   `apple-developer-domain-association.txt`, покладіть його в `public/.well-known/` проєкту (з `public/` він потрапляє у
   веб-збірку як є), опублікуйте веб-версію й натисніть **Verify**. Файл має віддаватися за
   `https://<домен>/.well-known/apple-developer-domain-association.txt` напряму, без перенаправлень (Apple їх не слідує).
5. **Railway** → сервіс `api` → Variables: `APPLE_CLIENT_IDS=com.velar.restring,com.velar.restring.web` (bundle ID першим!).
   Сервер перезапуститься сам. Лише після цього токен із Services ID буде прийнято.
6. **Веб-збірка**: `EXPO_PUBLIC_APPLE_SERVICES_ID=com.velar.restring.web` (у `.env` або перед `npx expo export`).

Перевірка: на https-адресі екран входу → кнопка Apple → вікно Apple → підтвердити. Новий акаунт потрапляє на екран першого
налаштування, мова така, як була в застосунку.

## 3. Де житиме веб-версія

Рішення за вами. Усі варіанти дають https-адресу, яку потрібно додати і в Google (розділ 1), і в Apple (розділ 2).

| Варіант | Як | Плюси й мінуси |
|---|---|---|
| **EAS Hosting** (`https://<назва>.expo.app`) | `npx expo export --platform web`, потім `npx eas-cli@latest deploy` (див. [Expo Hosting](https://docs.expo.dev/eas/hosting/introduction/)) | Без DNS і без нового сервісу. Адреса стабільна лише в «production»-аліасу (кожне розгортання ще має власну адресу з суфіксом, її в Apple не реєструйте). Власний домен лише на платних планах |
| **`app.tryrestring.com` на Railway** | Окремий сервіс зі статичною веб-збіркою (як `site/`, Caddy) і CNAME у Namecheap | Ваш домен, найближче до фінального вигляду; більше роботи, і на плані Hobby обмежена кількість доменів |
| Тимчасовий тунель | ngrok зі статичним доменом | Лише для перевірки; веб-збірка потребує окремих налаштувань адреси API |

Що ще потрібно для будь-якого варіанта, коли веб-версія вийде в інтернет:

- Збирати з адресою API: `EXPO_PUBLIC_API_URL=https://api-production-2cd9.up.railway.app npx expo export --platform web`
  (без неї збірка не знає, куди слати запити; `dev`-режим бере `localhost:4000`).
- На Railway дозволити цю адресу для CORS: `CORS_ORIGINS=https://app.tryrestring.com`. У продакшені за замовчуванням
  дозволена лише `APP_URL` (адреса листів), тож без цього браузер заблокує всі запити веб-версії.
- Додати адресу в Google (розділ 1) і в Apple (розділ 2).
- Додати суворий **CSP** (див. «Безпека»).

## Безпека

Токен сесії веб-версії лежить у `localStorage`, а його читає будь-який скрипт сторінки. Скрипти Google та Apple виконуються
на сторінці, тому ми їм довіряємо. Тому:

- вони вантажаться тільки на екранах входу й реєстрації, а не на кожній сторінці;
- веб-версію не слід підключати до жодних інших сторонніх скриптів (аналітика, чати тощо);
- на хості веб-версії варто задати суворий CSP, який дозволяє скрипти лише з власного домену та з `accounts.google.com` і
  `appleid.cdn-apple.com`. Для бібліотеки Google її довідка називає `script-src https://accounts.google.com/gsi/client`,
  `frame-src` і `connect-src https://accounts.google.com/gsi/` та `style-src https://accounts.google.com/gsi/style`
  ([розділ «Content Security Policy»](https://developers.google.com/identity/gsi/web/guides/client-library)); наш режим
  (вікно без iframe) потребує, найімовірніше, лише першого. Що потрібно Apple і що з цього зайве, перевірте в консолі браузера
  (помилки CSP там видно), коли CSP буде що перевіряти.

## Типові помилки

| Що видно | Причина | Що робити |
|---|---|---|
| Вікно Google: «Помилка 401: invalid_client … no registered origin» або `origin_mismatch` | Адреси сторінки немає серед *Authorized JavaScript origins* цього клієнта (або вона записана інакше: інший порт, `https`, `/` в кінці) | Розділ 1; зачекайте до кількох годин; відкривайте саме `http://localhost:8081` |
| Після натискання Google з'являється «Не вдалося увійти через Google» | Браузер заблокував вікно (так робить і Browser pane, коли клік не людський), або скрипт Google не завантажився (немає мережі, блокувальник реклами) | Дозвольте вікна для сайту, вимкніть блокувальник і натисніть ще раз: сторінка завантажить скрипт знову |
| Закрили вікно Google, нічого не вибравши | Це не помилка | Нічого |
| «Google не підтвердив цей вхід» (401 `google_token_invalid`) | Токен виданий не нашому клієнту: Web client ID у веб-збірці й у `GOOGLE_CLIENT_IDS` різні. Або токен прострочений | Звірте обидва |
| «Помилка на сервері» (503 `google_unavailable`) | Сервер не дістається Google (`oauth2.googleapis.com`, `openidconnect.googleapis.com`) | Мережа/DNS сервера; у логах `[google] Could not check an access token` |
| «Google не підтвердив пошту цього акаунта» (403 `google_email_unverified`) | У акаунті Google пошта не підтверджена | Підтвердити в Google або увійти паролем |
| Кнопки Apple у вебі немає | Не задано `EXPO_PUBLIC_APPLE_SERVICES_ID` (змінні вшиваються під час збирання: `npx expo start --clear`) | Розділ 2, крок 6 |
| Вікно Apple з помилкою `invalid_request` / «Invalid redirect URI» | Return URL у Services ID не збігається зі сторінкою (порівнюється рядок у рядок, з `/` в кінці) | Розділ 2, крок 3 |
| Вікно Apple зникає без відповіді, а вхід не відбувається | Адреса сторінки не збігається з Return URL за походженням (схема, хост, порт) | Розділ 2, крок 3; на localhost не працює |
| «Не вдалося увійти через Apple» одразу після натискання | Браузер заблокував вікно (`popup_blocked_by_browser`); у dev-режимі це видно в консолі | Дозвольте вікна для сайту |
| «Apple не підтвердив цей вхід» (401 `apple_token_invalid`) | У `APPLE_CLIENT_IDS` на сервері немає Services ID, або його написано інакше | Розділ 2, крок 5 |
| Вхід працює, але в Apple ID після видалення акаунта re:string лишається; у логах `[apple] Could not trade an authorization code: 400 invalid_grant` | Код обмінюється не тим client_id, на який виданий, або Services ID не згруповано з тим App ID, для якого створено ключ | Розділ 2, кроки 3 і 5; ключ має бути для `com.velar.restring` |
