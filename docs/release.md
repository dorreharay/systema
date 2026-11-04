# Реліз застосунку через Expo (EAS): від збірки до App Store

Усе, що можна було налаштувати в коді, вже налаштовано: профілі збірок, номери версій, оновлення без магазину. Лишилося те,
що робиться тільки у ваших акаунтах (Apple, Expo) і потребує входу з двофакторною автентифікацією. Нижче все по кроках.
Орієнтовно 1–2 години до першої збірки в TestFlight, не рахуючи розгортання бекенда.

## Що вже налаштовано

| Що | Де | Навіщо |
|---|---|---|
| Профілі збірки `preview` і `production` | `eas.json` | `production` іде в App Store і Google Play, `preview` ставиться на телефони тестувальників |
| Номери збірок на сервері Expo | `eas.json`: `appVersionSource: remote`, `autoIncrement` | `buildNumber` (iOS) і `versionCode` (Android) ростуть самі, правити їх руками не треба |
| Оновлення без магазину (EAS Update) | `app.json`: `updates`, `runtimeVersion`; пакет `expo-updates` | виправлення в JavaScript доходять до користувачів за хвилини, без нової перевірки Apple |
| Версія pnpm, як у вас | `eas.json`: `base.pnpm` | сервер ставить залежності так само, як ви: `pnpm-workspace.yaml` написано для нової версії pnpm |
| Шифрування лише стандартне (HTTPS) | `app.json`: `ios.config.usesNonExemptEncryption` | App Store Connect не питає про експортну відповідність у кожній збірці |
| Збірка без адреси бекенда не стартує | `app.config.js` | `preview` і `production` без `EXPO_PUBLIC_API_URL` зупиняються одразу, а не після відправки в магазин |

Ще видалено застарілий `package-lock.json` у корені проєкту. Поряд із `pnpm-lock.yaml` він змушував і `expo install`, і EAS
обирати npm, а в ньому немає частини пакетів. `backend/package-lock.json` не чіпали: бекенд на npm.

## Що потрібно від вас

1. **Apple Developer Program** (99 $ на рік). **Вже є:** платна програма діє на команді `SGMN4DGZ42` («Andrii Didkivskyi»).
   Її ID не змінився після вступу, тому `appleTeamId` в `app.json` правильний. Без програми TestFlight і App Store недоступні.
2. **Бекенд в інтернеті за HTTPS.** Застосунок із магазину не знайде ваш Mac, а iOS забороняє звичайний `http://`. **Це
   вже зроблено:** бекенд працює на Railway (проєкт `restring-api`, регіон EU West, план Hobby за 5 $ на місяць) за адресою
   `https://api-production-2cd9.up.railway.app`. Як його розгорнуто й оновлюється, описано в розділі «Deploying»
   в `backend/README.md`. Оновити бекенд: `cd backend && railway up . --path-as-root --service api --detach`.
3. **Закомічений код.** EAS збирає з git, а не з вашої папки: що не закомічено, у збірку не потрапить. Якщо є незакомічені
   зміни, `eas build` запропонує закомітити їх сам.

## Крок 1. Сказати збіркам, де бекенд

**Зроблено (4 листопада 2026):** змінну `EXPO_PUBLIC_API_URL` задано в EAS для середовищ `production` і `preview`, значення
`https://api-production-2cd9.up.railway.app`. Адреса не секрет (вона все одно опиняється в застосунку), тому це звичайна
змінна. Коли адреса зміниться (наприклад, з'явиться власний домен), виконайте команду ще раз із новим значенням, вона
оновлює змінну:

```bash
npx eas-cli@latest env:set --name EXPO_PUBLIC_API_URL --value https://api-production-2cd9.up.railway.app --environment production --environment preview --visibility plaintext
```

Перевірити: `npx eas-cli@latest env:list --environment production`. Для `preview` можна вказати окремий бекенд для тестів. Зміна
адреси потребує нової збірки (або `eas update`, крок 4): застосунок читає її під час збірки.

Змінні самого бекенда (`APP_URL`, `JWT_SECRET`, `DATABASE_URL` та інші) вже задані в Railway, див. `backend/README.md`. Листи
(скидання пароля) бекенд надсилає через Resend: що ще зробити у ваших акаунтах (домен, ключ), описано в `docs/email.md`.

## Крок 2. Перша збірка в TestFlight (iOS)

> **Потрібна платна Apple Developer Program, і вона є.** До вступу команда `SGMN4DGZ42` була безкоштовним Personal Team: профіль
> Xcode для `com.velar.restring` діяв 7 днів (у платної програми 365), а сертифіката розповсюдження в ній не було. Xcode може
> ще кешувати стару інформацію про команду («Personal Team», короткі профілі): вона оновиться після повторного входу в акаунт
> у Xcode. Першу збірку для TestFlight EAS зібрав 4 листопада 2026 (buildNumber 2): сертифікат і профіль він створив і зберіг
> сам, для наступних збірок вхід в Apple не потрібен, доки вони чинні. Що збирати без платної програми, описано нижче, в розділі
> «Збірка без платного Apple-акаунта».

Найпростіше однією інтерактивною командою. Вона зв'яже проєкт з Expo, попросить увійти в Apple ID (з кодом двофакторної
автентифікації), створить сертифікат і профіль, збере застосунок, створить ключ App Store Connect і відправить збірку в
TestFlight:

