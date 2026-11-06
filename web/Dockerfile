# The web app on Railway: Caddy serves the build in dist/ (see README.md and docs/web-deploy.md). Deploy only this folder, after
# scripts/deploy-web.sh has built dist/ (it does both).
FROM caddy:2-alpine

COPY Caddyfile /etc/caddy/Caddyfile
COPY dist /srv
# Expo's page that lists the routes of the app: for the developer, not for visitors.
RUN rm -f /srv/_sitemap.html

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
