#!/bin/sh
# Starts Caddy. With SITE_PASSWORD_HASH set (a bcrypt hash, from `caddy hash-password` or from any bcrypt library) the whole
# site asks for a login: the user is SITE_USER, "restring" by default. Without the variable the site is open. Both come from
# the Railway variables of the service, so the hash is not in the repository.
set -eu

if [ -n "${SITE_PASSWORD_HASH:-}" ]; then
	printf 'basic_auth {\n\t%s %s\n}\n' "${SITE_USER:-restring}" "$SITE_PASSWORD_HASH" > /etc/caddy/auth/auth.caddy
fi

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