```bash
npx testflight
```

Те саме вручну, коли треба керувати кожним кроком:

```bash
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios --profile production --latest
```

Або збірка з відправкою одразу: `npx eas-cli@latest build --platform ios --profile production --auto-submit`.

Збірка триває 15–30 хвилин (на безкоштовному плані Expo є місячний ліміт збірок і довша черга). Потім Apple ще 10–15 хвилин
обробляє її, і вона з'являється в App Store Connect → TestFlight. Внутрішні тестувальники (учасники вашої команди в App Store
Connect) бачать її одразу, без перевірки Apple. Поставте на телефон застосунок «TestFlight» і пройдіть увесь шлях:
реєстрація, вхід, замовлення, фото.

Збірка `preview` для iOS ставиться інакше: телефон спершу реєструють в Apple (`npx eas-cli@latest device:create`), тоді
`build --platform ios --profile preview`. Для iPhone зазвичай простіше TestFlight.

## Збірка без платного Apple-акаунта

Для iOS-симулятора акаунт Apple не потрібен. Профіль `simulator` збирає готовий застосунок без Metro, який дивиться на бекенд
з Railway (адресу бере із середовища `preview` в EAS):

```bash
npx eas-cli@latest build --platform ios --profile simulator
npx eas-cli@latest build:run --platform ios --latest     # ставить останню збірку на симулятор і запускає
```

Такий застосунок не ставиться на телефон. На власний iPhone його, як і раніше, можна поставити з Xcode (безкоштовний
сертифікат розробника, 7 днів). Для Android профіль `preview` дає APK, який ставиться на телефон без акаунта Google Play: під
час першої збірки EAS спитає, чи створити ключ підпису, відповідайте «так».

## Крок 3. Випуск у App Store

Перед відправкою на перевірку:

- [x] **Видалення акаунта в застосунку** (вимога Apple для всіх застосунків із реєстрацією, Guideline 5.1.1(v)). Воно є:
  Налаштування → Акаунт → Видалити акаунт. Застосунок просить пароль і стирає акаунт разом з усім, що в ньому: клієнтами,
  ракетками, струнами, послугами, замовленнями й фото (`POST /api/auth/delete-account`). Вкажіть це місце в App Review
  Information → Notes, щоб рецензент не шукав.
- [ ] **Політика конфіденційності й умови користування.** Сторінки є на сайті (папка `site/`, докладно в `site/README.md`):
  <https://tryrestring.com/privacy/> і <https://tryrestring.com/terms/>, англійською `/en/privacy/` і `/en/terms/`. У застосунку
  посилання є: Налаштування → «Політика конфіденційності» і «Умови користування», а на екрані реєстрації рядок під кнопкою
  (вони відкривають сторінку мовою застосунку; код у `src/lib/legal.ts`). Лишається вписати адреси в App Store Connect
  (таблиця «Адреси в App Store Connect» у `site/README.md`) і **зняти пароль із сайту** (змінна `SITE_PASSWORD_HASH` у
  Railway): поки він є, політику не відкриють ні користувачі, ні рецензент Apple.
- [x] **Скидання пароля.** `APP_URL` на Railway це https-адреса API, тож лист містить клікабельне посилання: сторінка
  `/reset-password` на сервері сама відкриває застосунок (`systema://reset-password?token=…`) і має кнопку на випадок, коли iOS
  не дозволяє. Лист надсилає Resend, що лишилося налаштувати, описано в `docs/email.md`. Універсальні посилання
  (`ios.associatedDomains` і файл `apple-app-site-association`) можна зробити пізніше як покращення.
