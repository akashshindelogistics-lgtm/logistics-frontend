# Logistics Frontend

[![Unit Tests](https://github.com/akashshindelogistics-lgtm/logistics-frontend/actions/workflows/unit-tests.yml/badge.svg)](https://github.com/akashshindelogistics-lgtm/logistics-frontend/actions/workflows/unit-tests.yml)
[![E2E Tests (Playwright)](https://github.com/akashshindelogistics-lgtm/logistics-frontend/actions/workflows/e2e.yml/badge.svg)](https://github.com/akashshindelogistics-lgtm/logistics-frontend/actions/workflows/e2e.yml)
[![Pages](https://github.com/akashshindelogistics-lgtm/logistics-frontend/actions/workflows/pages.yml/badge.svg)](https://github.com/akashshindelogistics-lgtm/logistics-frontend/actions/workflows/pages.yml)
[![Release](https://github.com/akashshindelogistics-lgtm/logistics-frontend/actions/workflows/release-please.yml/badge.svg)](https://github.com/akashshindelogistics-lgtm/logistics-frontend/actions/workflows/release-please.yml)
&nbsp; [![Latest release](https://img.shields.io/github/v/release/akashshindelogistics-lgtm/logistics-frontend?sort=semver)](https://github.com/akashshindelogistics-lgtm/logistics-frontend/releases)

The dispatch dashboard of the Logistics System: organizations, godowns and
stock, the fleet and its compliance, drivers and their phones, customers,
dispatches through delivery, billing, vendors and hired trucks, reports and
the "ask your data" assistant. React 19 + TypeScript + Vite.

It is one of three repos:

| Repo | What |
| --- | --- |
| [logistics-backend](https://github.com/akashshindelogistics-lgtm/logistics-backend) | The Rust REST API this dashboard talks to, its feature docs, and `todo.org` |
| **logistics-frontend** | This dashboard |
| [logistics-android](https://github.com/akashshindelogistics-lgtm/logistics-android) | The driver's Android app, which pairs from this dashboard's QR codes |

Until November 2026 all three lived in one repo; this repo keeps the
dashboard's history from then. In comments and test notes, paths like
`src/logistics/...` and `docs/...` refer to **logistics-backend**, and
`android/...` (or `scripts/...` about the driver app) to **logistics-android**.

## Getting started

Needs Node 22 and a running API. The simplest setup is sibling checkouts:

```text
logistics/
├── logistics-backend/    # cargo run  → http://127.0.0.1:8080
└── logistics-frontend/   # npm run dev → http://localhost:5173
```

```bash
npm install
npm run dev
```

The Vite dev server proxies `/api` to `http://localhost:8080`; set
`API_PROXY_TARGET` for another address. A production build calls the API at
`VITE_API_BASE_URL` (e.g. `https://logi-api.example.org/api`), or at `/api` on
its own origin when that is unset.

## Tests

```bash
npm run test:unit          # Vitest
npx tsc -b && npm run lint # types and oxlint
npm run test:e2e           # Playwright, headless; needs the API and `npm run dev` running
E2E_BASE_URL=http://localhost:5174 npm run test:e2e   # against a dev server on another port
```

### Demos (headed, recorded)

Each opens a real browser window, slowed down, and records a video under
`test-results/`. They start the Vite dev server, and the API with `cargo run`
in `BACKEND_DIR` (default `../logistics-backend`), unless they're already
running.

```bash
npm run test:e2e:demo                     # the whole product, end to end
npm run test:e2e:demo:agent-inbox         # agents asking for decisions (scripted model, no credits needed)
npm run test:e2e:demo:reports             # operations reporting
npm run test:e2e:demo:roles               # role-scoped team members
npm run test:e2e:demo:notifications       # dispatch notifications
npm run test:e2e:demo:trips               # multi-stop trips
npm run test:e2e:demo:one-stop-trips      # standalone dispatches on the Trips page
npm run test:e2e:demo:assistant           # "ask your data" assistant
npm run test:e2e:demo:uploads             # proof-of-delivery file uploads
npm run test:e2e:demo:stock-categories    # stock categories
npm run test:e2e:demo:vehicle-visuals     # 3D icons, vehicle types, 3D vehicle view
npm run test:e2e:demo:motion              # transitions, lifecycle track, gliding markers
npm run test:e2e:demo:vendors             # vehicle vendors
npm run test:e2e:demo:hired-vehicles      # dispatching on a hired truck
npm run test:e2e:demo:vendor-payments     # paying vendors, hired-transport report
npm run test:e2e:demo:dashboard          # the dashboard overview, dark mode and phone drawer
npm run test:e2e:demo:driver-tracking     # a phone's positions on the dashboard
npm run test:e2e:demo:driver-app          # the driver app download card
npm run test:e2e:demo:phone-pairing       # pairing a driver's phone by QR code
npm run test:e2e:demo:theme-colors        # colour theme, light and dark

# Servers already on 5173/8080? Run on others; it starts its own API and Vite there:
E2E_WEB_PORT=5174 E2E_API_PORT=8081 npm run test:e2e:demo:motion
```

The `driver-*` and `phone-pairing` demos are also the dashboard half of the
emulator demos in logistics-android, which pass them what they seeded.

Motion follows the OS "reduce motion" setting everywhere, and the headless
suite runs with reduced motion so animations never race its assertions. The
vehicle-type icons are renders of the 3D models in `public/models/vehicles`
(Kenney Car Kit, CC0); regenerate them with `npm run render:vehicle-icons`.
Other 3D icons are Microsoft Fluent Emoji (MIT).

## CI and releases

| Workflow | What it does |
| --- | --- |
| `unit-tests.yml` | Type-check, oxlint and Vitest on every push |
| `e2e.yml` | Checks out **logistics-backend** (`master`, or the `backend_ref` input), builds and starts it with MySQL, then runs the Playwright suite. Also runs daily, to catch API changes that break the dashboard |
| `pages.yml` | Builds with `VITE_API_BASE_URL` from the repo variable `API_BASE_URL` and publishes to GitHub Pages (from `master`) |
| `release-please.yml` | Keeps a release PR that bumps `package.json` and `CHANGELOG.md`. Merging it tags `vX.Y.Z` and attaches `frontend-X.Y.Z.tar.gz` (the static build, root-relative) to the release |

Releases are tagged in this repo only, independent of the backend's and the
app's versions.

## License

Apache-2.0, see [LICENSE](LICENSE).
