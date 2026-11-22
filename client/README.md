# Pulsewatch Frontend

The Pulsewatch frontend is a React-based dashboard for the Pulsewatch website and API monitoring platform.

It provides the user interface for account access, website management, monitoring status, manual checks, historical monitoring data, and website statistics.

The application is built with React 19 and Vite.

---

## Contents

- [Overview](#overview)
- [Technology Stack](#technology-stack)
- [Requirements](#requirements)
- [Installation](#installation)
- [Environment and API Configuration](#environment-and-api-configuration)
- [Development](#development)
- [Available Scripts](#available-scripts)
- [Application Integration](#application-integration)
- [Testing](#testing)
- [Production Build](#production-build)
- [Project Structure](#project-structure)

---

## Overview

The frontend communicates with the Pulsewatch Express API and presents monitoring information through a dashboard.

Its responsibilities include:

- Account registration and login interfaces.
- Authenticated dashboard access.
- Website registration and management.
- Displaying website monitoring status.
- Triggering manual monitoring checks.
- Presenting monitoring history.
- Displaying website statistics and charts.
- Communicating with protected backend endpoints.

The frontend does not independently perform scheduled uptime monitoring. Monitoring operations are handled by the backend.

---

## Technology Stack

| Technology | Purpose |
|---|---|
| React 19 | Component-based user interface |
| JavaScript | Application logic |
| Vite | Development server and build tooling |
| Recharts | Monitoring charts and data visualization |
| Lucide React | Interface icons |
| Vitest | Frontend test runner |
| Testing Library | Component and interaction testing |
| Oxlint | JavaScript linting |

---

## Requirements

- Node.js compatible with the installed Vite version.
- npm.
- The Pulsewatch backend API.
- A configured PostgreSQL database accessible to the backend.

---

## Installation

From the repository root:

```bash
cd client
npm install
```

This installs the frontend dependencies defined in `package.json`.

---

## Environment and API Configuration

During local development, Vite proxies requests beginning with `/api` to:

```text
http://localhost:5000
```

This configuration is defined in:

```text
vite.config.js
```

The proxy allows the frontend to communicate with the backend through its own development origin.

The backend must be running for authenticated functionality and monitoring data to work.

The backend's `CLIENT_ORIGIN` setting should match the frontend origin when configuring cross-origin access.

Authentication relies on HTTP-only session cookies. Requests that need to use the session must include credentials as appropriate.

---

## Development

Start the Vite development server:

```bash
npm run dev
```

The default local development address is:

```text
http://localhost:5173
```

Start the backend separately:

```bash
cd ../server
npm run dev
```

Vite supports hot module replacement, allowing many frontend changes to appear in the browser without restarting the development server.

---

## Available Scripts

Run these commands from the `client/` directory.

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite development server |
| `npm run build` | Create the optimized production build |
| `npm run preview` | Preview the production build locally |
| `npm test` | Run frontend tests |
| `npm run lint` | Run Oxlint |

### Development server

```bash
npm run dev
```

### Tests

```bash
npm test
```

### Lint

```bash
npm run lint
```

### Production build

```bash
npm run build
```

---

## Application Integration

The frontend consumes the Pulsewatch REST API.

The local development proxy forwards `/api` requests to the backend at `http://localhost:5000`.

The principal API groups are:

| API group | Base path | Purpose |
|---|---|---|
| Authentication | `/api/auth` | Registration, login, logout, current user |
| Websites | `/api/websites` | Website creation, listing, updating, deletion |
| Monitoring | `/api/monitor` | Manual checks, history, statistics |
| Health | `/api/health` | Backend health status |

Website and monitoring operations require an authenticated session.

For complete endpoint details, database configuration, security information, and backend setup, see the [main project README](../README.md).

---

## Testing

Frontend tests use Vitest and Testing Library.

Run the test suite:

```bash
npm test
```

Tests should cover important user-facing behavior, component rendering, and interactions.

When changing frontend functionality, update or add tests where appropriate.

---

## Production Build

Create the optimized build:

```bash
npm run build
```

Vite generates production assets in:

```text
dist/
```

Preview the generated build locally:

```bash
npm run preview
```

The `dist/` directory is generated output and should not be committed to version control.

### Production deployment considerations

Before deploying the frontend:

- Configure the correct production API origin or reverse proxy.
- Ensure frontend and backend origins are compatible with the backend CORS configuration.
- Serve the application over HTTPS.
- Verify cookie and credential behavior in the production browser environment.
- Confirm that the backend and database are available.
- Test authentication, website management, monitoring history, and dashboard functionality against the deployed API.

The local Vite proxy is a development convenience. It should not be assumed to provide production API routing.

---

## Project Structure

```text
client/
├── public/
│   ├── favicon.svg
│   └── icons.svg
│
├── src/
│   ├── assets/
│   ├── App.jsx
│   ├── App.css
│   ├── App.test.jsx
│   ├── index.css
│   ├── main.jsx
│   └── websiteStatus.js
│
├── index.html
├── package.json
├── package-lock.json
├── vite.config.js
├── vitest.config.js
└── README.md
```

### Main application files

| File | Responsibility |
|---|---|
| `src/App.jsx` | Main application and dashboard interface |
| `src/App.css` | Application component styling |
| `src/index.css` | Global styling |
| `src/main.jsx` | React application entry point |
| `src/websiteStatus.js` | Website status presentation logic |
| `src/App.test.jsx` | Frontend tests |
| `vite.config.js` | Vite and development API proxy configuration |
| `vitest.config.js` | Test runner configuration |

---

## Development Guidelines

When contributing to the frontend:

1. Keep components maintainable and reusable.
2. Preserve account authentication and session behavior.
3. Handle loading, error, and empty states clearly.
4. Keep API communication consistent with backend response formats.
5. Avoid exposing credentials or secrets in client-side code.
6. Maintain accessible controls and understandable status indicators.
7. Add tests for important UI behavior.
8. Run linting, tests, and a production build before submitting changes.
