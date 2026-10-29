# Mini SMS Gateway

A REST API for authenticated bulk SMS submission. It validates Nepali mobile
numbers, calculates SMS parts and cost, atomically charges a user's wallet,
delivers through prioritized mock providers, fails over when a route fails, and
refunds messages that fail on every route.

This repository implements the **Nest Nepal Business Solutions Backend
Developer Intern Task**. The providers are local mocks: no real SMS is sent.

## Requirements covered

| Task requirement | Implementation |
| --- | --- |
| JWT register/login and one wallet per user | `POST /api/v1/auth/register`, `POST /api/v1/auth/login` |
| 2–3 mock providers with priority, balance, and failure rate | `ROUTE_A`, `ROUTE_B`, `ROUTE_C` |
| Validate and normalize Nepali numbers | `src/modules/sms/sms.validation.ts` |
| GSM-7 and Unicode part counting | `src/modules/sms/sms.encoding.ts` |
| Transactional credit deduction | Wallet row lock plus database transaction |
| Provider failover | Priority-ordered dispatcher |
| Paginated/filterable logs | `GET /api/v1/sms/logs` |
| Route balance, success rate, and health | `GET /api/v1/health` |
| Refund after all routes fail | SMS service and dispatcher |

### Optional bonus items

- **Rate limiting:** implemented for authentication and SMS requests.
- **Unit tests:** implemented for number normalization and SMS segmentation.
- **Docker Compose:** implemented for the API and PostgreSQL.
- **Queue (BullMQ/Redis):** not implemented.
- **Delivery-report webhook:** not implemented.

## Core behavior

### Phone numbers

A valid number is ten digits beginning with `97` or `98`. An optional `+977`
or `977` prefix is accepted and removed.

| Input | Normalized result |
| --- | --- |
| `9841234567` | `9841234567` |
| `+9779801122334` | `9801122334` |
| `9779761234567` | `9761234567` |
| `9612345678` | rejected |
| `984123456` | rejected |

Numbers are normalized before duplicate removal, validation succeeds only when
all recipients are valid, and invalid input receives a clear `400` response.

### SMS parts and cost

| Encoding | One-part limit | Multipart limit |
| --- | ---: | ---: |
| GSM-7 | 160 characters | 153 characters per part |
| Unicode | 70 characters | 67 characters per part |

Any non-GSM-7 character, including Devanagari or an emoji, makes the complete
message Unicode. GSM-7 extension characters consume two septets. By default,
one credit is charged per SMS part (`CREDITS_PER_PART=1`).

### Sending and refunds

1. Validate and normalize every recipient and calculate the total cost.
2. Lock the user's wallet row inside a database transaction.
3. Reject the request if the wallet cannot afford the total cost.
4. Deduct credits and create queued message rows in the same transaction.
5. After commit, try active providers by priority.
6. Try the next provider when a provider fails or cannot reserve enough route
   balance.
7. Refund the message cost when every route fails.

The wallet lock is the important concurrency guarantee: parallel sends for the
same user see the latest committed balance and cannot overspend it. The
repository includes a concurrency helper for the task's “20 requests against
10 credits” scenario.

## Route-health formula

`GET /api/v1/health` reports route balance, attempts, success rate, and a health
percentage for the previous 24 hours. The formula is:

```text
S = (success + 9) / (success + failed + 10)
B = min(1, balance / HEALTH_LOW_BALANCE)
healthPercent = round(100 * (0.7 * S + 0.3 * B))
```

The smoothing constants prevent a route with one lucky success from appearing
perfect. Success history contributes 70% and available route balance
contributes 30%. An inactive route or a route with zero balance receives 0%.

Labels are:

- `healthy`: 80–100
- `degraded`: 50–79
- `unhealthy`: 0–49

The task brief names this endpoint `/routes/health`; this implementation
exposes the authenticated, versioned equivalent at `/api/v1/health`.

## Technology

- Node.js 22
- TypeScript
- Express
- PostgreSQL 16
- Prisma
- JWT and bcryptjs
- Zod and custom SMS validation
- Helmet, CORS, and express-rate-limit
- Docker Compose
- Node.js built-in test runner

## Prerequisites

Use either:

- Docker Desktop with Docker Compose; or
- Node.js 22+, npm, and PostgreSQL 16+.

## Configuration

Create an environment file:

```powershell
Copy-Item .env.example .env
```

Set the required values:

```env
PORT=5000
NODE_ENV=development
POSTGRES_PASSWORD=use-a-url-safe-password
JWT_SECRET=use-a-long-random-secret
JWT_EXPIRES_IN=1d
```

Optional values:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/sms_gateway_db
SMS_SENDER=SMS-Gateway
CREDITS_PER_PART=1
SEND_WAIT_MS=5000
HEALTH_LOW_BALANCE=200
```

Do not commit `.env` or real secrets. If the PostgreSQL password contains
reserved URL characters, percent-encode them in `DATABASE_URL`.

## Run with Docker

```powershell
Copy-Item .env.example .env
# Edit .env and set POSTGRES_PASSWORD and JWT_SECRET
docker compose up --build
```

The API is available at `http://localhost:5000`.

The API container waits for PostgreSQL, applies tracked migrations, idempotently
seeds the three mock routes, and starts the server.

```powershell
docker compose down
```

## Run locally

Install dependencies:

```powershell
npm ci
```

Set `DATABASE_URL` in `.env`, then apply migrations and seed providers:

```powershell
npx prisma db migrate --db "$env:DATABASE_URL"
npx tsx src/scripts/seed.ts
```

Start development mode:

```powershell
npm run dev
```

Build and run the compiled server:

```powershell
npm run build
npm start
```

## API reference

Protected endpoints require the JWT returned by login:

```http
Authorization: Bearer <token>
```

### Health

#### `GET /`

Public API liveness response.

#### `GET /health`

Public response:

```json
{ "status": "ok" }
```

### Authentication

#### `POST /api/v1/auth/register`

```json
{
  "name": "Example User",
  "email": "user@example.com",
  "password": "Password1"
}
```

Passwords must be 5–40 characters and contain an uppercase letter and a
number. Successful registration returns `201 Created`.

#### `POST /api/v1/auth/login`

```json
{
  "email": "user@example.com",
  "password": "Password1"
}
```

The response contains a JWT and the user's ID and email.

### Send SMS

#### `POST /api/v1/sms/send`

Requires authentication.

```json
{
  "to": ["+977 984-123-4567", "9801122334"],
  "message": "Your verification code is 123456",
  "sender": "MyApp"
}
```

`to` must be a non-empty array. `message` must be non-empty. `sender` is
optional and is limited to 11 characters. Duplicate recipients are removed
after normalization.

The endpoint returns `200` when all results are final and `202` when one or
more messages are still pending. The response includes:

- per-request encoding and parts;
- total charged and refunded credits;
- sent, failed, and pending counts;
- current wallet balance; and
- each message ID, normalized recipient, status, parts, cost, and refund.

### Message logs

#### `GET /api/v1/sms/logs`

Requires authentication and returns paginated message history.

| Query parameter | Accepted values |
| --- | --- |
| `page` | Positive integer; default `1` |
| `limit` | `1`–`100`; default `20` |
| `status` | `pending`, `sent`, or `failed` |
| `startDate` | ISO-8601 date/time |
| `endDate` | ISO-8601 date/time |
| `number` | Valid Nepali mobile number |

Example:

```text
/api/v1/sms/logs?status=failed&page=1&limit=20
```

### Wallet

#### `GET /api/v1/wallet`

Requires authentication and returns:

```json
{ "balance": 98 }
```

### Route health

#### `GET /api/v1/health`

Requires authentication. Returns `windowHours`, then one entry per route with
priority, active state, balance, last-24-hour attempts, success, failures,
skips, success rate, health percentage, and status.

## Mock providers

The seed script creates three providers:

| Route | Priority | Failure rate | Initial balance |
| --- | ---: | ---: | ---: |
| `ROUTE_A` | 1 | 30% | 10,000 |
| `ROUTE_B` | 2 | 10% | 10,000 |
| `ROUTE_C` | 3 | 5% | 10,000 |

Failure rates are simulated with randomness, so the exact provider outcome is
not deterministic. The seed is idempotent and does not duplicate providers or
reset their existing balances.

For wallet/concurrency testing:

```powershell
npx tsx src/scripts/set-wallet.ts user@example.com 10
```

For the task's parallel-send scenario:

```powershell
$env:TOKEN = "<jwt-from-login>"
npx tsx src/scripts/concurrency-test.ts
```

## Testing

```powershell
npm test
```

This runs the TypeScript build and tests for:

- valid and invalid Nepali number normalization;
- normalization before cost calculation;
- GSM-7 boundaries at 160, 306, and multipart limits;
- GSM-7 extension characters;
- Unicode, emoji, and Nepali text classification; and
- Unicode multipart boundaries.

## Project structure

```text
src/
├── modules/auth/       Registration and login
├── modules/health/     Route-health calculation and endpoint
├── modules/sms/        Validation, encoding, sending, logs, providers
├── modules/wallet/     Authenticated wallet endpoint
├── middleware/         JWT auth, validation, and rate limiting
├── prisma/             Database contract
└── scripts/            Provider seed, wallet setup, concurrency test
migrations/             Tracked database migrations
Dockerfile              Multi-stage container build
docker-compose.yml      API and PostgreSQL services
docker-entrypoint.sh    Migration, seed, and startup sequence
```

## Decisions and improvements

### Decisions

- Credits are deducted and message rows are created in one transaction.
- A wallet row lock prevents parallel requests from overspending.
- Provider calls happen after commit, so external work does not hold a
  database transaction open.
- Failed final deliveries are refunded.
- The health score uses both recent delivery results and route balance.

### What I would improve next

- Move delivery to BullMQ/Redis so requests return immediately and queued
  messages survive API process restarts.
- Add a delivery-report webhook for provider callbacks.
- Add a recovery worker for queued or in-progress messages.
- Add integration tests for the database transaction, failover, refunds, and
  the 20-request concurrency scenario.
- Add API documentation generation and a short demo recording/deployed link.
- Restrict CORS and add production secret management before deployment.

## Submission checklist

- [x] Source code, schema, migrations, and provider seed data
- [x] README setup steps and design decisions
- [x] Phone-number normalization and clear validation errors
- [x] GSM-7 and Unicode part counting
- [x] Transactional wallet deduction
- [x] Priority-based provider failover
- [x] Refunds after all routes fail
- [x] Paginated logs filtered by status, date, and number
- [x] Explained route-health formula
- [x] Rate limiting, unit tests, and Docker Compose bonus items
- [ ] 3–5 minute demo recording or deployed link (provide separately)

## License

No license is currently declared in the repository.