- [ ] **Демо-акаунт для рецензента:** App Store Connect → App Review Information → Sign-in required. Без входу застосунок
  не відкрити.
- [ ] **Сторінка застосунку:** опис, ключові слова, скриншоти для найбільшого iPhone (розмір підкаже App Store Connect),
  адреса підтримки, категорія, вікова оцінка.
- [ ] **App Privacy:** відповідайте за фактом, що застосунок збирає: пошта акаунта, клієнти й замовлення, фото замовлень.
- [ ] **Назва.** «re:string» має бути вільною в App Store. Якщо зайнята, змініть лише назву сторінки в App Store Connect
  (`appName` в `eas.json` або в самому App Store Connect), підпис під іконкою лишиться «re:string».

Потім у App Store Connect виберіть збірку з TestFlight для версії, натисніть «Add for Review» і відправте. Перевірка
зазвичай триває 1–2 дні.

Коли вмикатимете вхід через Google (`docs/google-sign-in.md`), Apple вимагатиме поруч і «Sign in with Apple»
(Guideline 4.8).

## Крок 4. Оновлення без магазину (EAS Update)

Виправили помилку в JavaScript або тексти: нова перевірка Apple не потрібна.

```bash
npx eas-cli@latest update --channel production --environment production --message "Що змінилося"
```

Застосунок завантажує оновлення у фоні й застосовує під час наступного запуску: закрийте його повністю й відкрийте знову
(інколи двічі). Спершу перевіряйте на `preview`: `--channel preview --environment preview`.

Оновлення містить лише JavaScript і ресурси. Нова нативна бібліотека, зміна дозволів, плагінів чи іконки в `app.json`,
оновлення SDK означають нову збірку й нову версію в магазині. `runtimeVersion` рахується за «відбитком» нативної частини
(`fingerprint`), тож оновлення з нативними змінами не потрапить у збірки, яким воно не підходить: воно просто чекатиме на
нову збірку.

## Наступні релізи

1. Збільште `version` в `app.json` (наприклад, `1.0.1`): App Store вимагає нову версію для кожного релізу. Номер збірки EAS
   збільшить сам.
2. Закомітьте й запустіть `npx eas-cli@latest build --platform ios --profile production --auto-submit`.
3. У App Store Connect виберіть нову збірку для версії й відправте на перевірку.

## Android (коли знадобиться)

Профілі вже підходять. Потрібні акаунт Google Play Developer (25 $ одноразово) і застосунок, створений у Play Console.
Службовий ключ Google для EAS Submit призначте через `npx eas-cli@latest credentials --platform android`, а не файлом у
репозиторії (`google-service-account*.json` додано в `.gitignore`).

```bash
npx eas-cli@latest build --platform android --profile production
npx eas-cli@latest submit --platform android --profile production
```

`submit` кладе збірку в чернетку внутрішнього тестування (`eas.json`: `track: internal`, `releaseStatus: draft`). Нічого
не публікується, поки ви самі не випустите її в Play Console. Покрокова інструкція: https://docs.expo.dev/submit/android/

## Якщо щось пішло не так

| Симптом | Що робити |
|---|---|
| Збірка зупинилась із повідомленням «The "production" build needs EXPO_PUBLIC_API_URL…» | Крок 1: задайте адресу для середовища, що в повідомленні |
| Збірка падає на «Install dependencies» | Запустіть `pnpm install` у корені, закомітьте `pnpm-lock.yaml` і повторіть |
| Застосунок з магазину пише, що сервер недоступний | Адреса має бути `https://` із дійсним сертифікатом і відкриватися з інтернету: `curl https://<адреса>/api/health` має повернути `{"ok":true}` |
| Apple надіслала лист про «Missing API declaration» (ITMS-91053) | Додайте вказані в листі причини в `ios.privacyManifests` в `app.json`: https://docs.expo.dev/guides/apple-privacy/ |
| `eas update` виконано, а застосунок не змінився | Закрийте застосунок повністю й відкрийте двічі; перевірте канал збірки (`preview` чи `production`) і що нативну частину не змінювали |
| `npx expo install` ставить через npm | У корені має бути лише `pnpm-lock.yaml`; якщо знову з'явився `package-lock.json`, видаліть його |
