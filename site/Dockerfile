# The site on Railway: Caddy serves the static files in this folder. Deploy only this folder (see README.md).
FROM caddy:2-alpine

COPY Caddyfile /etc/caddy/Caddyfile
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
COPY . /srv
# Not for visitors: the deployment files and the owner's README. /etc/caddy/auth is where the entrypoint writes the password
# snippet when SITE_PASSWORD_HASH is set.
RUN rm -f /srv/Dockerfile /srv/Caddyfile /srv/README.md /srv/_headers /srv/_redirects /srv/docker-entrypoint.sh \
 && chmod +x /usr/local/bin/docker-entrypoint.sh \
 && mkdir -p /etc/caddy/auth

CMD ["/usr/local/bin/docker-entrypoint.sh"]
