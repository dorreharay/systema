# Сайт re:string: tryrestring.com

Маленький статичний сайт для застосунку: опис, умови користування, політика конфіденційності й підтримка, кожна сторінка
українською та англійською. Чистий HTML і CSS: без фреймворка, без збірки, без куків, аналітики, сторонніх скриптів і шрифтів.
Працює на Railway (регіон EU West, Амстердам, там само, де сервер застосунку): контейнер із Caddy роздає файли цієї папки.
DNS обох доменів лишається в Namecheap. Адреси з цього сайту просить App Store Connect.

> **Умови користування й політика конфіденційності тут це чернетки для перегляду власником, а не юридична консультація.**
> Їх написано за кодом застосунку й бекенда (перелік файлів нижче), але ролі сторін, правові підстави, строки, обіцянки
> (наприклад, «видалимо за 30 днів») і межі відповідальності має схвалити той, хто за них відповідає, а за потреби юрист.
> Оператора в них названо мінімально: «Velar» і пошта підтримки (див. «Оператор у політиці й умовах»).

## Оператор у політиці й умовах

**Velar це назва команди, а не юридична особа.** Це свідомий мінімум: у розділі 1 політики й умов оператора названо лише «Velar»
і вказано пошту `support@tryrestring.com`, без особистого імені, юридичного статусу, країни й поштової адреси. Решта тексту
каже «ми» й «оператор», нікого не називаючи. Тому тексти юридично слабші: з них не видно, хто сторона угоди за умовами й хто
володілець даних за політикою.

Усе, що стосується особи оператора, лежить в одному блоці на сторінці, по одному в кожному з чотирьох файлів: це абзац
`<p class="operator" data-operator>` з коментарем `OPERATOR: replace this block` перед ним. Знайти їх усі:

```bash
grep -rn 'data-operator' site --include='*.html'
```

| Файл | Блок |
|---|---|
| `privacy/index.html` | розділ 1 політики, українською |
| `en/privacy/index.html` | розділ 1 політики, англійською |
| `terms/index.html` | розділ 1 умов, українською |
| `en/terms/index.html` | розділ 1 умов, англійською |

Що зробило б тексти юридично твердішими і де це правити:

1. **Хто саме стоїть за Velar:** імʼя людини або компанія чи ФОП (повна назва з реєстраційними даними). Правка: ці чотири блоки,
   однаково в політиці й умовах. Приклад повнішого блоку політики: `<p class="operator" data-operator>Застосунок і сайт надає
   <імʼя або назва, країна> під назвою Velar (далі — «оператор» і «ми»). Пошта для будь-яких питань про конфіденційність:
   <a href="mailto:support@tryrestring.com">support@tryrestring.com</a>.</p>`; англійською: `The app and the website are provided
   by <name or company, country> under the name Velar (the “operator”, “we”). For any question about privacy, write to …`.
   Пошту з блоку не прибирайте.
2. **Країна для застосовного права.** Розділ 11 умов (`terms/index.html`, `en/terms/index.html`) свідомо нейтральний: «право країни, у
   якій перебуває оператор», без назви. Назвете країну: напишіть там «правом <країни>» і, за потреби, назвіть суд.
3. **Поштова адреса.** Її тепер немає ніде. Додайте в ті самі блоки, якщо вона потрібна: наприклад, якщо заявите статус trader за
   Digital Services Act (див. нижче) або якщо закон вашої країни вимагає її від підприємців.

Окремо від сайту: **на сторінці застосунку в App Store продавцем (Seller) показується справжнє імʼя власника облікового запису
Apple Developer** (або назва компанії), що б не було написано на сайті. Сайт на це не впливає, і блоки `data-operator` продавця
в Apple не змінюють. Хочете, щоб вони збігалися, назвіть у блоках ту саму особу.

## Що тут

| Адреса | Файл | Що |
|---|---|---|
| `/` | `index.html` | Опис, українською |
| `/en/` | `en/index.html` | Опис, англійською: що робить застосунок, місце для скриншотів, примітка, що посилання на App Store буде згодом |
| `/terms/`, `/en/terms/` | `terms/index.html`, `en/terms/index.html` | Умови користування |
| `/privacy/`, `/en/privacy/` | `privacy/index.html`, `en/privacy/index.html` | Політика конфіденційності |
| `/support/`, `/en/support/` | `support/index.html`, `en/support/index.html` | Підтримка: пошта `support@tryrestring.com` і короткі відповіді на питання |
| | `style.css` | Усі стилі (≈7 КБ, ≈2,4 КБ у стиснутому вигляді), світла й темна тема через `prefers-color-scheme` |
| | `Dockerfile`, `Caddyfile`, `docker-entrypoint.sh` | Розгортання на Railway: Caddy віддає файли папки, ставить суворий CSP та інші заголовки, переспрямовує `www` (і домени `myrestring.com`, якщо їх підключено) на `https://tryrestring.com`, віддає `404.html` з кодом 404 і не віддає службових файлів; за змінної `SITE_PASSWORD_HASH` закриває сайт паролем (розділ «Пароль на сайті») |
| | `_headers`, `_redirects` | Те саме для Netlify (для Cloudflare Pages підходить `_headers`). **На Railway не використовуються**; лишено на випадок переїзду |
| | `404.html` | Сторінка «не знайдено» |
| | `robots.txt`, `sitemap.xml` | Для пошукових систем, у sitemap є `hreflang` обох мов |
| | `favicon.ico`, `apple-touch-icon.png`, `icon.webp`, `icon-512.jpg` | Іконки (про них нижче) |
| | `README.md` | Цей файл: не сторінка сайту, Caddy його не віддає |

