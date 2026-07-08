# DGCPOS Community Edition

Open-source, self-hostable retail POS built for small shops and developers.

**License:** [AGPL-3.0](LICENSE) · **Edition:** Community (no Enterprise modules)

Enterprise features (hotel PMS, live payments, Command Center, AI assistant, etc.) are available on [dgcpos.net](https://dgcpos.net) or via a commercial Enterprise license.

---

## Quick start (Docker)

```bash
cp backend/.env.example backend/.env
echo "DGCPOS_EDITION=community" >> backend/.env

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

Default login: `owner` / `owner123` (change after first login)

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

## Upgrade to Enterprise

Hosted SaaS: [https://dgcpos.net](https://dgcpos.net)

Self-hosted Enterprise requires a commercial license — contact [support@dgcpos.net](mailto:support@dgcpos.net).

---

*© 2026 DGCPOS · Community Edition*