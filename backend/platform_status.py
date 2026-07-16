"""Platform health probes + status aggregation for superadmin Command Center."""
import os
import time
from datetime import datetime
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from platform_modules import get_platform_modules, module_enabled, get_public_platform_status
from maintenance_notify import maintenance_recipient_count

SERVICE_DEFS = [
    {
        "id": "api",
        "label": "API Server",
        "url": "https://api.dgcpos.com/api/health",
        "group": "core",
        "module_key": None,
    },
    {
        "id": "app",
        "label": "RetailOS App",
        "url": "https://app.dgcpos.com/",
        "group": "sites",
        "module_key": "site_app",
    },
    {
        "id": "admin",
        "label": "Command Center",
        "url": "https://admin.dgcpos.com/",
        "group": "sites",
        "module_key": None,
    },
    {
        "id": "marketing",
        "label": "Marketing (dgcpos.com)",
        "url": "https://dgcpos.com/",
        "group": "sites",
        "module_key": "site_marketing",
    },
    {
        "id": "bazaar_page",
        "label": "Bazaar storefront",
        "url": "https://app.dgcpos.com/dgcbazaar.html",
        "group": "marketplace",
        "module_key": "site_bazaar",
    },
    {
        "id": "marketplace_api",
        "label": "Marketplace API",
        "url": "https://api.dgcpos.com/api/marketplace/public/shop-config",
        "group": "marketplace",
        "module_key": "site_bazaar",
    },
]

PROBE_TIMEOUT = float(os.environ.get("PLATFORM_PROBE_TIMEOUT", "8"))


def _probe_url(url: str) -> dict:
    started = time.monotonic()
    try:
        req = Request(url, method="HEAD", headers={"User-Agent": "DGC-Platform-Status/1.0"})
        with urlopen(req, timeout=PROBE_TIMEOUT) as resp:
            code = resp.status
            latency_ms = int((time.monotonic() - started) * 1000)
            if code >= 500:
                return {"status": "error", "http_code": code, "latency_ms": latency_ms, "error": f"HTTP {code}"}
            if code >= 400:
                return {"status": "degraded", "http_code": code, "latency_ms": latency_ms, "error": f"HTTP {code}"}
            return {"status": "up", "http_code": code, "latency_ms": latency_ms}
    except HTTPError as exc:
        latency_ms = int((time.monotonic() - started) * 1000)
        code = exc.code
        if code >= 500:
            st = "error"
        elif code >= 400:
            st = "degraded"
        else:
            st = "up"
        return {"status": st, "http_code": code, "latency_ms": latency_ms, "error": str(exc)}
    except URLError as exc:
        latency_ms = int((time.monotonic() - started) * 1000)
        return {"status": "down", "http_code": None, "latency_ms": latency_ms, "error": str(exc.reason)}
    except Exception as exc:
        latency_ms = int((time.monotonic() - started) * 1000)
        return {"status": "down", "http_code": None, "latency_ms": latency_ms, "error": str(exc)}


def _service_runtime_status(defn: dict, probe: dict) -> str:
    """Human status: running | down | error | disabled | offline."""
    module_key = defn.get("module_key")
    if module_key and not module_enabled(module_key):
        return "offline"
    probe_status = probe.get("status")
    if probe_status == "up":
        return "running"
    if probe_status == "degraded":
        return "degraded"
    if probe_status == "error":
        return "error"
    return "down"


def probe_platform_services():
    results = []
    for defn in SERVICE_DEFS:
        probe = _probe_url(defn["url"])
        runtime = _service_runtime_status(defn, probe)
        results.append({
            "id": defn["id"],
            "label": defn["label"],
            "url": defn["url"],
            "group": defn["group"],
            "module_key": defn.get("module_key"),
            "enabled": module_enabled(defn["module_key"]) if defn.get("module_key") else True,
            "runtime_status": runtime,
            **probe,
        })
    return results


def get_platform_status_report():
    modules = get_platform_modules()
    services = probe_platform_services()
    public = get_public_platform_status()

    module_rows = []
    for key, mod in modules.items():
        linked = [s for s in services if s.get("module_key") == key]
        if linked:
            if not mod["enabled"]:
                runtime = "offline"
            elif any(s["runtime_status"] == "down" for s in linked):
                runtime = "down"
            elif any(s["runtime_status"] == "error" for s in linked):
                runtime = "error"
            elif any(s["runtime_status"] == "degraded" for s in linked):
                runtime = "degraded"
            else:
                runtime = "running"
        else:
            runtime = "offline" if not mod["enabled"] else "running"

        module_rows.append({
            **mod,
            "runtime_status": runtime,
        })

    summary = {
        "running": sum(1 for s in services if s["runtime_status"] == "running"),
        "down": sum(1 for s in services if s["runtime_status"] == "down"),
        "error": sum(1 for s in services if s["runtime_status"] == "error"),
        "degraded": sum(1 for s in services if s["runtime_status"] == "degraded"),
        "offline": sum(1 for s in services if s["runtime_status"] == "offline"),
        "total_services": len(services),
    }

    return {
        "checked_at": datetime.utcnow().isoformat() + "Z",
        "sites": public["sites"],
        "maintenance_message": public.get("maintenance_message"),
        "notify_recipients": maintenance_recipient_count(),
        "modules": {m["key"]: m for m in module_rows},
        "services": services,
        "summary": summary,
    }