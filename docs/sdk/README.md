# DGCPOS SDK

## @dgcpos/client

JavaScript REST client for integrations, scripts, and third-party apps.

| Asset | Path |
|-------|------|
| Package | [`packages/dgcpos-client`](../../packages/dgcpos-client) |
| npm | `@dgcpos/client` |
| OpenAPI (CE core) | [`packages/dgcpos-client/openapi/community.yaml`](../../packages/dgcpos-client/openapi/community.yaml) |
| Install guide | [`docs/install/self-host.md`](../install/self-host.md) |

### Install

```bash
npm install @dgcpos/client
```

### Local development

```bash
cd packages/dgcpos-client
npm install
npm test
```

### Example — nightly sales export

```javascript
import { DgcPosClient } from '@dgcpos/client'

const client = new DgcPosClient({ baseUrl: process.env.DGCPOS_URL })
await client.auth.login({
  username: process.env.DGCPOS_USER,
  password: process.env.DGCPOS_PASS,
})

const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10)
const report = await client.reports.daily({ date: yesterday })
console.log(report)
```

### Resources (v0.2.0)

- **Core:** `auth`, `products`, `sales`, `customers`, `inventory`, `reports`
- **Ops:** `dashboard`, `settings`, `team`, `suppliers`, `marketplace`
- **Platform:** `platform`, `license`

Enterprise-only endpoints are not included in the Community OpenAPI spec; they require Enterprise Edition (or a valid self-host license) on the server.