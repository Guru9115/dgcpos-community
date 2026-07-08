"""Smoke tests for Community Edition export script."""
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
EXPORT_SCRIPT = REPO_ROOT / "scripts" / "export-community.sh"
EXPORT_DIR = REPO_ROOT / "dist" / "dgcpos-community-test"

FORBIDDEN_PATHS = [
    "ee-backend",
    "frontend/ee-frontend",
    "nest-backend",
    "backend/hospitality",
    "backend/routes/hospitality.py",
    "backend/routes/admin.py",
    "backend/routes/payments.py",
    "backend/migrations/versions/0010_bazaar_ads.py",
    "backend/migrations/versions/0014_hospitality_core.py",
    "frontend/src/components/admin",
    "frontend/src/components/support",
    "frontend/src/pages/AdminDashboard.jsx",
    "frontend/src/pages/HotelRooms.jsx",
    "docs/DGCPOS-EDITIONS.md",
    "scripts/assemble-edition.sh",
    "scripts/publish-community.sh",
]

REQUIRED_STUBS = [
    "backend/v2_proxy.py",
    "backend/payment_utils.py",
    "frontend/src/utils/paymentGateways.js",
    "frontend/src/components/pos/PaymentGatewayFlow.jsx",
]


def test_community_export_excludes_enterprise_overlay(tmp_path):
    out = EXPORT_DIR
    if out.exists():
        import shutil

        shutil.rmtree(out)
    subprocess.run([str(EXPORT_SCRIPT), str(out)], cwd=REPO_ROOT, check=True)

    assert (out / "README.md").is_file()
    assert (out / "LICENSE").is_file()
    assert (out / "docs" / "install" / "self-host.md").is_file()
    assert "community" in (out / "backend" / ".env.example").read_text().lower()
    assert "community" in (out / "frontend" / ".env.example").read_text().lower()

    for rel in FORBIDDEN_PATHS:
        assert not (out / rel).exists(), f"forbidden path leaked: {rel}"

    for rel in REQUIRED_STUBS:
        assert (out / rel).is_file(), f"CE stub missing: {rel}"

    payment_utils = (out / "backend" / "payment_utils.py").read_text()
    assert "def gateways_enabled" in payment_utils
    assert "return False" in payment_utils

    v2_proxy = (out / "backend" / "v2_proxy.py").read_text()
    assert "maybe_proxy_v2" in v2_proxy

    migration_0011 = out / "backend/migrations/versions/0011_marketplace_bazaar_category.py"
    if migration_0011.is_file():
        assert 'down_revision = "0009_marketplace_product_link"' in migration_0011.read_text()

    migration_0015 = out / "backend/migrations/versions/0015_user_security_epoch.py"
    if migration_0015.is_file():
        assert 'down_revision = "0013_bazaar_ad_images"' in migration_0015.read_text()