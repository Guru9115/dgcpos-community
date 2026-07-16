# @dgcpos/client

Official JavaScript SDK for the [DGCPOS](https://dgcpos.com) REST API (Community Edition core).

**License:** MIT · **Runtime:** Node 18+ and modern browsers (uses `fetch`)

## Install

```bash
npm install @dgcpos/client
```

From the monorepo during development:

```bash
cd packages/dgcpos-client && npm install && npm test
```

## Quick start

```javascript
import { DgcPosClient } from '@dgcpos/client'

const client = new DgcPosClient({
  baseUrl: 'http://localhost:5000',  // no trailing /api
})

// Public endpoints
const health = await client.platform.health()
const edition = await client.platform.edition()

// Authenticate
await client.auth.login({
  username: 'owner',
  password: 'owner123',
})

// Core resources
const products = await client.products.list()
const sale = await client.sales.create({
  items: [{ product_id: 1, quantity: 2, unit_price: 100 }],
  payment_method: 'cash',
  amount_paid: 200,
})
const kpis = await client.dashboard.kpis()
const settings = await client.settings.get()
const posts = await client.marketplace.list()
```

## Examples

```bash
# Public smoke test
DGCPOS_URL=http://localhost:5000 node examples/quickstart.mjs

# Authenticated daily report export
DGCPOS_URL=http://localhost:5000 DGCPOS_USER=owner DGCPOS_PASS=owner123 \
  node examples/nightly-export.mjs
```

## Use an existing token

```javascript
const client = new DgcPosClient({
  baseUrl: 'https://api.your-store.com',
  token: process.env.DGCPOS_TOKEN,
  refreshToken: process.env.DGCPOS_REFRESH_TOKEN,
})
```

## Self-hosted Enterprise license

```javascript
const status = await client.license.status()
if (!status.licensed) {
  await client.auth.login({ username: 'owner', password: '...' })
  await client.license.activate(process.env.DGCPOS_LICENSE_KEY)
}
```

## Error handling

```javascript
import { DgcPosError } from '@dgcpos/client'

try {
  await client.products.get(999)
} catch (err) {
  if (err instanceof DgcPosError) {
    console.error(err.status, err.message, err.code)
  }
}
```

## API reference

OpenAPI spec: [`openapi/community.yaml`](openapi/community.yaml)

| Resource | Methods |
|----------|---------|
| `client.auth` | `login`, `refresh`, `me`, `logout`, `setToken` |
| `client.products` | `list`, `get`, `getByBarcode`, `create`, `update`, `remove`, `categories` |
| `client.sales` | `list`, `get`, `create`, `void`, `refund` |
| `client.customers` | `list`, `get`, `create`, `update`, `remove`, `tiers`, `adjustPoints` |
| `client.inventory` | `movements`, `adjust`, `lowStock`, `valuation` |
| `client.reports` | `daily`, `summary`, `inventory`, `products` |
| `client.dashboard` | `kpis`, `salesTrend`, `topProducts`, `bundle`, … |
| `client.settings` | `get`, `update`, `version`, `backupStatus` |
| `client.team` | `context`, `getUser`, `updateUser`, `resetPassword`, `setStatus` |
| `client.marketplace` | `list`, `get`, `create`, `orders`, `publicFeed`, … |
| `client.suppliers` | `list`, `create`, `update`, `remove` |
| `client.license` | `status`, `activate`, `deactivate` |
| `client.platform` | `health`, `edition`, `platformStatus` |

## Edition note

Community self-hosts should set `DGCPOS_EDITION=community` on the server. Enterprise-only endpoints return `403` in Community Edition unless a valid license is activated.

---

*Part of [dgcpos-community](https://github.com/Guru9115/dgcpos-community) · Phase P4 SDK*