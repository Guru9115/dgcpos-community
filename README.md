# DGCPOS Community Edition

Open-source, self-hostable retail POS for small shops and developers.

**License:** [AGPL-3.0](LICENSE) · **Edition:** Community (no Enterprise modules)

| Product | What it is | Where |
|--------|------------|--------|
| **Community (this repo)** | Open source, self-host | This GitHub repository |
| **Cloud** | Hosted product (proprietary) | [app.dgcpos.com](https://app.dgcpos.com) · site [dgcpos.com](https://dgcpos.com) |

Enterprise / advanced hosted features (hotel PMS, live payment gateways, Command Center, etc.) are part of **DGC POS Cloud** or a commercial Enterprise license — not included in this Community tree.

See [dgcpos.com/open-source](https://dgcpos.com/open-source) for the dual-model statement.

---

## Quick start (Docker)

```bash
cp backend/.env.example backend/.env
# DGCPOS_EDITION=community is the default in this repository

docker build --build-arg DGCPOS_EDITION=community -t dgcpos-community .
docker run -p 5000:8080 -e DGCPOS_EDITION=community dgcpos-community
```

Open `http://localhost:5000`

---

## Local development

```bash
# Backend
cd backend && python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
export DGCPOS_EDITION=community
python app.py

# Frontend (separate terminal)
cd frontend && npm ci
npm run dev:ce
```

Default demo login: `owner` / `owner123` — **change immediately** after first login on any network-exposed install.

---

## What's included

| Module | Description |
|--------|-------------|
| POS | Barcode, cart, cash/card-record, receipts |
| Products & inventory | Variants, stock-take, suppliers |
| Customers | CRM, loyalty, tiers |
| Sales & returns | History, void, alterations, layaway |
| Reports | Dashboard, daily reports, CSV export |
| Bazaar | In-app marketplace listings (capped) |
| PWA | Offline queue, installable app |

See [docs/install/self-host.md](docs/install/self-host.md) for full setup.

---

## Hosted Cloud / Enterprise

- Hosted SaaS: [https://app.dgcpos.com](https://app.dgcpos.com)
- Marketing site: [https://dgcpos.com](https://dgcpos.com)
- Commercial / Enterprise license: [support@dgcpos.com](mailto:support@dgcpos.com)

---

## Security notes for self-hosters

- Never commit real `.env` files or API keys
- Change default passwords before exposing the app to the internet
- Online payment gateways require Enterprise / Cloud configuration — Community is cash / record-only by design

---

*© 2026 DGCPOS · Community Edition (AGPL-3.0)*
