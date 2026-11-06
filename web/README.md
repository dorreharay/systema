# Веб-версія re:string на Railway

Тут усе, що потрібне контейнеру з Caddy, який роздає збірку веб-застосунку (`dist/`, її робить `scripts/deploy-web.sh`, у git її немає):
`Dockerfile`, `Caddyfile` (маршрути, заголовки, CSP, кеш). Як розгортати й що налаштовано один раз (домен, CORS, Google):
**`docs/web-deploy.md`**.

```bash
scripts/deploy-web.sh          # зібрати з адресою бекенда й завантажити на Railway (сервіс `web`)
scripts/deploy-web.sh --build  # лише зібрати web/dist
```
