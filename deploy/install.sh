#!/usr/bin/env bash
# One-command server setup for a new customer: blank company, one Owner account, HTTPS, strong random secrets.
#   DOMAIN=erp.customer.com OWNER_EMAIL=owner@customer.com OWNER_NAME="Customer Owner" bash deploy/install.sh
# Needs Docker with Compose, and DNS for DOMAIN pointing at this machine (ports 80 and 443 open).
set -euo pipefail
cd "$(dirname "$0")/.."

command -v docker >/dev/null || { echo "Docker is not installed. See https://docs.docker.com/engine/install/"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Docker Compose v2 is required."; exit 1; }
[ -f .env ] && { echo ".env already exists. Refusing to overwrite a configured server (delete it to start over)."; exit 1; }

: "${DOMAIN:?Set DOMAIN, for example DOMAIN=erp.customer.com}"
: "${OWNER_EMAIL:?Set OWNER_EMAIL}"
OWNER_NAME="${OWNER_NAME:-Owner}"
OWNER_PASSWORD="${OWNER_PASSWORD:-$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)}"

umask 077
cat > .env <<ENV
DB_PASSWORD=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
DOMAIN=$DOMAIN
CORS_ORIGIN=https://$DOMAIN
PUBLIC_API_URL=https://$DOMAIN
TRUST_PROXY=1
BIND_ADDR=127.0.0.1
COMPANY_MODE=empty
OWNER_EMAIL=$OWNER_EMAIL
OWNER_NAME=$OWNER_NAME
OWNER_PASSWORD=$OWNER_PASSWORD
DEMO_PASSWORD=$(openssl rand -hex 8)-unused-in-empty-mode
ENV

if [ "${DRY_RUN:-0}" = "1" ]; then echo "(dry run) wrote .env, not starting anything"; exit 0; fi
docker compose --profile https up -d --build
echo
echo "Ready: https://$DOMAIN"
echo "Owner sign-in: $OWNER_EMAIL"
echo "Owner password: $OWNER_PASSWORD   (change it after the first sign-in; this is the only time it is shown)"
echo "Backups: docker compose exec db pg_dump -U meridian meridian | gzip > backup-\$(date +%F).sql.gz"
