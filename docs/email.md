# Листи з бекенда: Resend і ваші домени

Зараз бекенд надсилає один лист: посилання для скидання пароля. Railway на плані Hobby не дає серверу відкривати SMTP-з'єднання
(порти 25, 465, 587), тому листи йдуть через HTTP API сервісу Resend. У коді все готово: це змінні `RESEND_API_KEY`,
`EMAIL_FROM_ADDRESS` і `EMAIL_FROM_NAME`. Не вистачає того, що робиться тільки у ваших акаунтах. Орієнтовно 30 хвилин плюс час,
поки оновляться DNS.

Resend безкоштовно дає 3 000 листів на місяць і до 100 на день, цього вистачить на скидання паролів.

## Домени

Вибрано два домени, їх куплено в Namecheap (4 листопада 2026, чинні до 4 листопада 2027). DNS лишається там же: у кожного
домену записи додаються на сторінці Domain List → Manage → Advanced DNS.

| Домен | Для чого |
|---|---|
| `tryrestring.com` і `www` | Сайт на Railway: опис, політика конфіденційності, умови користування, підтримка (ці адреси просить App Store Connect). Пошта підтримки: `support@tryrestring.com` |
| `myrestring.com` | Акаунт: листи застосунку приходять від `re:string <noreply@myrestring.com>` (Resend), пізніше бекенд на `api.myrestring.com` |

Домен для листів окремий від сайту, тому слати можна прямо з кореня `myrestring.com`: адреса виходить коротка, а репутація
пошти застосунку не залежить від сайту. Resend загалом радить слати з піддомену, але для домену, який існує лише заради листів
застосунку, корінь підходить; якщо з нього колись підуть ще й розсилки, додайте для них окремий піддомен. Записи Resend
стоять на `rsend`, `send`, `resend._domainkey` і `_dmarc`, тож з іншими записами домену (наприклад, `api`) вони не
перетинаються. Коли бекенд переїде на `api.myrestring.com`, лист про скидання пароля і посилання в ньому будуть з одного
домену. Корінь `myrestring.com` можна переспрямувати на сайт `tryrestring.com`, щоб той, хто набрав його в браузері, потрапив
на сайт.

## Що вже налаштовано

- Бекенд відправляє через Resend, коли задано `RESEND_API_KEY` (код: `backend/src/utils/resend.js`).
- На Railway `APP_URL` дорівнює адресі API, тож лист містить посилання на `https://…/reset-password?token=…`. Сторінка за цією
  адресою сама відкриває застосунок (`systema://reset-password?token=…`) і має кнопку на випадок, коли iOS не дозволяє
  відкрити його автоматично.
- `EMAIL_FROM_NAME=re:string`. `EMAIL_FROM_ADDRESS` спершу `onboarding@resend.dev`: це тестовий відправник Resend, який
  надсилає лише на адресу вашого акаунта в Resend (годиться, щоб перевірити все до підтвердження домену).

## Кроки

1. **DNS лишається в Namecheap**, нічого переносити не треба. Записи-заглушки Namecheap (`parkingpage.namecheap.com`) пошті не
   заважають.
2. **Акаунт у Resend:** [resend.com](https://resend.com), реєстрація й вхід робите ви.
3. **Додайте домен і записи.** У Resend: Domains → Add Domain → `myrestring.com` → регіон Europe (Ireland). Resend покаже
   записи: TXT для DKIM, два CNAME для відправлення (`rsend` і `send`) та необов'язковий TXT для DMARC. Значення копіюйте з
   Resend, а не з цього опису: довге значення DKIM у таблиці скорочене знаком «[…]», тож копіюйте його кнопкою копіювання, а не
   виділенням. У Namecheap (Domain List → Manage `myrestring.com` → Advanced DNS → Host Records → Add New Record) у полі Host
   пишіть лише ім'я без домену (`send`, а не `send.myrestring.com`): Namecheap допише домен сам.
   - **DKIM:** TXT Record, Host `resend._domainkey`, Value з Resend (починається з `p=`).
   - **Відправлення:** CNAME Record, Host `rsend`, Value з Resend (на 4 листопада 2026 це `rsend-euw1.forge.rmta.net`), і ще
     CNAME Record, Host `send`, Value з Resend (`send.forge.rmta.net`).
   - **DMARC (бажано):** TXT Record, Host `_dmarc`, Value `v=DMARC1; p=none;`. Це лише спостереження, листи він не блокує, а
     поштові сервіси люблять бачити такий запис у відправників.
   - Mail Settings міняти не треба: для відправлення Resend MX-запису не просить (старі інструкції з Custom MX і записами
     `send` застаріли). Збережіть кнопкою Save all changes.
4. **Verify DNS Records** у Resend і дочекайтесь «Verified». Зазвичай до 15 хвилин, інколи до 72 годин. Перевірити, чи видно
   записи в мережі, можна на [dns.email](https://dns.email).
5. **Ключ API:** API Keys → Create API Key → доступ «Sending access» (за бажання тільки для цього домену). Ключ показується один
   раз.
6. **Ключ у Railway:** railway.com → проєкт `restring-api` → сервіс `api` → Variables → New Variable: `RESEND_API_KEY` з вашим
   ключем. Тут це робите ви, щоб ключ не потрапляв у чат чи історію терміналу. Після Add натисніть Deploy.
7. **Відправник:** змініть `EMAIL_FROM_ADDRESS` на `noreply@myrestring.com`: у Railway або командою
   `railway variable set EMAIL_FROM_ADDRESS=noreply@myrestring.com --service api`. Сервіс перезапуститься сам. Робіть це лише
   після статусу «Verified», інакше листи не підуть.
8. **Перевірка:** у застосунку «Забули пароль?» для акаунта зі своєю поштою. Лист має прийти за хвилину, посилання в ньому
   відкриває екран зміни пароля. Якщо лист не прийшов: `cd backend && railway logs --service api -n 50` (шукайте рядки
   `[email] Could not send`; ключ у лог не потрапляє).

## Пошта підтримки

**`support@tryrestring.com`.** Resend лише надсилає листи, скриньки не дає. Безкоштовний варіант у Namecheap: Domain List →
Manage `tryrestring.com` → Advanced DNS → Mail Settings → Email Forwarding (Namecheap сам додасть MX і SPF-запис, потрібний для
пересилання: не видаляйте його). Потім вкладка Domain → розділ Redirect Email → Add Forwarder: Alias `support`, Forward to ваша
пошта → галочка. Дайте до години, тоді перевірте листом з іншої адреси, не з тієї, на яку пересилається. Адреса підтримки
потрібна для App Store Connect.

## Типові помилки

| Що видно | Причина |
|---|---|
| `Resend: The … domain is not verified` | Домен ще не «Verified», або `EMAIL_FROM_ADDRESS` на іншому домені |
| `Resend: API key is invalid` | Ключ неправильний, видалений або вставлений з пробілом |
| Листа немає, помилки в лозі теж | Перевірте папку «Спам»; з `onboarding@resend.dev` лист іде лише на пошту акаунта Resend |
| Лист прийшов, кнопка нічого не робить | На телефоні не встановлено застосунок, або посилання відкрито на комп'ютері |
| Resend не підтверджує домен, хоча записи додано | У Host вписано повне ім'я (`send.myrestring.com`), а Namecheap дописує домен сам; або DKIM вставлено скороченим (зі знаком «[…]») замість повного значення; або не натиснуто Save all changes. Що бачить інтернет: `dig +short TXT resend._domainkey.myrestring.com` і `dig +short CNAME send.myrestring.com` |
