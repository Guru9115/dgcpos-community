# DGCPOS Community — Self-Host Guide

## Requirements

| Software | Version |
|----------|---------|
| Python | 3.10+ |
| Node.js | 18+ LTS |
| SQLite | bundled |

Optional: Docker, PostgreSQL (for multi-user production)

---

## Environment

**Backend** (`backend/.env`):

```bash
DGCPOS_EDITION=community
DATABASE_URL=sqlite:///retailos.db
SECRET_KEY=change-me-to-a-long-random-string
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5000
```

**Frontend** (`frontend/.env`):

```bash
VITE_DGCPOS_EDITION=community
```

---

## macOS one-click install

1. Clone this repository
2. Double-click `INSTALL.command`
3. Use `START-SERVER.command` daily

---

## Manual install

```bash
# Backend
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
export DGCPOS_EDITION=community
python app.py

# Frontend
cd frontend
npm ci
npm run build:ce
npm run preview   # or npm run dev:ce for development
```

---

## Docker (Community)

```bash
docker build --build-arg DGCPOS_EDITION=community -t dgcpos-ce .
docker run -p 5000:8080 \
  -e DGCPOS_EDITION=community \
  -e SECRET_KEY=your-secret \
  -v dgcpos-data:/app/retailos.db \
  dgcpos-ce
```

The Dockerfile skips the Enterprise overlay when `DGCPOS_EDITION=community`.

---

## Edition verification

```bash
curl http://localhost:5000/api/edition
# {"edition":"community","is_enterprise":false,"label":"Community"}

curl http://localhost:5000/api/health
```

---

## What's not in Community

Enterprise modules are excluded from this repository export:

- Live payment gateways (eSewa, Khalti, Stripe)
- Hotel / hospitality PMS
- Command Center / superadmin platform tools
- AI assistant, bulk import, gift cards, payables
- NestJS v2 API, Redis scale layer

Upgrade at [dgcpos.net/pricing](https://dgcpos.net/pricing).

---

## Backup

Settings → Backup → Download database file

Or copy `backend/retailos.db` directly while the server is stopped.