Адреси мають слеш у кінці (`/privacy/`): так вони працюють однаково і в `python3 -m http.server`, і на Caddy. Без слеша
(`/privacy`) сервер переспрямовує на варіант зі слешем, тож обидва записи відкриваються, але в App Store Connect вписуйте
варіант зі слешем. На кожній сторінці є `lang`, `hreflang`, `canonical`, заголовок, опис, видимий перемикач мови та посилання на
умови, політику й підтримку внизу. Посилання на сайті кореневі, канонічні адреси абсолютні (`https://tryrestring.com/…`).

## Як подивитися локально

З кореня репозиторію:

```bash
python3 -m http.server -d site 8000
```

Відкрийте <http://localhost:8000/> (українська) і <http://localhost:8000/en/> (англійська). Швидка перевірка, що всі сторінки
віддаються:

```bash
for u in / /en/ /terms/ /en/terms/ /privacy/ /en/privacy/ /support/ /en/support/ /sitemap.xml; do curl -s -o /dev/null -w "%{http_code}  $u\n" "http://localhost:8000$u"; done
```

Відкривати файли подвійним кліком (`file://`) не вийде, бо посилання кореневі: потрібен сервер. Заголовки й переспрямування з
`Caddyfile` локально не діють (це простий сервер Python): їх видно лише на Railway.

## Розгортання на Railway

Сайт це окремий сервіс у Railway. Збірки сайту немає: `Dockerfile` бере образ `caddy:2-alpine`, копіює в нього `Caddyfile` і
файли цієї папки та видаляє з образу службові (`README.md`, `Dockerfile`, `Caddyfile`, `docker-entrypoint.sh`, `_headers`, `_redirects`). Railway сам
закриває TLS на своєму краї, тому Caddy слухає звичайний http на порту зі змінної `PORT`, яку дає Railway. Розгортати треба лише
цю папку, не корінь репозиторію (у корені лежить Expo-проєкт).

Оновити сайт після правок (так само, як бекенд у `docs/release.md`; назва сервісу `site` це припущення, підставте свою):

```bash
cd site && railway up . --path-as-root --service site --detach
```

Регіон сервісу має бути **EU West (Амстердам)**: політика (розділи 4 і 10) обіцяє, що сайт стоїть там само, де сервер
застосунку. Перевірте в налаштуваннях сервісу в Railway.

## Домени в Namecheap для Railway

Тут усе вирішує те, що покаже сам Railway, тому записи описано без значень: точні імена й значення беріть у його панелі.

1. У Railway: сервіс сайту → Settings → Public Networking → **+ Custom Domain**. Додайте `tryrestring.com`, потім
   `www.tryrestring.com`. Безкоштовний пробний план дозволяє 1 власний домен на сервіс, Hobby дозволяє 2 (Pro 20), тож для
   пари `tryrestring.com` і `www` потрібен Hobby або вище.
