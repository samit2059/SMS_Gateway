#!/bin/sh
set -eu

max_attempts=30
attempt=1

until ./node_modules/.bin/prisma db migrate --db "$DATABASE_URL"; do
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "Database did not become ready after ${max_attempts} migration attempts." >&2
    exit 1
  fi

  echo "Database is not ready; retrying in 2 seconds (${attempt}/${max_attempts})..." >&2
  attempt=$((attempt + 1))
  sleep 2
done

node dist/scripts/seed.js
exec node dist/server.js
