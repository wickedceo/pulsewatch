# Pulsewatch

**Website and API uptime monitoring, with historical performance visibility.**

Pulsewatch is a full-stack monitoring platform designed to help users monitor website availability, inspect response status, run manual checks, and review historical monitoring data.

The application combines a React dashboard with a Node.js and Express API backed by PostgreSQL.

> Project status: Active development. The application has implemented authentication, website management, scheduled monitoring, historical checks, statistics, and URL-generation tracking. Production deployment and operational readiness must be assessed separately.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Environment Configuration](#environment-configuration)
- [Database Setup](#database-setup)
- [Running the Application](#running-the-application)
- [API Reference](#api-reference)
- [Monitoring and Status Classification](#monitoring-and-status-classification)
- [Security](#security)
- [Testing](#testing)
- [Production Considerations](#production-considerations)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

Pulsewatch provides an authenticated environment for registering websites and monitoring their availability.

Users can:

- Create an account and authenticate.
- Register websites for monitoring.
- View registered websites.
- Run monitoring checks manually.
- Review monitoring history.
- Inspect website statistics.
- Update or remove monitored websites.
- Retain historical monitoring data across URL changes through URL-generation tracking.

The application separates its frontend and backend, with a REST API connecting the dashboard to the monitoring services and PostgreSQL database.

## Features

### Account management

- User registration and login.
- Password hashing.
- Server-side session management.
- HTTP-only authentication cookies.
- Protected API routes.
- User-specific website and monitoring data.

### Website management

- Register websites for monitoring.
- List registered websites.
- Update website details.
- Remove websites.
- Associate monitored websites with authenticated accounts.

### Uptime monitoring

- Scheduled monitoring checks.
- Manual monitoring checks.
- HTTP response classification.
- Request timeout handling.
- Redirect validation.
- Monitoring history.
- Website statistics.

### URL-generation tracking

Pulsewatch tracks URL changes using website generations.

When a website URL changes, a new generation is created. Monitoring history is associated with the generation against which the check was performed.

This allows the application to preserve historical records without incorrectly treating checks against an older URL as checks against the current URL.

### Dashboard

The React dashboard provides an interface for managing websites, viewing monitoring results, and inspecting historical information.

---

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React 19, JavaScript |
| Build tooling | Vite |
| Charts | Recharts |
| Icons | Lucide React |
| Backend | Node.js, Express 5 |
| Database | PostgreSQL |
| Database hosting | Neon |
| Database driver | node-postgres (`pg`) |
| Authentication | Server-side sessions, password hashing |
| Security | Helmet, CORS, express-rate-limit, ipaddr.js |
| Monitoring | Axios, node-cron |
| Backend testing | Node.js test runner |
| Frontend testing | Vitest, Testing Library |
| Linting | Oxlint |

---

## Architecture

Pulsewatch uses a separated frontend/backend architecture.

```text
                   USER
                    |
                    v
          React Dashboard (Vite)
                    |
                    | HTTP / JSON
                    v
             Express REST API
                    |
          +---------+---------+
          |         |         |
          v         v         v
       Auth     Websites   Monitoring
          |         |         |
          +---------+---------+
                    |
                    v
             PostgreSQL
                 (Neon)
```

### Frontend

The frontend is responsible for the dashboard, account interfaces, website management, and monitoring visualizations.

### Backend

The backend exposes REST endpoints, validates requests, enforces authentication, performs monitoring checks, and coordinates database operations.

### Database

PostgreSQL stores account information, sessions, registered websites, URL generations, and monitoring records.

### Monitoring scheduler

The backend initializes a scheduled monitoring service when the server starts. The scheduler uses overlap prevention to reduce the risk of concurrent executions of the same scheduled job.

---

## Getting Started

### Requirements

Install the following before running the project:

- Node.js
- npm
- PostgreSQL database or a Neon PostgreSQL database
- Git

### Clone the repository

```bash
git clone https://github.com/wickedceo/pulsewatch.git
cd pulsewatch
```

### Install backend dependencies

```bash
cd server
npm install
```

### Install frontend dependencies

Open another terminal from the project root:

```bash
cd client
npm install
```

---

## Environment Configuration

The backend requires environment variables.

Create a local environment file:

```bash
cd server
cp .env.example .env
```

Configure the following variables in `server/.env`:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require

PORT=5000

CLIENT_ORIGIN=http://localhost:5173

NODE_ENV=development
```

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `PORT` | Backend HTTP port |
| `CLIENT_ORIGIN` | Trusted frontend origin |
| `NODE_ENV` | Application environment |

**Security requirements:**

- Never commit `.env` files.
- Never expose database credentials in frontend code.
- Use a strong database password.
- Configure `CLIENT_ORIGIN` to the exact frontend origin.
- For multiple trusted frontend origins, use comma-separated origins.
- Use secure production cookie settings and HTTPS in production.

The repository includes `server/.env.example` as a configuration template.

---

## Database Setup

Pulsewatch uses PostgreSQL.

The canonical schema for a new database is:

```text
server/src/database/schema.sql
```

Apply the schema to an empty database before starting the backend.

### Existing database upgrades

For an existing database, use the migrations in order:

1. `server/src/database/migrations/001_auth.sql`
2. `server/src/database/migrations/002_url_generation_schema.sql`
3. `server/src/database/migrations/003_url_generation_validation_and_index.sql`

Before applying migrations:

- Create and verify a database backup.
- Confirm the target database and branch.
- Review each migration.
- Do not run production migrations against an unverified database.

Migration `003` creates an index concurrently. Its `CREATE INDEX CONCURRENTLY` statement must be executed outside a transaction.

After applying migrations, verify that the expected tables, constraints, and indexes exist and are valid.

### Database responsibilities

The database stores:

- User accounts.
- Hashed authentication sessions.
- Registered websites.
- Website URL generations.
- Monitoring check records.

Website deletion is configured to cascade to associated URL versions and monitoring records.

---

## Running the Application

Run the backend in one terminal:

```bash
cd server
npm run dev
```

The backend defaults to:

```text
http://localhost:5000
```

Run the frontend in another terminal:

```bash
cd client
npm run dev
```

Vite normally serves the frontend at:

```text
http://localhost:5173
```

The Vite development configuration proxies `/api` requests to:

```text
http://localhost:5000
```

Open the frontend URL in your browser.

### Production build

Build the frontend:

```bash
cd client
npm run build
```

The generated production assets are written to:

```text
client/dist/
```

To run the backend without the development watcher:

```bash
cd server
npm start
```

---

## API Reference

The API uses JSON for request and response bodies.

Base URL during local development:

```text
http://localhost:5000
```

### Health endpoints

| Method | Endpoint | Description | Authentication |
|---|---|---|---|
| GET | `/` | API welcome and status response | No |
| GET | `/api/health` | API health check | No |

### Authentication

Base path: `/api/auth`

| Method | Endpoint | Description | Authentication |
|---|---|---|---|
| POST | `/api/auth/register` | Register an account | No |
| POST | `/api/auth/login` | Authenticate an account | No |
| POST | `/api/auth/logout` | End the current session | No |
| GET | `/api/auth/me` | Retrieve the current authenticated user | Yes |

Authentication uses an HTTP-only session cookie. Clients making cross-origin requests must be configured to send credentials and must use an appropriately configured trusted origin.

### Website management

Base path: `/api/websites`

All website management endpoints require authentication.

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/websites` | Register a website |
| GET | `/api/websites` | List registered websites |
| PUT | `/api/websites/:id` | Update a website |
| DELETE | `/api/websites/:id` | Remove a website |

### Monitoring

Base path: `/api/monitor`

All monitoring endpoints require authentication.

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/monitor/check` | Run a monitoring check |
| POST | `/api/monitor/:id/check` | Check a registered website |
| GET | `/api/monitor/:id/history` | Retrieve monitoring history |
| GET | `/api/monitor/:id/stats` | Retrieve website statistics |

`:id` represents the registered website identifier.

---

## Monitoring and Status Classification

Pulsewatch classifies monitoring outcomes into the following categories:

| Status | Meaning |
|---|---|
| Operational | HTTP response status from 200 through 399 |
| Restricted | HTTP 401, 403, or 429 |
| Client Error | Other HTTP 4xx responses |
| Server Error | HTTP 5xx responses |
| Offline | Network or transport failure |
| Pending | No monitoring result is available yet |

A restricted response does not necessarily mean that a website is offline. It can indicate that the destination requires authentication, blocks automated requests, or applies rate limiting.

Monitoring results should therefore be interpreted in the context of the destination's response behavior.

---

## Security

Security is a core part of the monitoring architecture.

### Authentication

- Passwords are stored as hashes rather than plaintext.
- Sessions are maintained server-side.
- Authentication cookies use HTTP-only and SameSite settings.
- Website and monitoring routes require authentication.
- User data access is scoped to the authenticated account.

### Request protection

- Helmet provides HTTP security headers.
- CORS is configured using trusted frontend origins.
- JSON request bodies have a size limit.
- Registration and login use rate limiting.

The authentication rate limiter currently uses per-process memory. A shared rate-limit store is recommended before deploying multiple backend instances.

### SSRF protection

Monitoring arbitrary URLs creates a server-side request forgery (SSRF) risk.

Pulsewatch implements protections including:

- URL validation.
- Rejection of private and internal IP addresses.
- DNS answer validation.
- Pinned DNS lookup to reduce DNS rebinding risk.
- Redirect destination validation.
- Validation of redirect host resolution.
- Controlled request behavior and timeout handling.

These controls are important because monitoring services make outbound HTTP requests on behalf of users.

Security controls should be reviewed and tested continuously as the application evolves.

---

## Testing

### Backend tests

Run:

```bash
cd server
npm test
```

The backend test suite uses Node.js's built-in test runner.

### Frontend tests

Run:

```bash
cd client
npm test
```

### Frontend linting

Run:

```bash
cd client
npm run lint
```

### Frontend production build

Run:

```bash
cd client
npm run build
```

Run tests and builds before submitting changes.

Automated tests provide important regression coverage, but passing tests alone do not establish production readiness. Database migrations, deployment configuration, security controls, and real-world monitoring behavior must also be validated.

---

## Production Considerations

Before operating Pulsewatch as a production SaaS, review the following:

- Configure HTTPS and secure cookie behavior.
- Use a production database with verified backups and recovery procedures.
- Apply database migrations through a controlled deployment process.
- Use a shared rate-limit store when scaling across multiple API instances.
- Configure monitoring for the monitoring service itself.
- Establish application logging, error reporting, and alerting.
- Review database connection pooling and resource limits.
- Validate SSRF protections against evolving attack techniques.
- Configure frontend and backend production origins.
- Establish retention policies for monitoring history.
- Perform load, reliability, and security testing.
- Define deployment, rollback, and incident-response procedures.

These are operational requirements to assess; they should not be interpreted as claims that production deployment has already been completed.

---

## Project Structure

```text
pulsewatch/
├── client/
│   ├── public/
│   ├── src/
│   │   ├── assets/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── index.css
│   │   ├── main.jsx
│   │   └── websiteStatus.js
│   ├── package.json
│   ├── vite.config.js
│   └── README.md
│
├── server/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── database/
│   │   │   ├── migrations/
│   │   │   └── schema.sql
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── utils/
│   │   ├── app.js
│   │   └── server.js
│   ├── test/
│   ├── .env.example
│   └── package.json
│
├── .gitignore
└── README.md
```

---

## Contributing

Contributions, bug reports, and technical suggestions are welcome.

When contributing:

1. Review the existing architecture before changing implementation.
2. Keep authentication and account isolation intact.
3. Preserve monitoring history and URL-generation consistency.
4. Treat URL validation and SSRF protection as security-critical.
5. Add or update tests for behavior changes.
6. Run the relevant tests and production build.
7. Document database changes and migration requirements.

---

## License

No open-source license has currently been specified.

Unless a license is added to this repository, the project should not be assumed to grant permissions for redistribution, modification, or commercial use.
