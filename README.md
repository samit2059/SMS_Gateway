# SMS Gateway

## Docker setup

1. Copy `.env.example` to `.env` and set `POSTGRES_PASSWORD` and `JWT_SECRET`.
   `POSTGRES_PASSWORD` is interpolated into a PostgreSQL URL, so use a URL-safe
   password (or percent-encode reserved URL characters).
2. Start the stack with `docker compose up --build`.

The API waits for the PostgreSQL health check. Its entrypoint then applies the
tracked migrations, idempotently seeds `ROUTE_A`, `ROUTE_B`, and `ROUTE_C`, and
only then starts the server. The seed runs on every API start so a recreated or
partially initialized database is repaired without duplicate providers or
resetting existing provider balances.