2. Для кожного домену Railway покаже запис CNAME (ціль на кшталт `xxxxxx.up.railway.app`) і запис TXT для підтвердження
   (ім'я з `_railway-verify`). **TXT обов'язковий:** без нього домен віддає 404, навіть коли CNAME уже працює.
3. У Namecheap: Domain List → Manage; на вкладці Domain в розділі Nameservers має стояти **Namecheap BasicDNS** (інакше вкладки
   Advanced DNS не буде); далі вкладка **Advanced DNS** → блок **Host Records** → Add New Record. Після кожної правки
   натискайте зелену позначку Save Changes.

   Спершу видаліть записи-заглушки Namecheap, якщо вони є: `CNAME Record | www | parkingpage.namecheap.com.` і
   `URL Redirect Record | @ | http://www.tryrestring.com/`. Будь-який A, AAAA, CNAME чи URL Redirect на тому самому хості
   конфліктує з новими. Додайте чотири записи:

   | Type | Host | Value |
   |---|---|---|
   | **ALIAS Record** (для кореня), або CNAME, якщо Railway і Namecheap його приймуть | `@` | ціль, яку Railway показав для `tryrestring.com` |
   | CNAME Record | `www` | ціль, яку Railway показав для `www.tryrestring.com` |
   | TXT Record | `_railway-verify` | значення з Railway для `tryrestring.com` |
   | TXT Record | `_railway-verify.www` | значення з Railway для `www.tryrestring.com` |

   TTL лишайте Automatic. Точні імена TXT-записів дивіться в Railway: в Namecheap у полі Host пишуть лише частину перед
   `.tryrestring.com`.
4. Дочекайтеся підтвердження: у Railway біля домену з'явиться зелена позначка. Сертифікат Let's Encrypt Railway випускає сам,
   зазвичай протягом години після того, як DNS почне вказувати на нього. Railway попереджає, що DNS може оновлюватися до 72
   годин, Namecheap обіцяє ≈30 хвилин на новий запис.

Корінь домену не може бути звичайним CNAME, тому для `@` потрібен запис ALIAS: Namecheap дає його на BasicDNS (Type
`ALIAS Record`), а Railway в документації називає такі динамічні записи придатним способом, але застерігає, що не кожен DNS
уміє корінь. Якщо Railway не підтвердить корінь, є три виходи: написати в підтримку Railway; перенести лише DNS у безкоштовний
Cloudflare (тоді в корені звичайний CNAME), хоча власник вирішив лишити DNS у Namecheap; або зробити основним `www` (канонічні
адреси в усіх сторінках, `sitemap.xml`, `Caddyfile` і політиці замінити на `www`, а корінь вести записом URL Redirect без HTTPS).

Не чіпайте, що вже стоїть на доменах. На `tryrestring.com`: Mail Settings = **Email Forwarding** зі списком адрес пересилання
(`support`) і записами MX і TXT, які Namecheap додав для пересилання пошти. На `myrestring.com` стоять записи Resend: TXT
`resend._domainkey` (DKIM), CNAME `rsend` на `rsend-euw1.forge.rmta.net`, CNAME `send` на `send.forge.rmta.net` і необов'язковий TXT
`_dmarc`; додасться й CNAME `api` для бекенда. MX-записів там немає, а Mail Settings цього домену лишаються як є. Нові записи
сайту стосуються лише `@`, `www` і `_railway-verify…` домену `tryrestring.com`. Перевірка:

```bash
dig +short tryrestring.com                          # адреси Railway (їх кілька, і вони можуть змінюватися)
dig +short CNAME www.tryrestring.com                # ціль із Railway: xxxxxx.up.railway.app.
dig +short TXT _railway-verify.tryrestring.com      # значення з Railway (ім'я запису дивіться в панелі)
dig +short MX tryrestring.com                       # записи пересилання пошти Namecheap на місці
dig +short CNAME send.myrestring.com                # запис Resend на місці (send.forge.rmta.net.)
```

### `www` і `myrestring.com`

`www.tryrestring.com` Caddy сам переспрямовує на `https://tryrestring.com` (301). Для `myrestring.com` на Hobby місця немає
(2 домени на сервіс уже зайняті), тому залишаються два варіанти:

- **Нічого не робити.** `myrestring.com` призначений для пошти застосунку та API, а не для сайту; ніхто його в браузері не набирає.
- **Переспрямування Namecheap.** Advanced DNS → Host Records → `URL Redirect Record`, Host `@`, Value `https://tryrestring.com/`
  (якщо серед типів є окремий Permanent Redirect (301), беріть його, а не Unmasked); так само для `www`. Але цей запис **не
  обслуговує HTTPS**: `http://myrestring.com` переспрямує, а `https://myrestring.com` покаже помилку сертифіката. Для адреси, яку
  майже ніхто не набирає, це прийнятно. Записи пошти й API цей варіант не зачіпає.

Правила для `myrestring.com` у `Caddyfile` почнуть діяти, лише якщо ці домени колись підключити до сервісу як власні (на Pro).

### Після розгортання

```bash
curl -sI https://tryrestring.com/privacy | head -3                           # 301 або 308 на /privacy/
curl -s -o /dev/null -w "%{http_code}\n" https://tryrestring.com/privacy/    # 200
curl -s -o /dev/null -w "%{http_code}\n" https://tryrestring.com/terms/      # 200
curl -s -o /dev/null -w "%{http_code}\n" https://tryrestring.com/nope        # 404, а не 200
curl -sI https://tryrestring.com/ | grep -i content-security-policy          # заголовок із Caddyfile
for f in README.md Dockerfile Caddyfile docker-entrypoint.sh _headers _redirects .DS_Store; do curl -s -o /dev/null -w "$f %{http_code}\n" "https://tryrestring.com/$f"; done   # усі 404
curl -sI https://www.tryrestring.com/ | head -3                              # 301 на https://tryrestring.com/
curl -s https://tryrestring.com/support/ | grep -ci '<script'                # 0
```

Файл `.DS_Store` macOS створює сама: якщо він є в `site/`, `COPY . /srv` покладе його в образ і Caddy його віддасть. Видаліть його
(`find site -name .DS_Store -delete`) перед `railway up`; перевірка вище це покаже.

## Пароль на сайті

Увесь сайт можна закрити паролем (HTTP basic auth у Caddy): браузер спитає логін і пароль. Це керується змінними сервісу `site`
в Railway, у репозиторії пароля немає:

| Змінна | Що |
|---|---|
| `SITE_PASSWORD_HASH` | bcrypt-хеш пароля. Є змінна, то сайт закритий; немає, то відкритий |
| `SITE_USER` | логін; якщо змінної немає, то `restring` |

Закрити: згенеруйте хеш (`docker run --rm caddy caddy hash-password --plaintext 'пароль'`, або будь-якою бібліотекою bcrypt) і
задайте змінну в Railway (сервіс `site` → Variables); сервіс перезапуститься сам. Відкрити: видаліть `SITE_PASSWORD_HASH`.
Перевірка: `curl -s -o /dev/null -w "%{http_code}\n" https://tryrestring.com/` дає 401 без пароля й 200 з `-u логін:пароль`.

**Поки сайт закритий, політики й умов не бачить ніхто без пароля:** ні користувачі за посиланням із застосунку, ні рецензент
App Store. Перед відправкою застосунку на перевірку пароль треба зняти. Перенаправлення (`www`, http на https) працюють і під
паролем. Простий пароль із кількох цифр підбирається за хвилини: Caddy не обмежує кількість спроб.

## Інші хостинги

Сторінки від хостингу не залежать. Якщо колись переїдете, замініть назву хостингу в розділах 4 і 10 політики. Кожен із цих
варіантів публікує папку `site/`, тож `Dockerfile` і `Caddyfile` із неї треба прибрати (на статичному хостингу вони були б
видимі).

- **Netlify.** Для нього створено `_headers` (CSP) і `_redirects` (ховає `/README.md` і переспрямовує `myrestring.com`, якщо
  домен додано в проєкт як alias). Записи: для кореня A `75.2.60.5` (або ALIAS `apex-loadbalancer.netlify.com`, який Netlify
  радить), для `www` CNAME на `<проєкт>.netlify.app`. Для зовнішнього DNS Netlify радить робити основним `www`, а не корінь.
  Розгортання: перетягнути папку на <https://app.netlify.com/drop> або `npx netlify-cli@latest deploy --prod --dir site`.
- **Cloudflare Pages, лише для `www`.** Корінь домену там потребує серверів імен Cloudflare
  (<https://developers.cloudflare.com/pages/configuration/custom-domains/>), а DNS лишається в Namecheap, тож працюватиме тільки
  `www.tryrestring.com` (CNAME `www → <проєкт>.pages.dev` після додавання домену в Pages). Не рекомендую: канонічні адреси
  довелося б змінити на `www`. Вимкніть у зоні Email Address Obfuscation, Web Analytics і Bot Fight Mode.
- **GitHub Pages.** Для кореня чотири записи A (`185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`) і
  `CNAME www → <ваш-логін>.github.io`. Папку `site/` публікують через GitHub Actions (`upload-pages-artifact` із `path: site`);
  на безкоштовному плані потрібен публічний репозиторій. `_headers` там не діє, тож CSP не буде.

## Адреси в App Store Connect

| Поле | Англійська локалізація | Українська локалізація |
|---|---|---|
| Privacy Policy URL (App Information) | `https://tryrestring.com/en/privacy/` | `https://tryrestring.com/privacy/` |
| Support URL (версія) | `https://tryrestring.com/en/support/` | `https://tryrestring.com/support/` |
| Marketing URL (версія) | `https://tryrestring.com/en/` | `https://tryrestring.com/` |

Поле Privacy Policy URL в App Store Connect зазвичай є для кожної локалізації; якщо воно одне, вписуйте англійську адресу.
Основна мова сторінки застосунку (англійська чи українська) визначає, яку адресу побачить рецензент.

**Ліцензійна угода.** Для застосунку діє стандартна ліцензійна угода Apple (EULA), якщо в App Store Connect (App Information →
License Agreement) не додати власну. Умови користування з цього сайту це умови сервісу (акаунт, дані, відповідальність), вони діють
поряд з EULA і самі про це кажуть (розділ 8). Додаватимете власну EULA: звірте її з розділами 8 і 10 умов, щоб вони не
суперечили одне одному.

**Посилання всередині застосунку.** Екран реєстрації тепер каже «Створюючи акаунт, ви погоджуєтеся з Умовами та Політикою» з двома
посиланнями (`src/components/legal-note.tsx`); адреси будує `src/lib/legal.ts`: `https://tryrestring.com/terms/` і `/privacy/`
українською, `/en/terms/` і `/en/privacy/` англійською, тобто саме ті сторінки, що описані вище. Це закриває вимогу з
`docs/release.md` (розділ «Крок 3») про посилання на політику всередині застосунку. Ці сторінки мають бути відкриті (див. «Пароль на
сайті»).

**Статус trader (Digital Services Act).** Apple вимагає заявити, чи ви trader, у Business → Agreements → Compliance → Digital
Services Act (<https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-compliance-information>).
Для trader адреса, телефон і пошта показуються на сторінці застосунку в магазинах ЄС. Заявите цей статус: розумно додати адресу й
у блоки `data-operator` політики та умов, бо вони її зараз не містять. Продавець (Seller) на сторінці застосунку це справжнє імʼя
власника облікового запису Apple Developer (або назва компанії) за будь-якого тексту на сайті.

Підказка для App Privacy (відповідайте за фактом, це не готова відповідь): застосунок збирає пошту й імʼя акаунта, телефони та
імена клієнтів, ракетки, струни, замовлення, нотатки та фото замовлень (для функцій застосунку, повʼязано з користувачем),
ідентифікатор акаунта, а для входу через Google чи Apple ще й їхні ідентифікатори (пошта від Apple може бути службовою адресою
@privaterelay.appleid.com); не відстежує, не показує реклами, не має аналітики й збору збоїв. Вхід через Google вимагає, щоб поряд
був і вхід через Apple (Guideline 4.8): тепер є обидва. Окремо перегляньте, що Expo пише про
запити `expo-updates` (<https://expo.dev/privacy-explained>): вони йдуть на сервер Expo під час кожного запуску.

## Що лишилось вам зробити

Перед публікацією:

- [ ] **Вирішити, чи називати оператора точніше** (розділ «Оператор у політиці й умовах» вище). Тепер скрізь «Velar» і пошта: так можна
  лишити, але тексти юридично слабші. Правити блоки `data-operator` у чотирьох файлах і, коли назвете країну, розділ 11 умов.
- [ ] **Прочитати умови й політику та погодити їх** (чернетки). Рішення, які в них закладено за вас: сервіс безкоштовний і без покупок
  (умови, розділ 5: виставите ціну чи додасте покупки в App Store Connect, перепишіть); користувачам від 16 років (умови,
  розділ 2, і політика, розділ 8); межа відповідальності 100 євро (умови, розділ 10, число умовне); право країни, у якій перебуває
  оператор, без назви країни (умови, розділ 11); окрема угода про обробку даних за запитом (умови, розділ 4); обіцянка видалити акаунт за
  зверненням не пізніше 30 днів (політика, розділ 6); акаунт можна призупинити за порушення (умови, розділ 7; технічно це
  `is_active = false` у базі). Виставте реальну дату набуття чинності: тепер скрізь 4 листопада 2026 р. (`<time>` у чотирьох
  текстах, `lastmod` в `sitemap.xml`).
- [ ] **Створити сервіс сайту в Railway** і додати два домени (розділи вище): регіон EU West (Амстердам), `tryrestring.com` і `www`,
  записи й TXT-підтвердження в Namecheap.
- [ ] **Пошта `support@tryrestring.com` має працювати** (Namecheap: Mail Settings = Email Forwarding, адреса `support`): на неї
  ведуть і політика, і умови, і підтримка, і App Store Connect. Надішліть на неї тестовий лист. Змінюватимете службу пошти:
  виправте розділ 4 політики.
- [ ] **Перевірити в Railway**, що і сервіс сервера, і база даних, і сервіс сайту в регіоні EU West (Амстердам): політика це обіцяє.
- [ ] **Перевірити на телефоні посилання на екрані реєстрації**: обидва (умови й політика) відкриваються мовою застосунку. Для цього сайт
  має бути відкритим, без пароля.

Коли буде що показати:

- [ ] **Скриншоти** на головній (обидві мови). Зробіть 3 екрани iPhone (відношення сторін ≈ 9:19,5), зменшіть до ≈ 540 px завширшки,
  збережіть у WebP (`cwebp -q 80 -m 6 in.png -o screens/1.webp`) у папку `site/screens/`. У `index.html` і `en/index.html`
  замініть блок `<div class="shots" aria-hidden="true">…</div>` (є коментар `SCREENSHOTS`) на
  `<div class="shots"><img src="/screens/1.webp" width="540" height="1170" alt="Опис екрана"> …</div>` і приберіть абзац
  `shots-note`. Стилі для `<img>` усередині `.shots` вже є.
- [ ] **Посилання на App Store**, коли застосунок вийде: у двох головних сторінках замініть два рядки під коментарем
  `APP STORE LINK` на `<a class="soon" href="https://apps.apple.com/app/idXXXXXXXXXX">Завантажити в App Store</a>`
  (англійською: «Download on the App Store»). Офіційний значок Apple можна взяти з правил
  <https://developer.apple.com/app-store/marketing/guidelines/> і не змінювати; стиль `a.soon` дає і текстове посилання.

Коли зміниться застосунок чи бекенд, оновіть тексти (вони описують стан на 4 листопада 2026 р.):

- [ ] **Вхід через Google і Apple** описано в політиці (розділи 1, 2, 3, 4, 5, 6, 7), в умовах (розділ 2) і в підтримці (відповіді про пароль і
  видалення). Змінюватимете, що сервер зберігає при вході (нові поля, токени, провайдери), чи самі способи входу: поправте ці місця в
  обох мовах і таблицю нижче.
- [ ] **Ключ Apple на сервері.** Токен оновлення Apple зʼявляється, лише якщо на сервері задано ключ Sign in with Apple
  (`APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`; див. `backend/src/utils/apple.js`). Політика каже «якщо Apple видає застосунку
  токен оновлення», тож вона правдива й без ключа, але Apple радить скасовувати токени під час видалення акаунта
  (<https://developer.apple.com/support/offering-account-deletion-in-your-app/>), тому ключ варто налаштувати до відправки на перевірку.
- [ ] **Листи на приховану пошту Apple.** Лист скидання пароля на адресу @privaterelay.appleid.com дійде, лише якщо домен відправника
  зареєстровано в Apple: Apple Developer → Certificates, Identifiers & Profiles → Services → Configure (Sign in with Apple for Email
  Communication) → Email Sources. Додайте `myrestring.com` (відправник `noreply@myrestring.com`) і, якщо Apple покаже, що перевірку
  SPF не пройдено, `send.myrestring.com`; без цього такі листи повертаються
  (<https://developer.apple.com/help/account/capabilities/configure-private-email-relay-service/>).
- [ ] **Резервні копії бази.** Коли налаштуєте (в `docs/release.md` це ще відкрите питання), замініть останній абзац розділу 6
  політики про «технічні копії» на конкретний строк: «Резервні копії бази зберігаються N днів; видалений акаунт зникає з них
  після цього строку» (“Database backups are kept for N days; a deleted account disappears from them after that.”) і поправте
  розділ 6 умов, де сказано, що копії поки не гарантуються.
- [ ] **Фото.** Нових фото застосунок поки не додає (коміт `caf5f98`), але бекенд і дозволи камери та фото в `app.json` лишилися.
  Політика так і каже. Повернете додавання фото: приберіть слова «Наразі … вимкнено» в розділі 2; вирішите відмовитися
  назавжди: приберіть абзаци про фото й камеру та плагін `expo-image-picker` з `app.json`.
- [ ] **Лист скидання пароля написано лише українською** (`backend/src/utils/emailTemplates.js`), і відповідь у підтримці це
  згадує. Коли додасте англійську, поправте відповідь про пароль у `support/index.html` і `en/support/index.html`.
- [ ] **Клієнти, ракетки й струни після «Видалити» лишаються в базі** (приховані, щоб старі замовлення не втратили імен; стираються з
  акаунтом), політика про це чесно каже й обіцяє стерти запис раніше за зверненням. Для цього потрібна ручна процедура
  (найпростіше знеособити рядок: імʼя, телефон, пошта, нотатки), бо замовлення на нього посилаються. Або змініть бекенд, щоб
  «Видалити» стирало повністю, і поправте розділ 5 політики.
- [ ] Якщо додасте нового постачальника (аналітика, інша пошта, інший хостинг), додайте його в розділ 4 політики. Зараз там
  Railway, Resend, Expo, Namecheap, Google, Apple.

## На чому тримаються тексти: що перевірено і де

Усе нижче прочитано в коді 4 листопада 2026 р.; рядки про вхід через Google і Apple, 5 листопада 2026 р.

| Що сказано | Де перевірено |
|---|---|
| Пошта, пароль (bcrypt, щонайменше 8 символів), імʼя, налаштування майстерні | `backend/src/db/schema.js` (`users`), `backend/drizzle/*.sql`, `routes/auth.js`, `utils/password.js` |
| Клієнти, ракетки, струни, послуги, замовлення | `schema.js`, `routes/clients.js`, `rackets.js`, `strings.js`, `services.js`, `orders.js`, `utils/defaults.js` (стартовий каталог) |
| Фото: до 10 на замовлення, до 8 МБ, JPEG/PNG/WebP/HEIC, лежать у базі | `routes/orders.js` (`MAX_PHOTOS`, `MAX_PHOTO_BYTES`), `utils/images.js`, `schema.js` (`order_photos.data`) |
| Нові фото не додаються | `src/components/order-form.tsx` («Photos are no longer added here»), `git log`: `caf5f98` |
| Сеанс 7 днів (JWT), токен у Keychain, cookie лише для входу | `utils/session.js`, `middleware/auth.js`, `src/lib/token-storage.ts` |
| Скидання пароля: SHA-256 токена, 60 хвилин, один раз; єдиний лист; Resend | `routes/auth.js`, `utils/tokens.js`, `config.js`, `utils/email.js`, `utils/resend.js`, `utils/emailTemplates.js`, `routes/pages.js`, `utils/pages.js` |
| Акаунт можна призупинити (умови, розділ 7): призупинений не входить | `schema.js` (`users.is_active`), `routes/auth.js` («Account is inactive. Contact support.»), `middleware/auth.js` |
| Немає платежів, покупок і підписок (умови, розділ 5): «Сплачено» це лише позначка в замовленні | `package.json`, `backend/package.json`, обидва lock-файли (пошук `stripe`, `revenuecat`, `iap`, `purchase`, `paywall`, `storekit`, `billing`, `subscription`: платіжних бібліотек немає), `src/` (єдиний збіг `subscription` це слухач клавіатури), `schema.js` (`orders.is_paid`) |
| IP лише в памʼяті на 15 хвилин | `middleware/rateLimit.js` |
| Журнали: помилки, адреса й тема при невдалому листі | `middleware/error.js`, `utils/email.js`, `index.js`, `utils/google.js`, `utils/apple.js` |
| Видалення акаунта одним запитом, пароль для підтвердження (у акаунтів Google і Apple його немає), шлях в застосунку | `routes/auth.js` (`POST /api/auth/delete-account`), `schema.js` (`onDelete: cascade`), `src/components/settings-sheets.tsx`, `src/lib/i18n/en.ts`, `uk.ts` |
| Замовлення стираються, фото стираються, клієнти/ракетки/струни ховаються, послуги архівуються | `routes/orders.js`, `routes/photos.js`, `routes/clients.js`, `rackets.js`, `strings.js`, `services.js` |
| Нагадування плануються на телефоні, без сервера й push; їх може не бути, якщо вимкнено в iOS | `src/lib/reminders.ts`, `app.json` (`enableRemoteNotifications: false`) |
| Дзвінок, SMS, пошта через системні застосунки; повідомлення клієнтам надсилає сама людина | `src/lib/contact.ts` |
| Довідник ракеток і струн з назвами брендів і моделей (умови, розділ 8) | `backend/src/data/rackets.json`, `strings.json`, `routes/reference.js` |
| Відкриті компоненти (умови, розділ 8): бібліотеки, іконки Phosphor (MIT) | `package.json`, `src/components/icons/index.tsx` |
| Дозволи камери, фото, сповіщень | `app.json`, `app.config.js`, `ios/restring/Info.plist` |
| Немає аналітики, реклами, збору збоїв | `package.json`, `backend/package.json`, `pnpm-lock.yaml`, `backend/package-lock.json` (пошук sentry, firebase, amplitude, mixpanel, posthog, appsflyer, bugsnag, crashlytics, datadog, onesignal, revenuecat, admob та ін.: порожньо), `ios/restring/PrivacyInfo.xcprivacy` (`NSPrivacyTracking` = false) |
| Оновлення через Expo під час запуску | `app.json` (`updates`, `runtimeVersion`), `package.json` (`expo-updates`); запит описано за документацією Expo |
| Railway, EU West, Amsterdam (сервер, база, сайт); Resend; адреси доменів | `docs/release.md`, `docs/email.md` і завдання; сайт на Railway: `Dockerfile`, `Caddyfile` |
| Оператор у текстах: «Velar» і пошта; Velar це назва команди, а не юридична особа | Рішення власника від 4 листопада 2026 р. |
| Namecheap як реєстратор, DNS і пересилання пошти | Рішення власника від 4 листопада 2026 р. (DNS лишається в Namecheap) |
| Вхід через Google: застосунок бере токен у Google, сервер його перевіряє; зберігаються лише `google_sub`, пошта й імʼя, токенів Google немає; такий акаунт без пароля, видалення пароля не питає | `backend/src/routes/auth.js` (`/google`, `accountForGoogle`, `delete-account`), `backend/src/utils/google.js`, `backend/src/db/schema.js` (`google_sub`), `src/lib/google-sign-in.ts`, `src/components/google-sign-in-button.tsx`, `docs/google-sign-in.md` |
| Вхід через Apple: сервер перевіряє токен Apple; зберігаються `apple_sub`, пошта (справжня або службова @privaterelay.appleid.com), імʼя для нового акаунта (Apple дає його лише вперше) і, якщо на сервері є ключ Apple, токен оновлення, потрібний лише щоб скасувати вхід під час видалення акаунта; такий акаунт без пароля | `backend/src/routes/auth.js` (`/apple`, `accountForApple`, `rememberAppleRefreshToken`, `delete-account`), `backend/src/utils/apple.js`, `backend/src/db/schema.js` (`apple_sub`, `apple_refresh_token`), `backend/drizzle/0004_apple_sign_in.sql`, `src/lib/apple-sign-in.ts`, `src/components/apple-sign-in-button.tsx`, `src/components/social-sign-in.tsx` |
| Той самий акаунт за тією самою підтвердженою поштою: пароль вилучається, відкриті входи завершуються | `backend/src/routes/auth.js` (`accountForGoogle` і `accountForApple`: `password_hash: null`, `password_changed_at`) |
| Екран реєстрації з посиланнями на умови й політику | `src/components/legal-note.tsx`, `src/lib/legal.ts`, `src/lib/i18n/en.ts` і `uk.ts` (`register_agree`) |

Умови передачі даних за межі ЄС (Railway, Resend: стандартні договірні положення й Data Privacy Framework) звірено з їхніми
DPA: <https://railway.com/legal/dpa>, <https://resend.com/legal/dpa>; для Expo з <https://docs.expo.dev/regulatory-compliance/data-and-privacy-protection/>.
Для Namecheap (США) такої звірки не робилося: його DPA <https://www.namecheap.com/legal/universal/data-processing-addendum/>
перегляньте самі.

## Як змінювати сайт

- Це готовий HTML. Шапка, підвал, перемикач мови й метадані повторюються в кожній сторінці, шаблонізатора немає: змінюючи їх,
  правте всі файли (`grep -rln "support@tryrestring.com" site --include=*.html` покаже їх). Текст кожної сторінки існує двома
  мовами: правте обидві, інакше версії розійдуться. Розділи умов і політики в обох мовах мають однакові номери й `id`.
- Хто оператор, написано лише в блоках `data-operator` (по одному на політику й умови в кожній мові); решта текстів каже «ми» й
  «оператор». Змінюючи його, правте всі чотири блоки однаково.
- Нова сторінка: скопіюйте пару `…/index.html`, поправте `title`, `description`, `canonical`, обидва `hreflang`, посилання
  перемикача мови, додайте адреси в `sitemap.xml` і посилання у підвал кожної сторінки. Усі посилання кореневі й зі слешем у кінці.
- CSP з `Caddyfile` забороняє скрипти, шрифти, фрейми, `<style>` і атрибути `style=""`. Стилі додавайте в `style.css`. Захочете
  підключити щось стороннє, спершу змініть CSP (і в `Caddyfile`, і в `_headers`) та розділ 10 політики.
- Усе, що лежить у `site/`, потрапляє в образ і стає публічним, окрім шести файлів, які `Dockerfile` видаляє, а `Caddyfile`
  ховає. Службові файли, не призначені для відвідувачів, тримайте поза цією папкою. Файли розгортання (`Dockerfile`,
  `Caddyfile`) редагуйте лише свідомо: від них залежить CSP і переспрямування.
- Шрифти системні, у застосунку Euclid Circular A (`assets/fonts/*.woff2`). Їх не скопійовано сюди: ліцензія на веб може бути
  окремою від ліцензії на застосунок. Якщо вона у вас є, додайте `@font-face` у `style.css` з файлів у `site/`.

## Звідки взято картинки

- Іконки зроблено з `assets/images/icon.png` (1024×1024, 803 КБ): `apple-touch-icon.png` 180×180 (36 КБ), `icon.webp` 192×192
  для сторінки (3,5 КБ), `icon-512.jpg` для превʼю посилань у месенджерах (30 КБ), `favicon.ico` з PNG 16/32/48 (8 КБ). Якщо
  змінюватимете іконку застосунку, перегенеруйте їх:

  ```bash
  sips -z 180 180 assets/images/icon.png --out site/apple-touch-icon.png
  sips -z 192 192 assets/images/icon.png --out /tmp/icon-192.png && cwebp -q 82 -m 6 /tmp/icon-192.png -o site/icon.webp
  sips -s format jpeg -s formatOptions 70 -z 512 512 assets/images/icon.png --out site/icon-512.jpg
  ```

  Файл `.ico` збирається з PNG 16, 32 і 48 px (формат ICO з вбудованими PNG).
- Логотип у шапці (вектор `re:string`) побудовано з контурів літер `assets/fonts/FixelStylistic-Bold.ttf` (Fixel Stylistic Bold,
  © 2023 MacPaw Inc., ліцензія SIL OFL 1.1) і вставлено в кожну сторінку як `<svg>`; колір бере з CSS, тож темна тема працює.
- Палітра з застосунку: `#173c32` (бренд), `#e6efeb`, `#12171c`, `#667085`, `#e3e5e8`, `#f4f5f6` і пастельні
  `#c3ddf0`, `#f3d590`, `#cce7ac` (`src/global.css`, `src/components/ui/colors.ts`). Темна тема: `#0b1210` з `app.json`.
  Контраст усіх пар тексту й фону не нижче 4,5:1 в обох темах.
- Папка `site/` потрапляє в архів проєкту для EAS (≈200 КБ), на збірку застосунку це не впливає. `.easignore` не створювався: він
  замінив би правила `.gitignore` для завантажень.
