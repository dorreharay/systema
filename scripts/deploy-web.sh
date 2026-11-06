#!/bin/sh
# Builds the web app for production and puts it on Railway (service `web`, project restring-api). docs/web-deploy.md says what the
# service is, and what has to be set once (the domain, CORS, Google).
#
#   scripts/deploy-web.sh              build and deploy
#   scripts/deploy-web.sh --build      only build (web/dist), do not deploy
#
# EXPO_PUBLIC_API_URL is written into the build, so it is set here and not taken from a .env that may point at a laptop: the
# address of the backend on Railway unless the variable is already set. The Google client ID (EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID)
# and the Apple Services ID (EXPO_PUBLIC_APPLE_SERVICES_ID, when there is one) come from .env as always.
set -eu

cd "$(dirname "$0")/.."

API_URL="${EXPO_PUBLIC_API_URL:-https://api.myrestring.com}"
case "$API_URL" in
	https://*) ;;
	*) echo "EXPO_PUBLIC_API_URL must be an https:// address, not $API_URL" >&2; exit 1 ;;
esac

rm -rf web/dist
EXPO_PUBLIC_API_URL="$API_URL" npx expo export --platform web --output-dir web/dist
# What Expo adds for the developer and visitors have no use for: the page that lists the routes, and the list of redirects.
rm -f web/dist/_sitemap.html web/dist/_expo/.routes.json

# A build that cannot sign in with Google is a build made without the client ID: say so, but still make it (e-mail sign-in works).
if ! grep -rqs "apps.googleusercontent.com" web/dist/_expo/static/js; then
	echo "WARNING: this build has no Google client ID (EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in .env): no Google button." >&2
fi
if ! grep -rqs "$API_URL" web/dist/_expo/static/js; then
	echo "The build does not contain $API_URL: not deploying." >&2
	exit 1
fi

if [ "${1:-}" = "--build" ]; then
	echo "Built web/dist for $API_URL. Not deployed."
	exit 0
fi

# The Railway CLI of this project is linked from backend/ (the same place the backend and the site are deployed from).
# --no-gitignore: web/dist is in .gitignore, and without this flag it would not be uploaded.
cd backend
railway up ../web --path-as-root --service web --detach --no-gitignore
