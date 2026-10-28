#!/bin/sh
set -eu

npx --no-install prisma db migrate --db "$DATABASE_URL"
exec node dist/server.js
